"""Novas tentativas para falhas passageiras do envio do e-mail.

No teste ponta a ponta de 08/10/2026, uma falha de DNS de um segundo
(`getaddrinfo failed` para smtp.resend.com) levou o caso a `failed` com o PDF
pronto no bucket: o cliente pagou e não recebeu nada. Repetir é seguro porque o
e-mail leva `Resend-Idempotency-Key` (dispatch/case_id/dispatch_key).

Sem dependências: o `worker.py` importa o `aiosmtplib`, este módulo não, para os
testes rodarem fora do venv.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from typing import TypeVar

log = logging.getLogger(__name__)

T = TypeVar("T")

# Esperas entre os envios: três envios no máximo, cerca de 20 s a mais no pior caso.
ESPERAS_DO_EMAIL: tuple[float, ...] = (5.0, 15.0)


def falha_passageira(exc: BaseException) -> bool:
    """Rede, DNS e tempo esgotado (`OSError`: as exceções de conexão e de timeout
    do `aiosmtplib` herdam dele) e respostas SMTP 4xx. Resposta 5xx (destinatário
    recusado, autenticação) e SMTP não configurado são permanentes."""
    if isinstance(exc, OSError):
        return True
    codigo = getattr(exc, "code", None)
    return isinstance(codigo, int) and 400 <= codigo < 500


async def com_novas_tentativas(
    operacao: Callable[[], Awaitable[T]],
    *,
    esperas: Sequence[float] = ESPERAS_DO_EMAIL,
    dormir: Callable[[float], Awaitable[None]] = asyncio.sleep,
    rotulo: str = "",
) -> T:
    """Roda `operacao`; numa falha passageira espera e repete, uma vez por espera.
    Falha permanente, ou a última tentativa, sobe a exceção como veio."""
    for tentativa, espera in enumerate([*esperas, None], start=1):
        try:
            return await operacao()
        except Exception as exc:
            if espera is None or not falha_passageira(exc):
                raise
            log.warning(
                "falha passageira %s tentativa=%d nova_tentativa_em=%.0fs erro=%s",
                rotulo, tentativa, espera, exc,
            )
            await dormir(espera)
    raise AssertionError("inalcançável")
