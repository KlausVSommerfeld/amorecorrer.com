"""Async pipeline: load case → DeepSeek draft → PDF → Storage → generated_documents → email → dispatch/finish."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel
from supabase import create_client

from config import settings
from hmac_utils import hmac_sha256_hex
from peca import corpo_do_email, montar_peca
from base_legal import cabe_advertencia, carregar_ctb, montar_base
from conferencia import gerar_com_conferencia, resumo_alertas
from velocidade import bloco_velocidade
from pdf_peca import gerar_pdf
from prompt import argumentos_da_chamada, build_case_context, system_prompt, texto_da_resposta
from verificacao import bloco_verificacao

log = logging.getLogger(__name__)


class DispatchPayload(BaseModel):
    case_id: str
    email: str
    dispatch_key: str


def verify_incoming_hmac(body_text: str, signature_header: str | None) -> bool:
    if not settings.pipeline_hmac_secret:
        log.warning("pipeline_hmac_secret empty — rejecting webhook (misconfiguration)")
        return False
    if not signature_header:
        return False
    expected = hmac_sha256_hex(settings.pipeline_hmac_secret, body_text)
    return hmac.compare_digest(signature_header.strip(), expected)


def _compact_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


async def post_signed_internal(
    client: httpx.AsyncClient, path: str, body_obj: dict[str, Any]
) -> dict[str, Any]:
    raw = _compact_json(body_obj)
    sig = hmac_sha256_hex(settings.pipeline_hmac_secret, raw)
    base = settings.express_internal_url.rstrip("/")
    r = await client.post(
        f"{base}{path}",
        content=raw.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Signature": sig,
        },
        timeout=60.0,
    )
    r.raise_for_status()
    return r.json()


async def fetch_case_aggregate(client: httpx.AsyncClient, case_id: str) -> dict[str, Any]:
    msg = f"GET:{case_id}"
    sig = hmac_sha256_hex(settings.pipeline_hmac_secret, msg)
    base = settings.express_internal_url.rstrip("/")
    r = await client.get(
        f"{base}/internal/cases/{case_id}",
        headers={"X-Signature": sig},
        timeout=30.0,
    )
    r.raise_for_status()
    return r.json()


async def notify_finish(
    client: httpx.AsyncClient,
    dispatch_key: str,
    success: bool,
    error_detail: str | None = None,
) -> None:
    body_obj: dict[str, Any] = {
        "dispatch_key": dispatch_key,
        "success": success,
    }
    if error_detail:
        body_obj["error_detail"] = error_detail[:4000]

    raw = _compact_json(body_obj)
    sig = hmac_sha256_hex(settings.pipeline_hmac_secret, raw)
    base = settings.express_internal_url.rstrip("/")
    r = await client.post(
        f"{base}/internal/dispatch/finish",
        content=raw.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Signature": sig,
        },
        timeout=30.0,
    )
    r.raise_for_status()


async def call_deepseek(
    text_context: str, sistema: str | None = None, historico: list[dict[str, str]] | None = None
) -> str:
    if not settings.deepseek_api_key:
        return (
            "[Modo sem IA: defina DEEPSEEK_API_KEY] Rascunho automático indisponível. "
            "Use o campo justificativa do formulário para redigir o recurso."
        )

    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_api_base,
    )
    completion = await client.chat.completions.create(
        **argumentos_da_chamada(
            settings.deepseek_model, sistema or system_prompt(False), text_context, historico
        )
    )
    escolha = completion.choices[0]
    # Vazia ou cortada lança erro: o caso vai a `failed` em vez de o cliente
    # receber um PDF sem peça (antes saía "(resposta vazia do modelo)").
    return texto_da_resposta(escolha.message.content, escolha.finish_reason)


def _message_id_domain(mail_from: str) -> str:
    m = re.search(r"@([^>\s]+)", mail_from)
    return m.group(1) if m else "localhost"


async def send_email_pdf(
    to_email: str,
    pdf_bytes: bytes,
    case_id: str,
    dispatch_key: str,
    corpo: str,
    nome_arquivo: str,
) -> str | None:
    """Returns Message-ID used as provider_message_id when SMTP is configured."""
    if not settings.smtp_host or not settings.mail_from:
        if settings.pipeline_env.lower() == "production":
            raise RuntimeError("SMTP_HOST and MAIL_FROM are required in production")
        log.warning("SMTP not configured - skipping email send in non-production")
        return None

    import aiosmtplib

    msg_id = f"<{uuid.uuid4()}@{_message_id_domain(settings.mail_from)}>"
    msg = EmailMessage()
    msg["Subject"] = settings.mail_subject
    msg["From"] = settings.mail_from
    msg["To"] = to_email
    msg["Message-ID"] = msg_id
    msg["Resend-Idempotency-Key"] = f"dispatch/{case_id}/{dispatch_key}"
    msg.set_content(corpo)
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=nome_arquivo,
    )

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=True,
    )
    return msg_id


def upload_pdf_to_storage(pdf_bytes: bytes, storage_path: str) -> None:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Storage upload"
        )
    supa = create_client(settings.supabase_url, settings.supabase_service_role_key)
    bucket = settings.storage_bucket
    supa.storage.from_(bucket).upload(
        storage_path,
        pdf_bytes,
        file_options={"content-type": "application/pdf", "x-upsert": "true"},
    )


async def run_dispatch_pipeline(body_text: str) -> None:
    """
    submission → dispatch → PDF → storage → generated_documents → email → confirm_dispatch.
    """
    logging.basicConfig(level=logging.INFO)

    payload = DispatchPayload.model_validate(json.loads(body_text))
    dk = payload.dispatch_key

    async with httpx.AsyncClient() as client:
        try:
            agg = await fetch_case_aggregate(client, payload.case_id)
            dispatch = agg.get("dispatch") or {}
            case = agg.get("case") or {}

            if dispatch.get("status") == "sent":
                log.info("dispatch already confirmed sent — skip dispatch_key=%s", dk)
                return

            dispatch_key_row = (dispatch.get("dispatch_key") or "").strip()
            if dispatch_key_row and dispatch_key_row != dk:
                raise RuntimeError(
                    f"dispatch_key mismatch: payload={dk} aggregate={dispatch_key_row}"
                )

            if case.get("document_status") == "completed":
                if dispatch.get("status") != "sent":
                    log.info(
                        "document completed but dispatch row not confirmed — sync finish dispatch_key=%s",
                        dk,
                    )
                    await notify_finish(client, dk, True)
                else:
                    log.info("already completed / sent — skip dispatch_key=%s", dk)
                return

            official_email = (case.get("email") or "").strip().lower()
            if not official_email:
                raise RuntimeError("form_submissions.email missing — cannot send PDF")

            stripe_session_id = case.get("stripe_session_id")
            if stripe_session_id is not None:
                stripe_session_id = str(stripe_session_id)

            context = build_case_context(case, settings.radar_tese_ativa)
            if settings.radar_tese_ativa:
                bloco = bloco_verificacao(case.get("verificacao_medidor"))
                # Só dados do equipamento: nenhum dado pessoal do cliente.
                log.info("verificação do medidor no prompt case_id=%s bloco=%r", payload.case_id, bloco)
            # Base normativa do CTB: sem ela não há peça (BaseLegalIndisponivel → failed).
            ctb = carregar_ctb(settings.ctb_dir)
            base = montar_base(ctb, case.get("amparo_legal"))
            # Enquadramento da velocidade decidido em código (sobre a considerada);
            # sem bloco nos casos neutros — a REGRA_ENQUADRAMENTO protege.
            bloco_vel = bloco_velocidade(case, base.enquadramento)
            inciso = bloco_vel.inciso_da_conta if bloco_vel else None
            advertencia = cabe_advertencia(ctb, base.enquadramento, inciso)
            if advertencia:
                # O pedido cita o art. 267: ele entra na base (spec 2026-10-02, §4.3).
                base = montar_base(ctb, case.get("amparo_legal"), artigos_do_pedido=("267",))
            log.info(
                "base legal case_id=%s ctb_sha256=%s obtido_em=%s enquadramento=%s artigos=%s",
                payload.case_id, base.sha256[:12], base.obtido_em,
                base.enquadramento or "não reconhecido", sorted(base.artigos),
            )
            log.info(
                "velocidade case_id=%s situacao=%s",
                payload.case_id, bloco_vel.situacao if bloco_vel else "nenhuma",
            )
            partes = [context] + ([bloco_vel.texto] if bloco_vel else []) + [base.texto]
            usuario = "\n\n".join(partes)
            # A resposta sobre o condutor nunca vai crua ao modelo: escolhe o texto
            # da regra (spec 2026-10-05). Sem resposta, vale a regra do "não".
            conduzia = case.get("cliente_conduzia")
            log.info(
                "condutor case_id=%s condutor=%s",
                payload.case_id,
                "sim" if conduzia is True else "nao" if conduzia is False else "ausente",
            )
            sistema = system_prompt(
                settings.radar_tese_ativa,
                case.get("verificacao_medidor"),
                sem_enquadramento=base.enquadramento is None,
                cliente_conduzia=conduzia if isinstance(conduzia, bool) else None,
            )

            async def gerar(historico: list[dict[str, str]] | None) -> str:
                return await call_deepseek(usuario, sistema, historico)

            # Citação fora da base: refaz uma vez; de novo → CitacaoForaDaBase → failed.
            draft, conferido, recusas_1a = await gerar_com_conferencia(gerar, base, ctb)
            if recusas_1a:
                log.warning(
                    "peça refeita case_id=%s recusas=%s",
                    payload.case_id, [(r.trecho, r.motivo) for r in recusas_1a],
                )
            if conferido.alertas:
                # O trecho entre aspas pode ser o nome ou a justificativa do cliente:
                # no log vão só a contagem e um hash (spec §5, "log sem dados pessoais").
                log.info("aspas não literais case_id=%s %s", payload.case_id, resumo_alertas(conferido.alertas))

            # A moldura é do código; o modelo escreveu só fatos e fundamentos (spec 2026-10-02).
            peca = montar_peca(
                draft, case, bloco_vel.situacao if bloco_vel else None, inciso, advertencia
            )
            log.info(
                "peca case_id=%s secoes=%d pedido_itens=%d advertencia=%s "
                "pedido_do_modelo_removido=%s frases_do_cliente_removidas=%d",
                payload.case_id, len(peca.secoes), len(peca.pedido),
                "sim" if advertencia else "nao", "sim" if peca.pedido_do_modelo_removido else "nao",
                peca.frases_do_cliente_removidas,
            )
            pdf_bytes = gerar_pdf(peca)
            sha256_hex = hashlib.sha256(pdf_bytes).hexdigest()

            safe_key = re.sub(r"[^a-zA-Z0-9._-]", "_", dk)[:120]
            storage_path = f"{payload.case_id}/{safe_key}.pdf"
            bucket = settings.storage_bucket

            upload_pdf_to_storage(pdf_bytes, storage_path)

            await post_signed_internal(
                client,
                "/internal/generated-documents",
                {
                    "action": "register_pdf",
                    "dispatch_key": dk,
                    "case_id": payload.case_id,
                    "email_to": official_email,
                    "stripe_session_id": stripe_session_id,
                    "storage_bucket": bucket,
                    "storage_path": storage_path,
                    "sha256": sha256_hex,
                },
            )
            log.info("generated_documents registered dispatch_key=%s path=%s", dk, storage_path)

            intro = corpo_do_email({**case, "case_id": payload.case_id})
            msg_id: str | None = None
            email_failed = False
            email_error: str | None = None
            try:
                msg_id = await send_email_pdf(
                    official_email, pdf_bytes, payload.case_id, dk, intro, peca.nome_arquivo
                )
            except Exception as mail_exc:
                email_failed = True
                email_error = str(mail_exc)[:4000]
                log.exception("email send failed dispatch_key=%s", dk)

            sent_iso = datetime.now(timezone.utc).isoformat()

            if email_failed:
                await post_signed_internal(
                    client,
                    "/internal/generated-documents",
                    {
                        "action": "email_result",
                        "dispatch_key": dk,
                        "status": "email_failed",
                        "provider": "smtp",
                        "error_detail": email_error,
                        "sent_at": None,
                    },
                )
                await notify_finish(client, dk, False, error_detail=email_error)
                return

            if msg_id:
                await post_signed_internal(
                    client,
                    "/internal/generated-documents",
                    {
                        "action": "email_result",
                        "dispatch_key": dk,
                        "status": "emailed",
                        "provider": "smtp",
                        "provider_message_id": msg_id,
                        "sent_at": sent_iso,
                    },
                )
            else:
                await post_signed_internal(
                    client,
                    "/internal/generated-documents",
                    {
                        "action": "email_result",
                        "dispatch_key": dk,
                        "status": "email_skipped",
                        "provider": "none",
                        "provider_message_id": None,
                        "sent_at": None,
                    },
                )

            await notify_finish(client, dk, True)
            log.info("pipeline ok case_id=%s dispatch_key=%s", payload.case_id, dk)

        except Exception as e:
            log.exception("pipeline failed dispatch_key=%s", dk)
            try:
                await notify_finish(
                    client,
                    dk,
                    False,
                    error_detail=str(e)[:2000],
                )
            except Exception as finish_err:
                log.error("notify_finish failed: %s", finish_err)
