"""Async pipeline: load case → DeepSeek draft → PDF → Storage → generated_documents → email → dispatch/finish."""

from __future__ import annotations

import hashlib
import hmac
import io
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


async def call_deepseek(text_context: str) -> str:
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
        model=settings.deepseek_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
                    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
                    "Não invente dados ausentes. Produza 2 a 4 parágrafos."
                ),
            },
            {
                "role": "user",
                "content": text_context,
            },
        ],
        max_tokens=1200,
        temperature=0.4,
    )
    choice = completion.choices[0].message.content
    return (choice or "").strip() or "(resposta vazia do modelo)"


# Campos de controle interno. O read model do Express faz `select("*")`, então a
# linha inteira chegava ao prompt — inclusive o `dup_guard` (hash de 64
# caracteres), o `form_token` e os uuids. Nada disso tem papel numa peça
# jurídica, e tudo compete por atenção com os dados que têm.
#
# `created_at` e `updated_at` saem por um motivo a mais: são `timestamptz` em
# UTC, e a IA lia "10/09" num caso protocolado às 22h do dia 9 em BRT. É o mesmo
# erro de fuso que o front já havia corrigido do lado da data da infração.
# Como nenhum dos dois entra no recurso, saem inteiros em vez de convertidos.
CAMPOS_INTERNOS = frozenset(
    {
        "id",
        "case_id",
        "form_token",
        "dup_guard",
        "document_status",
        "document_url",
        "stripe_session_id",
        "created_at",
        "updated_at",
    }
)


def build_case_context(case: dict[str, Any]) -> str:
    lines = [
        f"{k}: {v}"
        for k, v in sorted(case.items())
        if k not in CAMPOS_INTERNOS and v is not None and str(v).strip()
    ]
    return "Dados do caso para o recurso:\n" + "\n".join(lines[:200])


def build_pdf_bytes(title: str, body_text: str) -> bytes:
    import html

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=title[:80])
    styles = getSampleStyleSheet()
    story: list = [Paragraph(html.escape(title), styles["Title"]), Spacer(1, 12)]
    for para in body_text.split("\n\n"):
        story.append(Paragraph(html.escape(para), styles["BodyText"]))
        story.append(Spacer(1, 8))
    doc.build(story)
    return buf.getvalue()


def _message_id_domain(mail_from: str) -> str:
    m = re.search(r"@([^>\s]+)", mail_from)
    return m.group(1) if m else "localhost"


async def send_email_pdf(
    to_email: str,
    pdf_bytes: bytes,
    case_id: str,
    dispatch_key: str,
    body_intro: str,
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
    msg.set_content(
        body_intro
        + f"\n\nIdentificação do caso: {case_id}\n"
          "Segue em anexo o PDF com o texto produzido."
    )
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=f"recurso-{case_id}.pdf",
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

            context = build_case_context(case)
            draft = await call_deepseek(context)

            pdf_title = f"Recurso — {payload.case_id}"
            pdf_body = (
                "Rascunho gerado para apreciação. Revise antes de protocolar.\n\n"
                f"{draft}"
            )
            pdf_bytes = build_pdf_bytes(pdf_title, pdf_body)
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

            intro = (
                "Olá,\n\n"
                "Este é um e-mail automático com o rascunho do seu recurso de multa em anexo.\n\n"
                "Cordialmente,\nAmo Recorrer"
            )
            msg_id: str | None = None
            email_failed = False
            email_error: str | None = None
            try:
                msg_id = await send_email_pdf(
                    official_email, pdf_bytes, payload.case_id, dk, intro
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
