"""Base normativa do CTB que acompanha toda peça.

O pipeline não cita o CTB de memória: cada caso recebe o texto oficial dos
artigos que pode citar, montado a partir de CTB-compilado_files/ (parser e
consulta do Klaus, sobre o compilado do Planalto). Ver a spec
docs/superpowers/specs/2026-09-29-base-legal-ctb-design.md.

Puro e sem dependências fora da stdlib: testável fora do venv de Windows.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import ModuleType
from typing import Any

# Aprovado pelo Klaus: só entra item novo com aprovação dele.
EXTRAS_POR_ARTIGO: dict[str, tuple[str, ...]] = {
    "218": ("61",),  # multa de velocidade → limites de velocidade por tipo de via
}

# O sufixo ("-A") vem COLADO ao número: com espaço ou quebra de linha permitidos,
# "art. 270" seguido de uma linha "- Origem…" virava o inexistente "270-O".
_REMISSAO = re.compile(r"\barts?\.\s*(\d+)[ \t]*[º°]?(-[A-Za-z]\b)?", re.I)
# "art. 5º da Lei nº …" não é remissão ao CTB.
_OUTRA_NORMA_A_SEGUIR = re.compile(r"^[^.;]{0,40}?\b(da|do)\s+(lei|decreto|c[óo]digo|constitui)", re.I)


class BaseLegalIndisponivel(RuntimeError):
    """Sem base do CTB não há peça: o caso vai a `failed`."""


@dataclass(frozen=True)
class Ctb:
    consulta: ModuleType
    ctb: Any  # consulta.CTB


@dataclass(frozen=True)
class BaseLegal:
    texto: str
    artigos: frozenset[str]
    enquadramento: str | None
    sha256: str
    obtido_em: str


@lru_cache(maxsize=4)
def carregar_ctb(ctb_dir: str) -> Ctb:
    """Uma vez por processo. Exceção não entra no cache do lru_cache."""
    raiz = Path(ctb_dir)
    modulo, dados = raiz / "consulta.py", raiz / "saida" / "ctb.json"
    if not modulo.is_file() or not dados.is_file():
        raise BaseLegalIndisponivel(
            f"base do CTB ausente em {raiz} (esperado consulta.py e saida/ctb.json)"
        )
    nome = f"consulta_ctb_{abs(hash(str(raiz.resolve())))}"
    spec = importlib.util.spec_from_file_location(nome, modulo)
    consulta = importlib.util.module_from_spec(spec)
    sys.modules[nome] = consulta  # dataclasses do consulta.py exigem o módulo registrado
    spec.loader.exec_module(consulta)
    try:
        ctb = consulta.CTB.carregar(dados)
    except (ValueError, KeyError) as e:  # JSONDecodeError é ValueError
        raise BaseLegalIndisponivel(f"{dados} inválido: {e}") from e
    if not ctb.meta.get("sha256"):
        raise BaseLegalIndisponivel(f"{dados} sem meta.sha256 — rode o parser de novo")
    return Ctb(consulta=consulta, ctb=ctb)


def numero_vigente(c: Ctb, numero: str) -> str | None:
    try:
        artigo = c.ctb.artigo(numero)
    except (KeyError, ValueError):
        return None
    return artigo["numero"] if artigo.get("status") == "vigente" else None


def _enquadramento(c: Ctb, amparo_legal: str | None) -> tuple[str, str] | None:
    """(citação, número do artigo) do dispositivo vigente, ou None — nada é adivinhado."""
    if not amparo_legal or not str(amparo_legal).strip():
        return None
    try:
        artigo, disp = c.ctb.dispositivo(c.consulta.parse_ref(str(amparo_legal)))
    except (c.consulta.ReferenciaInvalida, KeyError, ValueError):
        return None
    if disp.get("status") != "vigente" or artigo.get("status") != "vigente":
        return None
    return disp["citacao"], artigo["numero"]


def _remissoes(c: Ctb, citacao: str, proprio: str) -> list[str]:
    """Artigos que o dispositivo enquadrado (e a sanção dele) mencionam. Um nível só."""
    texto = c.ctb.dispositivo_md(citacao)
    achados: list[str] = []
    for m in _REMISSAO.finditer(texto):
        if _OUTRA_NORMA_A_SEGUIR.match(texto[m.end():]):
            continue
        n = numero_vigente(c, m.group(1) + (m.group(2) or "").upper())
        if n and n != proprio and n not in achados:
            achados.append(n)
    return achados


def montar_base(c: Ctb, amparo_legal: str | None) -> BaseLegal:
    processuais = [n for n in c.consulta.PROCESSUAIS_PADRAO if numero_vigente(c, n)]
    enq = _enquadramento(c, amparo_legal)
    citacao, proprio = enq if enq else (None, None)
    extras: list[str] = []
    if proprio:
        extras = _remissoes(c, citacao, proprio)
        extras += [n for n in EXTRAS_POR_ARTIGO.get(proprio, ()) if numero_vigente(c, n)]
    # Fora o que o rito já traz: o contexto_peticao repetiria o artigo.
    extras = [n for n in dict.fromkeys(extras) if n not in processuais]
    texto = c.ctb.contexto_peticao(enquadramentos=[citacao] if citacao else [], extras=extras)
    artigos = frozenset(([proprio] if proprio else []) + extras + processuais)
    return BaseLegal(
        texto=texto,
        artigos=artigos,
        enquadramento=citacao,
        sha256=c.ctb.meta["sha256"],
        obtido_em=str(c.ctb.meta.get("obtido_em", "")),
    )
