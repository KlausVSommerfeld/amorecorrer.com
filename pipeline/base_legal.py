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

# Extrator ÚNICO de citações de artigo, usado aqui (remissões) e na
# conferencia.py: duas extrações para a mesma coisa divergiam — esta lia só o
# primeiro número de "arts. 44, 45 e 70" (achado da revisão final).
#
# O sufixo ("-A") vem COLADO ao número: com espaço ou quebra de linha permitidos,
# "art. 270" seguido de uma linha "- Origem…" virava o inexistente "270-O".
_NUM = r"\d+(?!\d)[ \t]*[º°]?(?:-[A-Za-z]\b)?"
# Número seguido de unidade não é artigo: "art. 218, 20% acima", "art. 61, 80 km/h".
_UNIDADE = (
    r"(?!\s*(?:\([^)]{0,20}\)\s*)?"
    r"(?:%|km\b|por\s+cento|dias?\b|meses\b|anos\b|horas?\b|reais\b|R\$|pontos\b|vezes\b))"
)
CITACAO = re.compile(rf"\b(?:arts?\.|artigos?)\s*({_NUM}(?:\s*(?:,|\be\b|\ba\b)\s*{_NUM}{_UNIDADE})*)", re.I)
_UM_NUMERO = re.compile(r"(\d+)[ \t]*[º°]?(?:-([A-Za-z])\b)?")
# "art. 5º da Lei nº …" não é remissão ao CTB. Mas "do Código de Trânsito" e
# "da Lei nº 9.503" SÃO o CTB: pular esses deixaria "art. 999 do Código de
# Trânsito" sem conferência.
OUTRA_NORMA_A_SEGUIR = re.compile(
    r"^[^.;]{0,40}?\b(da|do)\s+"
    r"(lei(?!\s+(?:n[º°o.]*\s*)?9\.?503)|decreto|c[óo]digo(?!\s+de\s+tr[âa]nsito)|constitui[çc][ãa]o)",
    re.I,
)


def numeros_citados(grupo: str) -> list[str]:
    """"44, 45 e 70" → ["44", "45", "70"]; "281-a" → ["281-A"]."""
    return [n.group(1) + (f"-{n.group(2).upper()}" if n.group(2) else "") for n in _UM_NUMERO.finditer(grupo)]


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


# Teto de segurança: medido em 29/09/2026, o fecho das remissões tem mediana de
# 25 artigos por caso e máximo de 45 (arts. 22/24, de competência dos órgãos).
_LIMITE_EXTRAS = 40


def _remissoes(c: Ctb, numero: str) -> list[str]:
    """Artigos que o texto do artigo menciona (sem ele mesmo, só os vigentes)."""
    texto = c.ctb.artigo_md(numero)
    achados: list[str] = []
    for m in CITACAO.finditer(texto):
        if OUTRA_NORMA_A_SEGUIR.match(texto[m.end():]):
            continue
        for bruto in numeros_citados(m.group(1)):
            n = numero_vigente(c, bruto)
            if n and n != numero and n not in achados:
                achados.append(n)
    return achados


def _fecho(c: Ctb, inicio: list[str]) -> list[str]:
    """Segue as remissões até o fim: um artigo citado por outro da base também
    entra com texto. Com um nível só, a base citava artigos que não trazia (o
    rito cita 256/258/259; o 44-A cita 44/45/70) e recusava citação fiel de si
    mesma — achado da revisão final."""
    vistos = list(dict.fromkeys(inicio))
    fila = list(vistos)
    while fila and len(vistos) - len(inicio) < _LIMITE_EXTRAS:
        for n in _remissoes(c, fila.pop(0)):
            if n not in vistos:
                vistos.append(n)
                fila.append(n)
    return vistos


def montar_base(c: Ctb, amparo_legal: str | None) -> BaseLegal:
    processuais = [n for n in c.consulta.PROCESSUAIS_PADRAO if numero_vigente(c, n)]
    enq = _enquadramento(c, amparo_legal)
    citacao, proprio = enq if enq else (None, None)
    tabela = [n for n in EXTRAS_POR_ARTIGO.get(proprio, ()) if numero_vigente(c, n)] if proprio else []
    inicio = ([proprio] if proprio else []) + tabela + processuais
    # O que o rito e o enquadramento já trazem não se repete: o contexto_peticao
    # renderizaria o artigo duas vezes.
    extras = [n for n in _fecho(c, inicio) if n != proprio and n not in processuais]
    texto = c.ctb.contexto_peticao(enquadramentos=[citacao] if citacao else [], extras=extras)
    artigos = frozenset(([proprio] if proprio else []) + extras + processuais)
    return BaseLegal(
        texto=texto,
        artigos=artigos,
        enquadramento=citacao,
        sha256=c.ctb.meta["sha256"],
        obtido_em=str(c.ctb.meta.get("obtido_em", "")),
    )
