"""Conferência das citações da peça contra a base normativa entregue.

Nenhuma citação fora da base chega ao PDF: o que não passa é recusado, e o
worker pede ao modelo uma nova versão (uma vez). Ver a spec
docs/superpowers/specs/2026-09-29-base-legal-ctb-design.md, §4.

Puro, sem dependências fora da stdlib.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from base_legal import CITACAO, OUTRA_NORMA_A_SEGUIR, BaseLegal, Ctb, numeros_citados
from prompt import pedido_de_correcao

# Norma externa. Cada palavra comum exige CONTEXTO JURÍDICO (número, órgão,
# "Federal"…): a peça repete dados do cliente, e "Rua da Constituição", "baixa
# resolução da foto" e "portaria do condomínio" gastavam o único refazer
# (revisão final, 29/09/2026). Só "Lei nº X" tem grupo de captura: a lei que
# aparece na própria base passa (notas "Redação dada pela Lei nº …").
_ORGAO = r"(?:contran|denatran|senatran|inmetro|detran|minist[ée]rio|cetran)"
_EXTERNA = re.compile(
    r"c[óo]digo\s+penal|c[óo]digo\s+civil|c[óo]digo\s+de\s+processo"
    r"|constitui[çc][ãa]o\s+(?:federal|da\s+rep[úu]blica|brasileira|de\s+1988)"
    r"|\bCF/88\b|\bda\s+CF\b"
    rf"|resolu[çc](?:[ãa]o|[õo]es)\s+(?:n[º°o.]*\s*\d|n[úu]mero|\d|d[oa]s?\s+{_ORGAO}|{_ORGAO})"
    rf"|\bres\.\s*(?:{_ORGAO}\s*)?(?:n[º°o.]*\s*)?\d"
    rf"|portarias?\s+(?:n[º°o.]*\s*\d|n[úu]mero|\d|d[oa]s?\s+{_ORGAO}|{_ORGAO})"
    rf"|delibera[çc](?:[ãa]o|[õo]es)\s+(?:n[º°o.]*\s*\d|n[úu]mero|\d|d[oa]s?\s+{_ORGAO}|{_ORGAO})"
    r"|instru[çc][ãa]o\s+normativa|s[úu]mulas?\b|jurisprud[êe]ncia"
    r"|\bdecreto(?:-lei)?\s+(?:n[º°o.]*\s*\d|n[úu]mero|\d|federal|estadual|municipal)"
    r"|\bMBFT\b|manual\s+brasileiro\s+de\s+fiscaliza"
    r"|\b(?:STJ|STF|TST|REsp|AgRg|TJ[A-Z]{2}|TRF\s?\d?)\b|\bac[óo]rd[ãa]os?\b"
    r"|\blei\s+complementar\b"
    r"|\blei\s+(?:federal\s+|estadual\s+|municipal\s+)?(?:(?:n[º°o.]*|n[úu]mero)\s*)?(\d[\d.]*)",
    re.I,
)
# Palavras que completam o nome de uma norma: "Penal", "Federal", "nº 1.234".
_RESTO_DO_NOME = re.compile(r"[^\S\n]*(?:(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú]*|de|da|do|n[º°o.]*|\d[\d./]*)[^\S\n]*){0,4}")
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
    consumidos: list[tuple[int, int]] = []  # trechos já recusados junto com o artigo

    for m in CITACAO.finditer(peca):
        # "art. 24 do Código Penal", "art. 10 da Lei nº 13.103": a citação é da
        # outra norma, não do CTB — conferida à parte, em `externas` (a lei que
        # aparece na própria base passa; as demais são recusadas lá).
        outra = OUTRA_NORMA_A_SEGUIR.match(peca[m.end():])
        if outra:
            # Lei: o número é conferido em `externas`. Código, Constituição e
            # decreto: recusados aqui ("art. 5º, LV, da Constituição").
            if not outra.group(2).lower().startswith("lei"):
                fim = m.end() + outra.end()
                # Completa o nome da norma: "do Código" → "do Código Penal".
                fim += _RESTO_DO_NOME.match(peca[fim:]).end()
                recusas.append(Recusa(peca[m.start():fim].strip(), "norma fora do CTB"))
                consumidos.append((m.start(), fim))
            continue
        if any(ini <= m.end() + _JANELA_EXTERNA and fim > m.start() for ini, fim, _ in externas):
            continue
        for bruto in numeros_citados(m.group(1)):
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
    for ini, _, trecho in externas:
        if any(a <= ini <= b for a, b in consumidos):
            continue  # "Código Penal" já saiu como "art. 24 do Código Penal"
        chave = trecho.lower()
        if chave not in vistos:
            vistos.add(chave)
            recusas.append(Recusa(trecho, "norma fora do CTB"))

    base_norm = _normalizar(base.texto)
    alertas = [q for q in _ASPAS.findall(peca) if _normalizar(q) not in base_norm]
    return Resultado(recusas=recusas, alertas=alertas)


class CitacaoForaDaBase(RuntimeError):
    """Recusada duas vezes: o caso vai a `failed`, sem e-mail ao cliente."""

    def __init__(self, recusas: list[Recusa]):
        self.recusas = recusas
        itens = "; ".join(f"{r.trecho} ({r.motivo})" for r in recusas)
        super().__init__(f"citação fora da base normativa após nova tentativa: {itens}")


async def gerar_com_conferencia(
    gerar: Callable[[list[dict[str, str]] | None], Awaitable[str]],
    base: BaseLegal,
    c: Ctb,
) -> tuple[str, Resultado, list[Recusa]]:
    """Gera, confere e refaz UMA vez. Devolve (peça, resultado final, recusas da 1ª)."""
    peca = await gerar(None)
    primeiro = conferir_citacoes(peca, base, c)
    if not primeiro.recusas:
        return peca, primeiro, []
    historico = [
        {"role": "assistant", "content": peca},
        {"role": "user", "content": pedido_de_correcao(primeiro.recusas)},
    ]
    segunda = await gerar(historico)
    resultado = conferir_citacoes(segunda, base, c)
    if resultado.recusas:
        raise CitacaoForaDaBase(resultado.recusas)
    return segunda, resultado, primeiro.recusas


def resumo_alertas(alertas: list[str]) -> dict[str, object]:
    """Para o log: o trecho entre aspas pode ser o nome ou a justificativa do
    cliente, e o log não leva dado pessoal (spec §5). Vai a contagem e um hash."""
    return {
        "quantidade": len(alertas),
        "hashes": [hashlib.sha256(a.encode("utf-8")).hexdigest()[:12] for a in alertas],
    }

