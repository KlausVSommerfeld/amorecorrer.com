#!/usr/bin/env python3
"""
consulta.py — Recupera trechos do CTB (gerado por ctb_parser.py) para compor o
contexto da IA na redação de petições/recursos de multa.

Uso como biblioteca (ex.: no pipeline FastAPI):
    from consulta import CTB
    ctb = CTB.carregar("saida/ctb.json")
    md = ctb.contexto_peticao(["218, III"])       # Markdown pronto para o prompt

Uso via CLI:
    python consulta.py art 218
    python consulta.py disp "art. 280, § 2º"
    python consulta.py infracao "181, XVII"
    python consulta.py def "via arterial"
    python consulta.py busca "equipamento hábil"
    python consulta.py contexto "218, III" [--processuais 280,281] [--sem-processuais] [--extra 90]

Requisitos: Python >= 3.10, somente biblioteca padrão.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

PADRAO_JSON = Path(__file__).with_name("saida") / "ctb.json"

# Artigos de processo administrativo e garantias usualmente invocados em defesa/recurso.
# Ajuste conforme a estratégia da petição.
PROCESSUAIS_PADRAO: tuple[str, ...] = (
    "90",  # sinalização insuficiente/incorreta afasta a sanção
    "257",  # responsabilidade e identificação do condutor
    "280",  # requisitos do auto de infração
    "281",  # julgamento da consistência; prazo de 30 dias da notificação da autuação
    "281-A",  # prazo de defesa prévia na notificação
    "282",  # notificação da penalidade; prazos decadenciais (§§ 6º e 7º)
    "282-A",  # notificação eletrônica (SNE)
    "284",  # pagamento com desconto
    "285",  # recurso à JARI
    "286",
    "287",
    "288",  # recurso em 2ª instância
    "289",
    "290",  # encerramento da instância administrativa
)

STATUS_TAG = {"revogado": "REVOGADO", "vetado": "VETADO", "sem_efeito": "SEM EFEITO", "vazio": "SEM TEXTO"}
ROMANO = r"[IVXLC]+"


def _sem_acento(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def _ordinal(n: str) -> str:
    base, _, suf = n.partition("-")
    out = f"{base}º" if base.isdigit() and int(base) < 10 else base
    return f"{out}-{suf}" if suf else out


# Definições genéricas demais para acrescentar ao contexto automaticamente
TERMOS_GENERICOS = {"transito", "infracao", "veiculo", "condutor", "pista", "lote"}


def _singular(w: str) -> str:
    """Heurística de singularização (pt-BR) suficiente para casar termos do Anexo I."""
    for suf, rep in (("oes", "ao"), ("aes", "ao"), ("ais", "al"), ("eis", "el"), ("ois", "ol"), ("ns", "m")):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)] + rep
    if len(w) > 4 and w.endswith(("res", "zes")):
        return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is")):
        return w[:-1]
    return w


class ReferenciaInvalida(ValueError):
    pass


@dataclass(frozen=True)
class Ref:
    artigo: str
    paragrafo: Optional[str] = None  # "2", "1-A", "unico"
    inciso: Optional[str] = None
    alinea: Optional[str] = None
    item: Optional[str] = None

    def ids_candidatos(self) -> list[str]:
        """IDs possíveis, do mais específico ao menos (o inciso pode estar no caput ou num §)."""
        base = f"art-{self.artigo}"
        cauda = []
        if self.inciso:
            cauda.append(f"inc-{self.inciso}")
        if self.alinea:
            cauda.append(f"ali-{self.alinea}")
        if self.item:
            cauda.append(f"item-{self.item}")
        if self.paragrafo:
            return [".".join([base, f"par-{self.paragrafo}", *cauda])]
        if not cauda:
            return [f"{base}.caput"]
        return [".".join([base, *cauda])]


REF_RE = re.compile(
    r"""^\s*(?:art(?:igo)?\.?\s*)?(?P<art>\d+)\s*[ºo°]?\s*(?:-\s*(?P<suf>[A-Z]))?\s*[.,;]?\s*(?P<resto>.*)$""",
    re.I | re.X,
)


def parse_ref(texto: str) -> Ref:
    """Aceita: 'art. 218, III', '218 III', '218, inciso III', '280 § 2º', '18, parágrafo único',
    '230, V, a', 'art. 7º-A', '181, XVII', '162, II, item 1'."""
    m = REF_RE.match(texto)
    if not m:
        raise ReferenciaInvalida(f"referência não reconhecida: {texto!r}")
    artigo = m.group("art") + (f"-{m.group('suf').upper()}" if m.group("suf") else "")
    resto = m.group("resto")
    par = inc = ali = item = None
    if pm := re.search(r"par[áa]grafo\s+[úu]nico|p\.\s*[úu]nico", resto, re.I):
        par = "unico"
        resto = resto[: pm.start()] + resto[pm.end():]
    elif pm := re.search(r"(?:§|par[áa]grafo)\s*(\d+)\s*[ºo°]?\s*(?:-\s*([A-Z]))?", resto, re.I):
        par = pm.group(1) + (f"-{pm.group(2).upper()}" if pm.group(2) else "")
        resto = resto[: pm.start()] + resto[pm.end():]
    if im := re.search(rf"(?:inciso\s+)?\b({ROMANO})\b(?:-([A-Z])\b)?", resto):
        inc = im.group(1) + (f"-{im.group(2)}" if im.group(2) else "")
        resto = resto[im.end():]
    if am := re.search(r"(?:al[íi]nea\s+)?[\"'“]?\b([a-z])\b[\"'”)]?", resto):
        ali = am.group(1)
        resto = resto[am.end():]
    if itm := re.search(r"item\s+(\d+)", resto, re.I):
        item = itm.group(1)
    return Ref(artigo=artigo, paragrafo=par, inciso=inc, alinea=ali, item=item)


class CTB:
    def __init__(self, doc: dict) -> None:
        self.doc = doc
        self.meta = doc["meta"]
        self.artigos = {a["numero"]: a for a in doc["artigos"]}
        self.definicoes = doc.get("definicoes", [])
        self.infracoes: list[dict] = []
        self._disp = {d["id"]: (a, d) for a in doc["artigos"] for d in a["dispositivos"]}

    @classmethod
    def carregar(cls, caminho: Path | str = PADRAO_JSON) -> "CTB":
        caminho = Path(caminho)
        if not caminho.exists():
            raise FileNotFoundError(f"{caminho} não encontrado — rode antes: python ctb_parser.py l9503compilado.htm")
        obj = cls(json.loads(caminho.read_text(encoding="utf-8")))
        inf = caminho.with_name("ctb_infracoes.json")
        if inf.exists():
            obj.infracoes = json.loads(inf.read_text(encoding="utf-8"))
        return obj

    # ------------------------------------------------------------------ #
    # Consultas
    # ------------------------------------------------------------------ #
    def artigo(self, numero: str) -> dict:
        numero = numero.strip().upper().replace("º", "").replace("°", "")
        numero = re.sub(r"^ART\.?\s*", "", numero).replace(" ", "")
        if numero not in self.artigos:
            raise KeyError(f"artigo {numero} não encontrado no CTB")
        return self.artigos[numero]

    def dispositivo(self, ref: str | Ref) -> tuple[dict, dict]:
        r = parse_ref(ref) if isinstance(ref, str) else ref
        self.artigo(r.artigo)  # valida existência
        for cid in r.ids_candidatos():
            if cid in self._disp:
                return self._disp[cid]
        raise KeyError(f"dispositivo não encontrado: {ref} (ids tentados: {r.ids_candidatos()})")

    def infracao(self, ref: str | Ref) -> Optional[dict]:
        """Bloco de sanção (natureza, penalidade, medida) aplicável ao dispositivo."""
        _, d = self.dispositivo(ref)
        alvo = d["id"]
        # sobe na hierarquia: alínea → inciso → parágrafo → caput
        partes = alvo.split(".")
        for k in range(len(partes), 0, -1):
            pid = ".".join(partes[:k])
            for inf in self.infracoes:
                if pid in inf["ids"] or (k == 1 and f"{pid}.caput" in inf["ids"]):
                    return inf
        return None

    def definicao(self, termo: str) -> Optional[dict]:
        t = _sem_acento(termo).strip()
        return next((d for d in self.definicoes if _sem_acento(d["termo"]) == t), None)

    def busca(self, termo: str, limite: int = 30) -> list[tuple[str, str]]:
        t = _sem_acento(termo)
        out = []
        for a in self.doc["artigos"]:
            for d in a["dispositivos"]:
                if t in _sem_acento(d["texto"]):
                    out.append((d["citacao"], d["texto"]))
                    if len(out) >= limite:
                        return out
        return out

    # ------------------------------------------------------------------ #
    # Renderização
    # ------------------------------------------------------------------ #
    @staticmethod
    def _notas(d: dict) -> str:
        vis = [n for n in d["notas"] if n["tipo"] != "vigencia"]
        if not vis:
            return ""
        return " _" + " ".join(
            (f"~~{n['texto']}~~ [sem efeito]" if n["sem_efeito"] else n["texto"]) for n in vis
        ) + "_"

    def _linha(self, a: dict, d: dict) -> str:
        tag = f" **[{STATUS_TAG[d['status']]}]**" if d["status"] in STATUS_TAG else ""
        texto = d["texto"].replace("\n", " ")
        if d["tipo"] == "caput":
            rot = a["rotulo"] if a["rotulo"].endswith("º") else a["rotulo"] + "."
            return f"{rot} {texto}{tag}{self._notas(d)}"
        if d["tipo"] == "sancao":
            return f"  > **{d['rotulo']}** – {texto}{tag}{self._notas(d)}"
        nivel = {"paragrafo": 0, "inciso": 1, "alinea": 2, "item": 3}.get(d["tipo"], 1)
        if ".par-" in d["id"] and d["tipo"] != "paragrafo":
            nivel += 1
        sep = " - " if d["tipo"] == "inciso" else " "
        return f"{'  ' * nivel}- {d['rotulo']}{sep}{texto}{tag}{self._notas(d)}"

    def artigo_md(self, numero: str) -> str:
        a = self.artigo(numero)
        cab = f"### {a['rotulo']}" + (f" — {STATUS_TAG[a['status']]}" if a["status"] in STATUS_TAG else "")
        local = " › ".join(x for x in (a["capitulo"], a["secao"]) if x)
        return "\n".join([cab, f"_{local}_", *[self._linha(a, d) for d in a["dispositivos"]]])

    def dispositivo_md(self, ref: str) -> str:
        """Dispositivo com seus ascendentes (caput, §, inciso) e as sanções aplicáveis."""
        a, d = self.dispositivo(ref)
        ids = d["id"].split(".")
        cadeia = [f"{ids[0]}.caput"] + [".".join(ids[:k]) for k in range(2, len(ids) + 1)]
        linhas = [self._linha(a, self._disp[c][1]) for c in dict.fromkeys(cadeia) if c in self._disp]
        # filhos diretos (ex.: incisos de um § consultado)
        linhas += [self._linha(a, x) for x in a["dispositivos"] if x["id"].startswith(d["id"] + ".") and x["tipo"] != "sancao"]
        inf = self.infracao(ref) if self.infracoes else None
        if inf:
            linhas.append("")
            linhas.append(f"**Sanção aplicável** ({', '.join(inf['dispositivos'])}):")
            for k, rot in (("infracao", "Infração"), ("penalidade", "Penalidade"), ("medida_administrativa", "Medida administrativa"), ("penas", "Penas")):
                if inf.get(k):
                    linhas.append(f"- {rot}: {inf[k]}")
            if inf.get("notas"):
                linhas.append(f"- Origem da redação: {'; '.join(inf['notas'])}")
        if d["status"] != "vigente":
            linhas.append(f"\n⚠️ Dispositivo com status **{d['status'].upper()}** — não citar como norma vigente.")
        return "\n".join(linhas)

    def _definicoes_citadas(self, texto: str, limite: int = 20) -> list[dict]:
        """Termos do Anexo I presentes no texto (tolerante a plural: 'vias arteriais' → VIA ARTERIAL)."""
        alvo = " " + " ".join(_singular(w) for w in re.findall(r"\w+", _sem_acento(texto))) + " "
        achados = []
        for d in self.definicoes:
            termo = " ".join(_singular(w) for w in re.findall(r"\w+", _sem_acento(d["termo"])))
            if termo in TERMOS_GENERICOS or len(termo) < 5:
                continue
            if f" {termo} " in alvo:
                achados.append(d)
        return achados[:limite]

    def contexto_peticao(
        self,
        enquadramentos: list[str],
        processuais: Optional[list[str]] = None,
        extras: Optional[list[str]] = None,
        artigo_completo: bool = True,
    ) -> str:
        """Monta o bloco normativo para o prompt da IA.

        enquadramentos: dispositivos do auto (ex.: ["218, III"]).
        processuais: artigos de rito/garantias (padrão: PROCESSUAIS_PADRAO; [] para omitir).
        extras: artigos adicionais inteiros (ex.: ["80", "90"]).
        """
        processuais = list(PROCESSUAIS_PADRAO) if processuais is None else processuais
        extras = extras or []
        m = self.meta
        out = [
            "# Base normativa — Código de Trânsito Brasileiro (Lei nº 9.503/1997)",
            f"> Fonte: {m['fonte_url']} (texto compilado, obtido em {m['obtido_em']}; sha256 {m['sha256'][:12]}…).",
            "> Instruções à IA: cite apenas dispositivos marcados como vigentes; não invente artigos, incisos ou redações.",
            "> O texto é a redação ATUAL. Se a infração for anterior à lei indicada em \"Redação dada/Incluído pela\",",
            "> sinalize que a redação aplicável pode ser outra (tempus regit actum) e peça verificação.",
            "",
        ]
        vistos: set[str] = set()
        texto_acumulado = []
        for e in enquadramentos:
            a, _ = self.dispositivo(e)
            out += [f"## Enquadramento do auto: {e}", "", self.dispositivo_md(e), ""]
            texto_acumulado.append(self.dispositivo_md(e))
            if artigo_completo and a["numero"] not in vistos:
                out += ["<details><summary>Artigo completo</summary>", "", self.artigo_md(a["numero"]), "", "</details>", ""]
            vistos.add(a["numero"])
        blocos = [n for n in [*extras, *processuais] if n not in vistos]
        if blocos:
            out += ["## Processo administrativo, prazos e garantias", ""]
            for n in blocos:
                try:
                    out += [self.artigo_md(n), ""]
                except KeyError as err:
                    out += [f"<!-- {err} -->", ""]
                vistos.add(n)
        defs = self._definicoes_citadas("\n".join(texto_acumulado))
        if defs:
            out += ["## Definições do Anexo I pertinentes", ""]
            out += [f"- **{d['termo']}** – {d['definicao'].replace(chr(10), ' ')}" for d in defs]
            out.append("")
        return "\n".join(out)


# ---------------------------------------------------------------------- #
# CLI
# ---------------------------------------------------------------------- #
def _lista(s: Optional[str]) -> Optional[list[str]]:
    return [x.strip() for x in s.split(",") if x.strip()] if s is not None else None


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Consulta ao CTB estruturado")
    ap.add_argument("--json", type=Path, default=PADRAO_JSON, help="caminho do ctb.json")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("art").add_argument("numero")
    sub.add_parser("disp").add_argument("ref")
    sub.add_parser("infracao").add_argument("ref")
    sub.add_parser("def").add_argument("termo")
    sub.add_parser("busca").add_argument("termo")
    c = sub.add_parser("contexto")
    c.add_argument("enquadramentos", nargs="+", help='ex.: "218, III" "181, XVII"')
    c.add_argument("--processuais", help="lista separada por vírgula (substitui o padrão)")
    c.add_argument("--sem-processuais", action="store_true")
    c.add_argument("--extra", help="artigos extras, separados por vírgula")
    a = ap.parse_args(argv)

    try:
        ctb = CTB.carregar(a.json)
        if a.cmd == "art":
            print(ctb.artigo_md(a.numero))
        elif a.cmd == "disp":
            print(ctb.dispositivo_md(a.ref))
        elif a.cmd == "infracao":
            print(json.dumps(ctb.infracao(a.ref), ensure_ascii=False, indent=2))
        elif a.cmd == "def":
            d = ctb.definicao(a.termo)
            print(f"{d['termo']} – {d['definicao']}" if d else "não encontrado")
        elif a.cmd == "busca":
            for cit, txt in ctb.busca(a.termo):
                print(f"- {cit}: {txt[:200]}")
        elif a.cmd == "contexto":
            proc = [] if a.sem_processuais else _lista(a.processuais)
            print(ctb.contexto_peticao(a.enquadramentos, processuais=proc, extras=_lista(a.extra)))
    except (KeyError, ReferenciaInvalida, FileNotFoundError) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
