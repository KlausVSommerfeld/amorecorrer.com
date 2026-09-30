"""Conferência das citações da peça contra a base normativa entregue.

Nenhuma citação fora da base chega ao PDF: o que não passa é recusado, e o
worker pede ao modelo uma nova versão (uma vez). Ver a spec
docs/superpowers/specs/2026-09-29-base-legal-ctb-design.md, §4.

Puro, sem dependências fora da stdlib.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from base_legal import BaseLegal, Ctb

# Sufixo ("-A") colado ao número: com espaço permitido, "art. 280 - A infração"
# virava "280-A" (mesmo defeito achado na remissão da base_legal).
_NUM = r"\d+[ \t]*[º°]?(?:-[A-Za-z]\b)?"
_CITACAO = re.compile(rf"\b(?:arts?\.|artigos?)\s*({_NUM}(?:\s*(?:,|\be\b|\ba\b)\s*{_NUM})*)", re.I)
_UM_NUMERO = re.compile(r"(\d+)[ \t]*[º°]?(?:-([A-Za-z])\b)?")
_EXTERNA = re.compile(
    r"c[óo]digo\s+penal|c[óo]digo\s+civil|c[óo]digo\s+de\s+processo|constitui[çc][ãa]o|\bCF(?:/88)?\b"
    r"|resolu[çc](?:[ãa]o|[õo]es)|portarias?|delibera[çc](?:[ãa]o|[õo]es)|instru[çc][ãa]o\s+normativa"
    r"|s[úu]mulas?|jurisprud[êe]ncia|\bdecreto\b"
    r"|\blei\s+(?:federal\s+)?n[º°o.]*\s*(\d[\d.]*)",
    re.I,
)
_ASPAS = re.compile(r"[“\"]([^”\"]{25,})[”\"]")
_JANELA_EXTERNA = 60


@dataclass(frozen=True)
class Recusa:
    trecho: str
    motivo: str


@dataclass(frozen=True)
class Resultado:
    recusas: list[Recusa] = field(default_factory=list)
    alertas: list[str] = field(default_factory=list)


def _normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _so_digitos(s: str) -> str:
    return re.sub(r"\D", "", s)


def _leis_da_base(base: BaseLegal) -> set[str]:
    # A base traz notas como "(Redação dada pela Lei nº 11.334, de 2006)": repetir não é citar lei externa.
    return {_so_digitos(m.group(1)) for m in re.finditer(r"Lei\s+n[º°o.]*\s*(\d[\d.]*)", base.texto, re.I)}


def _externas(peca: str, base: BaseLegal) -> list[tuple[int, int, str]]:
    permitidas = _leis_da_base(base) | {"9503"}
    achados = []
    for m in _EXTERNA.finditer(peca):
        if m.group(1) is not None and _so_digitos(m.group(1)) in permitidas:
            continue
        achados.append((m.start(), m.end(), m.group(0)))
    return achados


def conferir_citacoes(peca: str, base: BaseLegal, c: Ctb) -> Resultado:
    recusas: list[Recusa] = []
    externas = _externas(peca, base)
    ja = set()

    for m in _CITACAO.finditer(peca):
        # "art. 24 do Código Penal": a citação é da outra norma, não do CTB.
        if any(0 <= ini - m.end() <= _JANELA_EXTERNA for ini, _, _ in externas):
            continue
        for n in _UM_NUMERO.finditer(m.group(1)):
            bruto = n.group(1) + (f"-{n.group(2).upper()}" if n.group(2) else "")
            if bruto in ja:
                continue
            ja.add(bruto)
            try:
                artigo = c.ctb.artigo(bruto)
            except (KeyError, ValueError):
                recusas.append(Recusa(f"art. {bruto}", "não existe no CTB"))
                continue
            numero = artigo["numero"]
            if numero in base.artigos:
                continue
            if artigo.get("status") != "vigente":
                recusas.append(Recusa(f"art. {numero}", f"dispositivo {artigo.get('status')}"))
            else:
                recusas.append(Recusa(f"art. {numero}", "não consta da base normativa fornecida"))

    vistos = set()
    for _, _, trecho in externas:
        chave = trecho.lower()
        if chave not in vistos:
            vistos.add(chave)
            recusas.append(Recusa(trecho, "norma fora do CTB"))

    base_norm = _normalizar(base.texto)
    alertas = [q for q in _ASPAS.findall(peca) if _normalizar(q) not in base_norm]
    return Resultado(recusas=recusas, alertas=alertas)
