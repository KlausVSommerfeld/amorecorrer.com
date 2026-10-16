"""Extrai a Tabela de Códigos de Enquadramentos das Infrações (Anexo IV da
Portaria SENATRAN 354/2022, "Anexos Retificados") e confere cada linha contra o
CTB. Spec: docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md.

Rodar de dentro de enquadramentos/, com pypdf fora do venv:

    pip install --target "$HOME/.cache/amorecorrer-pdftext" pypdf==5.1.0
    PYTHONPATH="$HOME/.cache/amorecorrer-pdftext" python3 enquadramentos_parser.py

Gera saida/enquadramentos.json (tabela completa) e ../src/data/enquadramentos.json
(só o que a lista do site oferece). Nada é adivinhado: linha que não confere vai
para `rejeitados`, com o motivo.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "pipeline"))

from base_legal import Ctb, carregar_ctb, natureza, tipifica_infracao  # noqa: E402

FONTE = AQUI / "Portaria3542022AnexoN4.pdf"
ALTERACOES = AQUI / "alteracoes.json"
SAIDA = AQUI / "saida" / "enquadramentos.json"
SAIDA_SITE = RAIZ / "src" / "data" / "enquadramentos.json"
CTB_DIR = RAIZ / "CTB-compilado_files"
ORIGEM_ANEXO = "Portaria SENATRAN 354/2022, Anexo IV (retificado)"

# Defeitos de extração conhecidos, um por código, conferidos contra o PDF.
CORRECOES = {
    # A quebra de linha repete o "1º" do parágrafo: "253-A, § \n1º 1º".
    "7609-0": ("253-A, § 1º 1º", "253-A, § 1º"),
}

_ART = r"\d{2,3}(?:-[A-Z])?(?=[\s,]|$)"
_PARTE = r',\s?(?:§\s?(?:\d+º|único)|[IVXLC]+\b|"?[a-z]"?(?=[\s,]|$))'
_REF = _ART + "(?:" + _PARTE + ")*"
_CC = r"\s?c/c\s?(?:§\s?\d+º|" + _REF + r")(?:\s?da Lei [\d./]+)?"
_LINHA = re.compile(
    r"^(?P<desc>.*?)\s+"
    r"(?P<amparo>" + _REF + "(?:" + _CC + r")?)\s+"
    r"(?P<infrator>Condutor|Proprietário|PF ou PJ|Serv público|Emb/Transp|P Jurídica|Pedestre|PF|PJ)\s+"
    r"(?P<gravidade>(?:\d+|SDD)\s?[-–]\s?(?P<natureza>Leve|Média|Grave|Gravíss)(?:\s\d+[xX])?(?:\s\d+%)?|---)\s+"
    r"(?:MUNICIPAL/RODOV|ESTADUAL/RODOV|ESTAD/MUNIC/RODOV|ESTADUAL|RODOVIÁRIO)\b"
)
_COMECO = re.compile(r"(?m)^(\d{4}) (\d)(?= |$)")
_NATUREZAS = {"Leve": "leve", "Média": "média", "Grave": "grave", "Gravíss": "gravíssima"}
_PALAVRAS = frozenset(_NATUREZAS.values())


def texto_do_anexo(pdf: Path) -> str:
    """O texto do Anexo IV: do título "ANEXO IV" ao "ANEXO V", sem as quebras de página."""
    from pypdf import PdfReader

    texto = "\n".join(p.extract_text() or "" for p in PdfReader(str(pdf)).pages)
    inicio = re.search(r"(?m)^\s*ANEXO IV\s*$", texto)
    fim = re.search(r"(?m)^\s*ANEXO V\s*$", texto)
    if not inicio or not fim:
        raise ValueError("títulos ANEXO IV / ANEXO V não encontrados no PDF")
    return texto[inicio.end():fim.start()]


def linhas(texto: str) -> list[tuple[str, str]]:
    """[(código, corpo da linha com as quebras desfeitas)]."""
    partes = _COMECO.split(texto)[1:]
    saida = []
    for i in range(0, len(partes), 3):
        codigo = f"{partes[i]}-{partes[i + 1]}"
        corpo = re.sub(r"\s+", " ", partes[i + 2]).strip()
        if codigo in CORRECOES:
            corpo = corpo.replace(*CORRECOES[codigo])
        saida.append((codigo, corpo))
    return saida


def _dispositivo(c: Ctb, ref: str) -> tuple[dict, dict]:
    return c.ctb.dispositivo(c.consulta.parse_ref("art. " + ref))


def _natureza_do_ctb(c: Ctb, citacao: str) -> str | None:
    nat = natureza(c, citacao)
    return nat[0] if nat and nat[0] in _PALAVRAS else None


def conferir(c: Ctb, codigo: str, descricao: str, amparo: str, infrator: str,
             gravidade: str | None, origem: str) -> dict[str, Any]:
    """A linha conferida, ou {"codigo", "amparo", "motivo"} quando não confere."""
    rejeitar = lambda motivo: {"codigo": codigo, "amparo": amparo, "motivo": motivo}  # noqa: E731
    if re.search(r"\bLei\b", amparo):
        return rejeitar("amparo com outra norma")
    principal, *resto = re.split(r"\s?c/c\s?", amparo)
    try:
        artigo, disp = _dispositivo(c, principal)
    except (c.consulta.ReferenciaInvalida, KeyError, ValueError):
        return rejeitar("amparo não reconhecido no CTB")
    if disp.get("status") != "vigente" or artigo.get("status") != "vigente":
        return rejeitar("dispositivo não vigente")
    # "c/c" aponta o dispositivo mais específico ("244, III c/c § 1º", de ciclos;
    # "163 c/c 162, II", cuja sanção é "as mesmas do artigo anterior"): a
    # gravidade se confere contra ele quando ele tem uma.
    nat_ctb = None
    if resto:
        alvo = resto[0]
        if alvo.startswith("§"):
            alvo = f"{principal.split(',')[0]}, {alvo}"
        try:
            nat_ctb = _natureza_do_ctb(c, _dispositivo(c, alvo)[1]["citacao"])
        except (c.consulta.ReferenciaInvalida, KeyError, ValueError):
            return rejeitar("amparo não reconhecido no CTB")
    nat_ctb = nat_ctb or _natureza_do_ctb(c, disp["citacao"])
    if gravidade and nat_ctb and gravidade != nat_ctb:
        return rejeitar(f"gravidade {gravidade} na tabela, {nat_ctb} no CTB")
    return {
        "codigo": codigo,
        "descricao": descricao,
        "amparo": amparo,
        "dispositivo": disp["citacao"],
        "infrator": infrator,
        "gravidade": gravidade or nat_ctb,
        "origem": origem,
        "na_lista": tipifica_infracao(artigo["numero"]),
    }


def ler_linha(codigo: str, corpo: str) -> dict[str, str] | None:
    m = _LINHA.match(corpo)
    if not m:
        return None
    # "§1º" colado ("244, VIII c/c §1º") fica igual aos outros amparos.
    amparo = re.sub(r"§(?=\d)", "§ ", m.group("amparo"))
    return {
        "codigo": codigo,
        "descricao": m.group("desc").strip(),
        "amparo": amparo,
        "infrator": m.group("infrator"),
        "gravidade": _NATUREZAS.get(m.group("natureza") or ""),
    }


def gerar(c: Ctb, texto: str, alteracoes: dict[str, Any], fonte_sha256: str) -> dict[str, Any]:
    enquadramentos: list[dict[str, Any]] = []
    rejeitados: list[dict[str, Any]] = []
    for codigo, corpo in linhas(texto):
        lida = ler_linha(codigo, corpo)
        if lida is None:
            rejeitados.append({"codigo": codigo, "amparo": None, "motivo": "linha ilegível", "texto": corpo})
            continue
        item = conferir(c, origem=ORIGEM_ANEXO, **lida)
        (rejeitados if "motivo" in item else enquadramentos).append(item)
    for alt in alteracoes["codigos"]:
        item = conferir(c, alt["codigo"], alt["descricao"], alt["amparo"], alt["infrator"],
                        alt["gravidade"], alt["origem"])
        (rejeitados if "motivo" in item else enquadramentos).append(item)
    vistos = [i["codigo"] for i in enquadramentos]
    repetidos = sorted({x for x in vistos if vistos.count(x) > 1})
    if repetidos:
        raise ValueError(f"códigos repetidos: {repetidos}")
    enquadramentos.sort(key=lambda i: i["codigo"])
    return {
        "meta": {
            "fonte": FONTE.name,
            "fonte_sha256": fonte_sha256,
            "alteracoes_conferidas_em": alteracoes["conferido_em"],
            "ctb_sha256": c.ctb.meta["sha256"],
            "total": len(enquadramentos),
            "na_lista": sum(1 for i in enquadramentos if i["na_lista"]),
        },
        "enquadramentos": enquadramentos,
        "rejeitados": rejeitados,
    }


def projecao_do_site(tabela: dict[str, Any]) -> list[dict[str, str]]:
    """O que o site carrega: só a lista, só os quatro campos que ela mostra."""
    return [
        {k: i[k] for k in ("codigo", "descricao", "dispositivo", "gravidade")}
        for i in tabela["enquadramentos"]
        if i["na_lista"]
    ]


def main() -> None:
    c = carregar_ctb(str(CTB_DIR))
    alteracoes = json.loads(ALTERACOES.read_text(encoding="utf-8"))
    sha = hashlib.sha256(FONTE.read_bytes()).hexdigest()
    tabela = gerar(c, texto_do_anexo(FONTE), alteracoes, sha)
    SAIDA.parent.mkdir(exist_ok=True)
    SAIDA.write_text(json.dumps(tabela, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    SAIDA_SITE.parent.mkdir(exist_ok=True)
    SAIDA_SITE.write_text(json.dumps(projecao_do_site(tabela), ensure_ascii=False) + "\n", encoding="utf-8")
    m = tabela["meta"]
    print(f"{m['total']} códigos ({m['na_lista']} na lista), {len(tabela['rejeitados'])} rejeitados")
    for r in tabela["rejeitados"]:
        print(f"  rejeitado {r['codigo']} ({r['amparo']}): {r['motivo']}")


if __name__ == "__main__":
    main()
