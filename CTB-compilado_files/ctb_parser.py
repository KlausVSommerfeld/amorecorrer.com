#!/usr/bin/env python3
"""
ctb_parser.py — Converte o HTML compilado do CTB (Lei nº 9.503/1997, planalto.gov.br)
em saídas estruturadas para consulta por IA.

Requisitos: Python >= 3.10, beautifulsoup4, lxml.

Uso:
    python ctb_parser.py l9503compilado.htm --out saida/

Saídas (em --out):
    ctb.json            estrutura completa (artigos → dispositivos → notas) + metadados
    ctb.md              texto limpo em Markdown (vigente + marcações de revogado/vetado)
    ctb_chunks.jsonl    1 chunk por artigo / definição (para RAG ou busca por id)
    ctb_infracoes.json  índice de infrações (dispositivo, conduta, natureza, penalidade, medida)
    ctb_definicoes.json Anexo I (termo → definição)

Observação: o "compilado" do Planalto traz apenas a redação ATUAL. Redações anteriores
não estão no arquivo; as notas ("Redação dada pela Lei nº ...") indicam quando houve
alteração — a IA deve conferir a data da infração contra a vigência da alteração.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

log = logging.getLogger("ctb_parser")

FONTE_URL = "https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm"

# --------------------------------------------------------------------------- #
# Regex
# --------------------------------------------------------------------------- #
DASH = r"[-–—]"
ORD = r"(?:º|°|o(?=\W))"  # "1º", "1°", "1o " (o ordinal só se seguido de não-letra)

ART_RE = re.compile(rf"^Art\.?\s*(\d+)\s*{ORD}?\s*(?:{DASH}\s*([A-Z]{{1,2}}))?\s*\.?\s*(.*)$", re.S)
PAR_RE = re.compile(
    rf"^(?:§\s*(\d+)\s*{ORD}?\s*(?:{DASH}\s*([A-Z]))?\s*\.?|(Parágrafo\s+único)\s*[.:\-–]?)\s*(.*)$", re.S
)
INC_RE = re.compile(rf"^([IVXLC]+)\s*(?:-([A-Z]))?\s*{DASH}\s*(.*)$", re.S)
ALI_RE = re.compile(r"^([a-z])(?:-([a-zA-Z]))?\s*\)\s*(.*)$", re.S)
ITEM_RE = re.compile(rf"^(\d+)\s*(?:\.|{DASH})\s+(.*)$", re.S)
SANC_RE = re.compile(
    rf"^(Infração|Penalidades?|Medidas?\s+administrativas?|Penas?)\s*{DASH}\s*(.*)$", re.S | re.I
)
HEAD_RE = re.compile(r"^(CAPÍTULO|Capítulo|SEÇÃO|Seção|Subseção|SUBSEÇÃO|TÍTULO)\s+([IVXLC]+(?:-[A-Z])?)\b\s*(.*)$", re.S)
ANEXO_RE = re.compile(r"^ANEXO\s+([IVX]+)\b\s*(.*)$", re.S)
DEF_RE = re.compile(rf"^([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9 ,.'/()]*?)\s*{DASH}\s+(.+)$", re.S)
DEF_COLADA_RE = re.compile(r"(?<=[.;:])\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9\- ]{2,}?)\s*[-–—]\s+")
FECHO_RE = re.compile(r"^Brasília,\s")

# Nota de alteração/remissão: texto entre parênteses iniciando por estes termos
NOTE_START = (
    r"Redação\s+dada|Redação|Incluíd[oa]s?|Incluid[oa]s?|Acrescid[oa]s?|Revogad[oa]s?|Renumerad[oa]s?|"
    r"Vide|Vigência|Regulamento|Regulamentação|Produção\s+de\s+efeitos?|Promulgação|Revigorad[oa]|"
    r"Convertid[oa]|Declarad[oa]|Suspens[oa]|Mensagem\s+de\s+veto|Vetad[oa]\s+pelo|Execução\s+suspensa|"
    r"Parte\s+promulgada|Promulgad[oa]"
)
NOTE_ANCHOR_RE = re.compile(rf"^\(?\s*(?:{NOTE_START})\b", re.I)
# Nota em texto corrido (sem link). Sensível a maiúscula para não capturar "(revogado);" de conteúdo.
NOTE_TEXT_RE = re.compile(
    r"\((?:Redação\s+dada|Incluíd[oa]|Incluído|Acrescid[oa]|Revogad[oa]|Renumerad[oa]|Vide|Vigência|"
    r"Regulamento|Produção\s+de\s+efeito)[^()]*(?:\([^()]*\)[^()]*)*\)"
)
VIG_ENCERRADA_RE = re.compile(r"\bVigência\s+encerrada\b", re.I)
REVOGADO_BODY_RE = re.compile(r"^\(?\s*revogad[oa]s?\s*\.?\)?\s*[;.,]?$", re.I)
VETADO_BODY_RE = re.compile(r"^\(?\s*vetad[oa]s?\s*\)?\s*[;.,]?$", re.I)

ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman_to_int(s: str) -> int:
    total, prev = 0, 0
    for ch in reversed(s):
        v = ROMAN[ch]
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total


def ordinal(n: str) -> str:
    """'1' -> '1º' … '9' -> '9º', '10' -> '10'. Aceita sufixo '-A'."""
    base, _, suf = n.partition("-")
    out = f"{base}º" if base.isdigit() and int(base) < 10 else base
    return f"{out}-{suf}" if suf else out


def norm_ws(s: str) -> str:
    s = s.replace("\xa0", " ").replace("​", "")
    return re.sub(r"\s+", " ", s).strip()


# --------------------------------------------------------------------------- #
# Modelo
# --------------------------------------------------------------------------- #
@dataclass
class Nota:
    texto: str
    tipo: str
    url: Optional[str] = None
    sem_efeito: bool = False  # anotação riscada no original (ex.: MP que perdeu eficácia)


@dataclass
class Dispositivo:
    id: str
    tipo: str  # caput | paragrafo | inciso | alinea | item | sancao | texto
    rotulo: str  # como aparece no texto: "III", "§ 1º", "a)", "Infração"
    citacao: str  # "art. 218, III"
    texto: str  # texto limpo (sem notas)
    status: str = "vigente"  # vigente | revogado | vetado | sem_efeito
    notas: list[Nota] = field(default_factory=list)
    sancao: Optional[str] = None  # infracao | penalidade | medida_administrativa | penas


@dataclass
class Artigo:
    id: str
    numero: str
    rotulo: str
    capitulo: Optional[str]
    secao: Optional[str]
    status: str
    dispositivos: list[Dispositivo] = field(default_factory=list)


@dataclass
class Linha:
    texto: str
    notas: list[Nota]
    descartado_riscado: str = ""
    links: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Extração de linhas do HTML
# --------------------------------------------------------------------------- #
def decode_html(raw: bytes) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def tipo_nota(txt: str) -> str:
    t = txt.lower()
    for chave, tipo in (
        ("redação", "redacao"),
        ("incluíd", "inclusao"),
        ("incluid", "inclusao"),
        ("acrescid", "inclusao"),
        ("revogad", "revogacao"),
        ("renumerad", "renumeracao"),
        ("vide", "vide"),
        ("vigência", "vigencia"),
        ("regulament", "regulamento"),
        ("produção de efeito", "vigencia"),
    ):
        if chave in t:
            return tipo
    return "outro"


def _is_struck(tag: Tag) -> bool:
    if tag.name in ("strike", "del"):
        return True
    style = (tag.get("style") or "").replace(" ", "").lower()
    return "line-through" in style


BLOCK_TAGS = {
    "p", "div", "center", "table", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "ul", "ol", "blockquote", "body", "dl", "dt", "dd", "hr",
}


def _tokens(node: Tag, struck: bool = False) -> Iterator[tuple]:
    """Lineariza o documento em ordem. Blocos viram quebras de linha ('br'), o que
    torna a extração imune a <p> malformado (ex.: '<p></font>§ 2º ...' do Planalto,
    em que o texto fica fora do <p> após o parse)."""
    for ch in node.children:
        if isinstance(ch, Comment):
            continue
        if isinstance(ch, NavigableString):
            yield ("text", str(ch), struck)
            continue
        if not isinstance(ch, Tag) or ch.name in ("script", "style", "head", "title"):
            continue
        if ch.name == "br":
            yield ("br",)
            continue
        bloco = ch.name in BLOCK_TAGS
        if bloco:
            yield ("br",)
        s = struck or _is_struck(ch)
        if ch.name == "a":
            txt = norm_ws(ch.get_text())
            if txt and NOTE_ANCHOR_RE.match(txt):
                yield ("note", txt, ch.get("href"), s)
                continue
            if ch.get("href"):
                yield ("link", ch.get("href"))
        yield from _tokens(ch, s)
        if bloco:
            yield ("br",)


def linhas_do_documento(root: Tag) -> list[Linha]:
    linhas: list[Linha] = []
    buf: list[str] = []
    riscado: list[str] = []
    notas: list[Nota] = []
    links: list[str] = []

    def flush():
        texto = norm_ws("".join(buf))
        # "Vigência encerrada" em texto corrido: marca notas riscadas da linha
        if VIG_ENCERRADA_RE.search(texto):
            texto = norm_ws(VIG_ENCERRADA_RE.sub("", texto))
        # notas em texto corrido (sem link)
        for m in NOTE_TEXT_RE.findall(texto):
            notas.append(Nota(texto=norm_ws(m), tipo=tipo_nota(m)))
        texto = norm_ws(NOTE_TEXT_RE.sub("", texto))
        texto = re.sub(r"\s+([;.,:])", r"\1", texto)
        if texto or notas:
            linhas.append(
                Linha(texto=texto, notas=list(notas), descartado_riscado=norm_ws("".join(riscado)), links=list(links))
            )
        buf.clear()
        riscado.clear()
        notas.clear()
        links.clear()

    for tok in _tokens(root):
        if tok[0] == "br":
            flush()
        elif tok[0] == "text":
            (riscado if tok[2] else buf).append(tok[1])
        elif tok[0] == "link":
            links.append(tok[1])
        else:
            _, txt, href, s = tok
            notas.append(Nota(texto=txt if txt.startswith("(") else txt, tipo=tipo_nota(txt), url=href, sem_efeito=s))
            buf.append(" ")
    flush()
    return linhas


# --------------------------------------------------------------------------- #
# Parser estrutural
# --------------------------------------------------------------------------- #
class CTBParser:
    def __init__(self) -> None:
        self.meta: dict = {}
        self.artigos: list[Artigo] = []
        self.definicoes: list[dict] = []
        self.anexos: list[dict] = []
        self.infracoes: list[dict] = []
        self.warnings: list[str] = []
        self.capitulo: Optional[str] = None
        self.secao: Optional[str] = None
        self._pending_heading: Optional[str] = None  # "capitulo" | "secao" aguardando nome
        self.modo = "preambulo"  # preambulo | artigos | fecho | anexo_I | anexo_outro
        self.art: Optional[Artigo] = None
        # contexto de hierarquia dentro do artigo
        self.par: Optional[Dispositivo] = None
        self.inc: Optional[Dispositivo] = None
        self.ali: Optional[Dispositivo] = None
        self.last: Optional[Dispositivo] = None
        # agrupamento conduta → sanção
        self._pendentes: list[Dispositivo] = []
        self._bloco_sancao: Optional[dict] = None
        self._ultimo_foi_sancao = False

    # ---------------- helpers ---------------- #
    @staticmethod
    def _status(corpo: str, notas: list[Nota]) -> str:
        efetivas = [n for n in notas if not n.sem_efeito]
        if VETADO_BODY_RE.match(corpo):
            return "vetado"
        if REVOGADO_BODY_RE.match(corpo):
            return "revogado"
        if not corpo:
            if any(n.tipo == "revogacao" for n in efetivas):
                return "revogado"
            origem = [n for n in notas if n.tipo in ("inclusao", "redacao")]
            if origem and all(n.sem_efeito for n in origem):
                return "sem_efeito"  # incluído por MP que perdeu a eficácia
            return "revogado" if any(n.tipo == "revogacao" for n in notas) else "vazio"
        return "vigente"

    def _cit(self, *partes: str) -> str:
        assert self.art is not None
        base = f"art. {ordinal(self.art.numero)}"
        return ", ".join([base, *[p for p in partes if p]])

    def _add(self, d: Dispositivo) -> Dispositivo:
        assert self.art is not None
        # marcadores vazios deixados no HTML (ex.: "I - " sem texto nem nota) são
        # substituídos pelo dispositivo real de mesmo id que aparecer depois
        vazio = next((x for x in self.art.dispositivos if x.id == d.id and _descartavel(x)), None)
        if vazio is not None:
            self.art.dispositivos.remove(vazio)
            self.warnings.append(f"marcador vazio substituído: {d.id}")
        ids = {x.id for x in self.art.dispositivos}
        if d.id in ids:  # colisão (ex.: incisos repetidos por erro no original)
            k = 2
            while f"{d.id}~{k}" in ids:
                k += 1
            self.warnings.append(f"id duplicado {d.id} → {d.id}~{k}")
            d.id = f"{d.id}~{k}"
        self.art.dispositivos.append(d)
        self.last = d
        return d

    # ---------------- cabeçalhos ---------------- #
    def _heading(self, m: re.Match, linha: Linha) -> None:
        kind, num, resto = m.group(1).lower(), m.group(2), norm_ws(m.group(3))
        rot = f"{'CAPÍTULO' if kind.startswith('cap') else 'Seção' if kind.startswith('se') else m.group(1)} {num}"
        if kind.startswith("cap") or kind.startswith("tít"):
            self.capitulo = f"{rot} — {resto}" if resto else rot
            self.secao = None
            self._pending_heading = None if resto else "capitulo"
        else:
            self.secao = f"{rot} — {resto}" if resto else rot
            self._pending_heading = None if resto else "secao"
        if self.modo == "preambulo":
            self.modo = "artigos"

    def _heading_name(self, texto: str) -> bool:
        if not self._pending_heading or not texto:
            return False
        if self._pending_heading == "capitulo":
            self.capitulo = f"{self.capitulo} — {texto}"
        else:
            self.secao = f"{self.secao} — {texto}"
        self._pending_heading = None
        return True

    # ---------------- artigos ---------------- #
    def _fechar_artigo(self) -> None:
        if self.art is None:
            return
        for x in [x for x in self.art.dispositivos if x.tipo != "caput" and _descartavel(x)]:
            self.art.dispositivos.remove(x)
            self.warnings.append(f"marcador vazio removido: {x.id}")
        caput = next((d for d in self.art.dispositivos if d.tipo == "caput"), None)
        self.art.status = caput.status if caput else "vazio"
        self.artigos.append(self.art)
        self.art = None

    def _novo_artigo(self, m: re.Match, linha: Linha) -> None:
        self._fechar_artigo()
        numero = m.group(1) + (f"-{m.group(2)}" if m.group(2) else "")
        corpo = norm_ws(m.group(3))
        self.art = Artigo(
            id=f"art-{numero}",
            numero=numero,
            rotulo=f"Art. {ordinal(numero)}",
            capitulo=self.capitulo,
            secao=self.secao,
            status="vigente",
        )
        self.par = self.inc = self.ali = None
        self._pendentes, self._bloco_sancao, self._ultimo_foi_sancao = [], None, False
        self._pending_heading = None
        d = self._add(
            Dispositivo(
                id=f"{self.art.id}.caput",
                tipo="caput",
                rotulo=self.art.rotulo,
                citacao=self._cit(),
                texto=corpo,
                status=self._status(corpo, linha.notas),
                notas=linha.notas,
            )
        )
        self._pendentes = []
        self._caput = d

    def _conduta(self, d: Dispositivo) -> None:
        """Registra dispositivo que pode receber sanção (inciso/alínea/parágrafo)."""
        if self._ultimo_foi_sancao:
            self._pendentes = []
        self._ultimo_foi_sancao = False
        if d.tipo in ("inciso", "alinea", "item", "paragrafo"):
            self._pendentes.append(d)

    def _sancao(self, m: re.Match, linha: Linha) -> None:
        assert self.art is not None
        rot = m.group(1)
        corpo = norm_ws(m.group(2))
        low = rot.lower()
        kind = (
            "infracao" if low.startswith("infra")
            else "penalidade" if low.startswith("penalidade")
            else "medida_administrativa" if low.startswith("medida")
            else "penas"
        )
        alvo = self.last.id if self.last else self.art.id
        d = self._add(
            Dispositivo(
                id=f"{alvo.split('~')[0]}.{kind}",
                tipo="sancao",
                rotulo=rot,
                citacao=self.last.citacao if self.last else self._cit(),
                texto=corpo,
                status=self._status(corpo, linha.notas),
                notas=linha.notas,
                sancao=kind,
            )
        )
        # índice de infrações (Cap. XV) / penas (Cap. XIX)
        if kind in ("infracao", "penas") or self._bloco_sancao is None or not self._ultimo_foi_sancao:
            cand = [x for x in self._pendentes if x.tipo != "sancao"]
            # incisos vetados/revogados no meio do grupo não recebem a sanção
            alvos = [x for x in cand if x.status == "vigente"] or cand or [self._caput]
            # conduta: caput + (parágrafo) + inciso/alínea
            self._bloco_sancao = {
                "artigo": self.art.numero,
                "dispositivos": [x.citacao for x in alvos],
                "ids": [x.id for x in alvos],
                "tipo": "crime" if kind == "penas" else "infracao_administrativa",
                "conduta": self._conduta_texto(alvos),
                "status": "vigente" if any(x.status == "vigente" for x in alvos) else alvos[0].status,
                "capitulo": self.capitulo,
                "notas": sorted({n.texto for x in alvos for n in x.notas if n.tipo in ("redacao", "inclusao")}),
            }
            self.infracoes.append(self._bloco_sancao)
        self._bloco_sancao[kind] = limpa_valor(corpo)
        self._bloco_sancao["notas"] = sorted(
            set(self._bloco_sancao["notas"]) | {n.texto for n in linha.notas if n.tipo in ("redacao", "inclusao")}
        )
        self._ultimo_foi_sancao = True
        # sanção pertence ao último dispositivo de conduta — não altera hierarquia

    def _conduta_texto(self, alvos: list[Dispositivo]) -> str:
        partes = [self._caput.texto]
        for a in alvos:
            if a.tipo == "caput":
                continue
            if a.tipo == "alinea" and self.inc and self.inc.texto not in partes:
                partes.append(f"{self.inc.rotulo} - {self.inc.texto}")
            partes.append(f"{a.rotulo} {a.texto}" if a.tipo == "paragrafo" else f"{a.rotulo} - {a.texto}" if a.tipo == "inciso" else f"{a.rotulo} {a.texto}")
        return " ".join(p for p in partes if p)

    def _linha_artigo(self, linha: Linha) -> None:
        t = linha.texto
        assert self.art is not None
        if m := SANC_RE.match(t):
            self._sancao(m, linha)
            return
        if m := PAR_RE.match(t):
            if m.group(3):
                rot, num = "Parágrafo único.", "unico"
                cit = "parágrafo único"
            else:
                num = m.group(1) + (f"-{m.group(2)}" if m.group(2) else "")
                cit = f"§ {ordinal(num)}"
                rot = rotulo_no_texto(cit)  # "§ 1º" | "§ 10." (padrão do Planalto)
            corpo = norm_ws(m.group(4))
            d = self._add(
                Dispositivo(
                    id=f"{self.art.id}.par-{num}",
                    tipo="paragrafo",
                    rotulo=rot,
                    citacao=self._cit(cit),
                    texto=corpo,
                    status=self._status(corpo, linha.notas),
                    notas=linha.notas,
                )
            )
            self.par, self.inc, self.ali = d, None, None
            self._conduta(d)
            return
        if m := INC_RE.match(t):
            num = m.group(1) + (f"-{m.group(2)}" if m.group(2) else "")
            corpo = norm_ws(m.group(3))
            base = self.par.id if self.par else self.art.id
            partes = [self.par.citacao.split(", ", 1)[1]] if self.par else []
            d = self._add(
                Dispositivo(
                    id=f"{base}.inc-{num}",
                    tipo="inciso",
                    rotulo=num,
                    citacao=self._cit(*partes, num),
                    texto=corpo,
                    status=self._status(corpo, linha.notas),
                    notas=linha.notas,
                )
            )
            self.inc, self.ali = d, None
            self._conduta(d)
            return
        if m := ALI_RE.match(t):
            letra = m.group(1) + (f"-{m.group(2)}" if m.group(2) else "")
            corpo = norm_ws(m.group(3))
            pai = self.inc or self.par
            base = pai.id if pai else self.art.id
            partes = pai.citacao.split(", ", 1)[1:] if pai else []
            d = self._add(
                Dispositivo(
                    id=f"{base}.ali-{letra}",
                    tipo="alinea",
                    rotulo=f"{letra})",
                    citacao=self._cit(*partes, f'"{letra}"'),
                    texto=corpo,
                    status=self._status(corpo, linha.notas),
                    notas=linha.notas,
                )
            )
            self.ali = d
            self._conduta(d)
            return
        if m := ITEM_RE.match(t):
            n = m.group(1)
            corpo = norm_ws(m.group(2))
            pai = self.ali or self.inc or self.par
            base = pai.id if pai else self.art.id
            partes = pai.citacao.split(", ", 1)[1:] if pai else []
            d = self._add(
                Dispositivo(
                    id=f"{base}.item-{n}",
                    tipo="item",
                    rotulo=f"{n}.",
                    citacao=self._cit(*partes, f"item {n}"),
                    texto=corpo,
                    status=self._status(corpo, linha.notas),
                    notas=linha.notas,
                )
            )
            self._conduta(d)
            return
        # continuação: texto sem marcador → anexa ao último dispositivo
        alvo = self.last
        if alvo is None:
            self.warnings.append(f"linha órfã: {t[:80]}")
            return
        if t:
            alvo.texto = f"{alvo.texto}\n{t}".strip()
            if alvo.status in ("vazio", "revogado") and alvo.tipo != "sancao" and not REVOGADO_BODY_RE.match(t):
                alvo.status = "vigente"
        alvo.notas.extend(linha.notas)
        self.warnings.append(f"continuação em {alvo.id}: {t[:60]}")

    # ---------------- anexos ---------------- #
    def _linha_anexo_I(self, linha: Linha) -> None:
        t = linha.texto
        if not t:
            self.anexos[-1]["notas"].extend(asdict(n) for n in linha.notas)
            return
        m = DEF_RE.match(t)
        if m and m.group(1) == m.group(1).upper() and len(m.group(1)) >= 2:
            self.definicoes.append(
                {
                    "id": "anexo-I." + re.sub(r"[^a-z0-9]+", "-", _ascii(m.group(1)).lower()).strip("-"),
                    "termo": norm_ws(m.group(1)),
                    "definicao": norm_ws(m.group(2)),
                    "notas": [asdict(n) for n in linha.notas],
                }
            )
        elif self.definicoes:
            self.definicoes[-1]["definicao"] += "\n" + t
            self.definicoes[-1]["notas"].extend(asdict(n) for n in linha.notas)
        elif not self.anexos[-1]["titulo"]:
            self.anexos[-1]["titulo"] = t
            self.anexos[-1]["notas"].extend(asdict(n) for n in linha.notas)
        else:
            self.anexos[-1]["texto"] = (self.anexos[-1].get("texto", "") + "\n" + t).strip()

    # ---------------- laço principal ---------------- #
    def feed_linha(self, linha: Linha) -> None:
        t = linha.texto
        if linha.descartado_riscado:
            self.warnings.append(f"texto riscado descartado: {linha.descartado_riscado[:80]}")

        if m := ANEXO_RE.match(t):
            self._fechar_artigo()
            self.modo = "anexo_I" if m.group(1) == "I" else "anexo_outro"
            self.anexos.append({"anexo": m.group(1), "titulo": norm_ws(m.group(2)), "notas": [asdict(n) for n in linha.notas]})
            return
        if "Download para Anexo" in t:
            self._fechar_artigo()
            num = re.search(r"Anexo\s+([IVX]+)", t)
            self.anexos.append(
                {
                    "anexo": num.group(1) if num else "?",
                    "titulo": "(disponível apenas em PDF no Planalto — não incluído)",
                    "url": linha.links[0] if linha.links else None,
                    "notas": [],
                }
            )
            self.modo = "anexo_outro"
            return
        if self.modo == "anexo_I":
            self._linha_anexo_I(linha)
            return
        if self.modo == "anexo_outro":
            if self.anexos:
                self.anexos[-1]["notas"].extend(asdict(n) for n in linha.notas)
            return
        if self.modo != "fecho" and (m := HEAD_RE.match(t)):
            self._fechar_artigo()
            self._heading(m, linha)
            return
        if m := ART_RE.match(t):
            if self.modo in ("preambulo", "artigos"):
                self.modo = "artigos"
                self._novo_artigo(m, linha)
                return
        if self.modo == "artigos" and FECHO_RE.match(t):
            self._fechar_artigo()
            self.modo = "fecho"
        if self.modo == "fecho":
            self.meta.setdefault("fecho", []).append(t)
            return
        if self.modo == "preambulo":
            if t:
                self.meta.setdefault("preambulo", []).append(t)
            return
        # modo artigos
        if self.art is None or (self._pending_heading and not any(
            r.match(t) for r in (PAR_RE, INC_RE, ALI_RE, SANC_RE)
        )):
            if self._heading_name(t):
                return
            if self.art is None:
                if t:
                    self.warnings.append(f"texto fora de artigo: {t[:80]}")
                return
        self._linha_artigo(linha)

    def parse(self, html: str) -> "CTBParser":
        soup = BeautifulSoup(html, "lxml")
        root = soup.body or soup
        for linha in linhas_do_documento(root):
            self.feed_linha(linha)
        self._fechar_artigo()
        self._pos_processar()
        return self

    def _separar_definicoes_coladas(self) -> None:
        """No HTML, algumas definições vêm na mesma linha
        (ex.: 'RODOVIA - via rural pavimentada. SEMI-REBOQUE - veículo ...')."""
        novas: list[dict] = []
        for d in self.definicoes:
            partes = DEF_COLADA_RE.split(d["definicao"])
            d["definicao"] = partes[0].strip()
            novas.append(d)
            for termo, texto in zip(partes[1::2], partes[2::2]):
                termo = norm_ws(termo)
                novas.append(
                    {
                        "id": "anexo-I." + re.sub(r"[^a-z0-9]+", "-", _ascii(termo).lower()).strip("-"),
                        "termo": termo,
                        "definicao": texto.strip(),
                        "notas": [],
                    }
                )
                self.warnings.append(f"definição separada: {d['termo']} | {termo}")
        self.definicoes = novas

    def _pos_processar(self) -> None:
        self._separar_definicoes_coladas()
        pre = self.meta.get("preambulo", [])
        self.meta["ementa"] = next((x for x in pre if x.startswith("Institui")), None)
        nums = [a.numero for a in self.artigos]
        dups = sorted({n for n in nums if nums.count(n) > 1})
        if dups:
            self.warnings.append(f"artigos duplicados: {dups}")


def _descartavel(d: Dispositivo) -> bool:
    return d.status == "vazio" and not d.notas and not d.texto


def rotulo_no_texto(rotulo: str) -> str:
    """'Art. 147' -> 'Art. 147.' ; 'Art. 1º' fica igual (padrão do Planalto)."""
    return rotulo if rotulo.endswith("º") else f"{rotulo}."


def limpa_valor(s: Optional[str]) -> Optional[str]:
    return re.sub(r"\s*[;.,]\s*$", "", s).strip() if s else s


def _ascii(s: str) -> str:
    import unicodedata

    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


# --------------------------------------------------------------------------- #
# Renderização
# --------------------------------------------------------------------------- #
STATUS_TAG = {"revogado": "REVOGADO", "vetado": "VETADO", "sem_efeito": "SEM EFEITO", "vazio": "SEM TEXTO"}


def _notas_md(notas: list[Nota], com_notas: bool) -> str:
    if not com_notas:
        return ""
    vis = [n for n in notas if n.tipo not in ("vigencia",)]
    if not vis:
        return ""
    parts = []
    for n in vis:
        txt = n.texto if n.texto.startswith("(") else f"({n.texto})"
        parts.append(f"~~{txt}~~ [sem efeito]" if n.sem_efeito else txt)
    return " _" + " ".join(parts) + "_"


INDENT = {"caput": 0, "paragrafo": 0, "inciso": 1, "alinea": 2, "item": 3, "texto": 1}


def render_artigo_md(a: Artigo, com_notas: bool = True) -> str:
    linhas = [f"### {a.rotulo}" + (f" — {STATUS_TAG[a.status]}" if a.status in STATUS_TAG else "")]
    nivel_ctx = 0
    for d in a.dispositivos:
        tag = f" **[{STATUS_TAG[d.status]}]**" if d.status in STATUS_TAG else ""
        texto = d.texto.replace("\n", " ")
        if d.tipo == "caput":
            linhas.append(f"{rotulo_no_texto(a.rotulo)} {texto}{tag}{_notas_md(d.notas, com_notas)}".rstrip())
            nivel_ctx = 0
            continue
        if d.tipo == "sancao":
            pad = "  " * (nivel_ctx + 1)
            linhas.append(f"{pad}> **{d.rotulo}** – {texto}{tag}{_notas_md(d.notas, com_notas)}")
            continue
        nivel = INDENT.get(d.tipo, 1) + (1 if d.id.count(".par-") and d.tipo != "paragrafo" else 0)
        nivel_ctx = nivel
        sep = " - " if d.tipo == "inciso" else " "
        linhas.append(f"{'  ' * nivel}- {d.rotulo}{sep}{texto}{tag}{_notas_md(d.notas, com_notas)}".rstrip())
    return "\n".join(linhas)


def render_md(parser: CTBParser, meta: dict, com_notas: bool = True) -> str:
    out = [
        "# Código de Trânsito Brasileiro — Lei nº 9.503, de 23 de setembro de 1997 (texto compilado)",
        "",
        f"> Fonte: {meta['fonte_url']} · obtido em {meta['obtido_em']} · sha256 `{meta['sha256'][:16]}…`",
        "> Texto vigente conforme compilação do Planalto. Não substitui o publicado no DOU.",
        "> Notas em itálico indicam a lei que deu a redação atual. `[REVOGADO]`/`[VETADO]` = não citar como vigente.",
        "> `~~nota~~ [sem efeito]` = anotação riscada no original (ex.: medida provisória que perdeu a eficácia).",
        "> Redações anteriores NÃO constam: para infrações antigas, confira a vigência da alteração.",
        "",
    ]
    cap = sec = None
    for a in parser.artigos:
        if a.capitulo != cap:
            cap, sec = a.capitulo, None
            out += [f"## {cap}", ""]
        if a.secao != sec:
            sec = a.secao
            if sec:
                out += [f"#### {sec}", ""]
        out += [render_artigo_md(a, com_notas), ""]
    if parser.definicoes:
        out += ["## ANEXO I — DOS CONCEITOS E DEFINIÇÕES", ""]
        for d in parser.definicoes:
            out.append(f"- **{d['termo']}** – {d['definicao'].replace(chr(10), ' ')}")
        out.append("")
    for ax in parser.anexos:
        if ax["anexo"] != "I":
            out += [f"## ANEXO {ax['anexo']}", f"{ax['titulo']} {ax.get('url') or ''}".strip(), ""]
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def run(entrada: Path, out: Path, fonte_url: str = FONTE_URL) -> dict:
    raw = entrada.read_bytes()
    html = decode_html(raw)
    if "9.503" not in html or "Código de Trânsito" not in html:
        raise ValueError(f"{entrada} não parece ser o CTB compilado do Planalto")
    p = CTBParser().parse(html)
    meta = {
        "lei": "Lei nº 9.503, de 23 de setembro de 1997",
        "nome": "Código de Trânsito Brasileiro",
        "ementa": p.meta.get("ementa"),
        "fonte_url": fonte_url,
        "arquivo": entrada.name,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "obtido_em": datetime.fromtimestamp(entrada.stat().st_mtime, tz=timezone.utc).date().isoformat(),
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "contagem": {
            "artigos": len(p.artigos),
            "artigos_vigentes": sum(a.status == "vigente" for a in p.artigos),
            "dispositivos": sum(len(a.dispositivos) for a in p.artigos),
            "infracoes": len(p.infracoes),
            "definicoes": len(p.definicoes),
            "warnings": len(p.warnings),
        },
    }
    out.mkdir(parents=True, exist_ok=True)

    doc = {
        "meta": meta,
        "artigos": [asdict(a) for a in p.artigos],
        "anexos": p.anexos,
        "definicoes": p.definicoes,
        "fecho": p.meta.get("fecho", []),
    }
    (out / "ctb.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "ctb.md").write_text(render_md(p, meta, com_notas=True), encoding="utf-8")
    (out / "ctb_infracoes.json").write_text(json.dumps(p.infracoes, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "ctb_definicoes.json").write_text(json.dumps(p.definicoes, ensure_ascii=False, indent=1), encoding="utf-8")
    with (out / "ctb_chunks.jsonl").open("w", encoding="utf-8") as f:
        for a in p.artigos:
            texto = render_artigo_md(a, com_notas=True)
            f.write(
                json.dumps(
                    {
                        "id": a.id,
                        "tipo": "artigo",
                        "artigo": a.numero,
                        "capitulo": a.capitulo,
                        "secao": a.secao,
                        "status": a.status,
                        "texto": texto,
                        "chars": len(texto),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
        for d in p.definicoes:
            texto = f"ANEXO I — {d['termo']} – {d['definicao']}"
            f.write(json.dumps({"id": d["id"], "tipo": "definicao", "termo": d["termo"], "texto": texto, "chars": len(texto)}, ensure_ascii=False) + "\n")
    (out / "parser_warnings.txt").write_text("\n".join(p.warnings), encoding="utf-8")
    return meta


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada", type=Path, help="HTML salvo do Planalto (l9503compilado.htm)")
    ap.add_argument("--out", type=Path, default=Path("saida"))
    ap.add_argument("--fonte-url", default=FONTE_URL)
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(levelname)s %(message)s")
    try:
        meta = run(a.entrada, a.out, a.fonte_url)
    except (OSError, ValueError) as e:
        log.error("%s", e)
        return 1
    log.info("OK: %s", json.dumps(meta["contagem"], ensure_ascii=False))
    log.info("saídas em %s", a.out.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
