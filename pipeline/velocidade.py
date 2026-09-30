"""O enquadramento da velocidade, decidido em código.

Em 29/09/2026 a IA fez a conta sobre a velocidade aferida (97 num limite de 80
= 21,25%) e sustentou o inciso II do art. 218 — mais grave — contra o cliente.
O enquadramento sai da velocidade CONSIDERADA (a medida menos a tolerância),
impressa no auto. Aqui o código faz a conta e só devolve bloco quando os
números do próprio auto favorecem o cliente; nos casos neutros, silêncio (a
lição do radar: um bloco dizendo "não discuta" fez o modelo discutir).
A tolerância NÃO é calculada: vem de resolução do CONTRAN não conferida.

Spec: docs/superpowers/specs/2026-09-30-velocidade-considerada-design.md.
Puro, sem dependências fora da stdlib.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from typing import Any

_GRAVIDADE = {"I": 1, "II": 2, "III": 3}
_ENQUADRAMENTO_218 = re.compile(r"^art\.\s*218(?:,\s*(III|II|I))?$", re.I)


@dataclass(frozen=True)
class Bloco:
    texto: str
    situacao: str  # "sem_infracao" | "desclassificacao"


def _inteiro(valor: Any) -> int | None:
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor if valor > 0 else None
    if isinstance(valor, str) and valor.strip().isdigit():
        n = int(valor.strip())
        return n if n > 0 else None
    return None


def _excesso(permitida: int, considerada: int) -> Fraction:
    return Fraction(considerada - permitida, permitida) * 100


def inciso_pela_velocidade(permitida: int, considerada: int) -> str | None:
    """Limites do texto do art. 218: I até 20%; II acima de 20% até 50%; III acima de 50%."""
    excesso = _excesso(permitida, considerada)
    if excesso <= 0:
        return None
    if excesso <= 20:
        return "I"
    if excesso <= 50:
        return "II"
    return "III"


def _percentual(excesso: Fraction) -> str:
    valor = (Decimal(excesso.numerator) / Decimal(excesso.denominator)).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP
    )
    return f"{valor}".replace(".", ",") + "%"


def bloco_velocidade(case: dict[str, Any], enquadramento: str | None) -> Bloco | None:
    m = _ENQUADRAMENTO_218.match((enquadramento or "").strip())
    if not m:
        return None
    permitida = _inteiro(case.get("velocidade_permitida"))
    considerada = _inteiro(case.get("velocidade_considerada"))
    if permitida is None or considerada is None:
        return None
    aferida = _inteiro(case.get("velocidade_aferida"))
    if aferida is not None and considerada > aferida:
        return None  # impossível num auto real: não se confia no número

    cabecalho = "Enquadramento da velocidade (conta feita a partir dos números do auto):"
    pela_conta = inciso_pela_velocidade(permitida, considerada)
    if pela_conta is None:
        return Bloco(
            situacao="sem_infracao",
            texto=(
                f"{cabecalho}\n"
                f"- Velocidade considerada no auto: {considerada} km/h; máxima permitida: {permitida} km/h.\n"
                "- Os próprios números do auto não mostram excesso de velocidade.\n"
                "Instrução para a redação: Requeira o arquivamento do auto de infração por "
                "inconsistência, nos termos do art. 281, § 1º, I, do CTB, porque a velocidade "
                "considerada no próprio auto não supera a máxima permitida. Não calcule percentuais."
            ),
        )

    do_auto = (m.group(1) or "").upper()
    if do_auto and _GRAVIDADE[do_auto] > _GRAVIDADE[pela_conta]:
        pct = _percentual(_excesso(permitida, considerada))
        return Bloco(
            situacao="desclassificacao",
            texto=(
                f"{cabecalho}\n"
                f"- Velocidade considerada de {considerada} km/h sobre a máxima de {permitida} km/h: "
                f"excesso de {pct}, que corresponde ao inciso {pela_conta} do art. 218.\n"
                f"- O auto enquadrou a conduta no inciso {do_auto} do art. 218.\n"
                f"Instrução para a redação: Requeira a desclassificação da infração para o inciso "
                f"{pela_conta} do art. 218 e, subsidiariamente, o arquivamento do auto por "
                "inconsistência (art. 281, § 1º, I). Não calcule outros percentuais."
            ),
        )
    return None
