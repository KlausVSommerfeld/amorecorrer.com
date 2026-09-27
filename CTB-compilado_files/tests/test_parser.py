"""Testes do ctb_parser. Rodar a partir da pasta ctb/:  python -m pytest -q"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from ctb_parser import CTBParser, ordinal, run  # noqa: E402

HTML_REAL = RAIZ / "l9503compilado.htm"


def parse(corpo: str) -> CTBParser:
    return CTBParser().parse(f"<html><body>{corpo}</body></html>")


def disp(p: CTBParser, did: str) -> dict:
    for a in p.artigos:
        for d in a.dispositivos:
            if d.id == did:
                return d
    raise KeyError(did)


# --------------------------------------------------------------------------- #
# Unitários (HTML sintético reproduzindo padrões do Planalto)
# --------------------------------------------------------------------------- #
def test_ordinal():
    assert ordinal("1") == "1º" and ordinal("10") == "10" and ordinal("7-A") == "7º-A"


def test_capitulo_com_nome_em_linha_seguinte_e_artigo_ordinal_o():
    p = parse(
        '<p align="center">CAPÍTULO I<br>DISPOSIÇÕES PRELIMINARES</p>'
        "<p>Art. 5o O Sistema Nacional de Trânsito é o conjunto.</p>"
    )
    a = p.artigos[0]
    assert a.numero == "5" and a.capitulo == "CAPÍTULO I — DISPOSIÇÕES PRELIMINARES"
    assert a.dispositivos[0].texto == "O Sistema Nacional de Trânsito é o conjunto."


def test_p_malformado_nao_perde_texto():
    # padrão real do art. 147, § 2º: '<p></font>§ 2º ...' deixa o texto fora do <p>
    p = parse(
        "<p>Art. 147. O candidato:</p><font size=2><p></font><font>§ 2º O exame será renovável:</font>"
        "<p>I - a cada 10 anos;</p>"
    )
    d = disp(p, "art-147.par-2")
    assert d.texto == "O exame será renovável:"
    assert disp(p, "art-147.par-2.inc-I").citacao == "art. 147, § 2º, I"


def test_notas_removidas_do_texto_e_tipadas():
    p = parse(
        '<p>Art. 218. Transitar em velocidade superior: <a href="L11334.htm">(Redação dada pela Lei nº 11.334, de 2006)</a>'
        ' <a href="x">(Vide ADI nº 3951)</a></p>'
    )
    d = disp(p, "art-218.caput")
    assert d.texto == "Transitar em velocidade superior:"
    assert [n.tipo for n in d.notas] == ["redacao", "vide"]
    assert d.notas[0].url == "L11334.htm"


def test_artigo_revogado_e_vetado():
    p = parse(
        '<p>Art. 262. <a href="x">(Revogado pela Lei nº 13.281, de 2016)</a></p>'
        "<p>Art. 283. (VETADO)</p>"
    )
    assert [a.status for a in p.artigos] == ["revogado", "vetado"]


def test_nota_riscada_sem_efeito_mantem_vigencia():
    p = parse(
        "<p>Art. 139-A. As motocicletas:</p>"
        '<p>I – registro como veículo de aluguel; <span style="text-decoration:line-through">'
        '<a href="mpv">(Revogado pela Medida Provisória nº 1.360, de 2026)</a></span> <a href="y">Vigência encerrada</a></p>'
    )
    d = disp(p, "art-139-A.inc-I")
    assert d.status == "vigente"
    assert any(n.sem_efeito and n.tipo == "revogacao" for n in d.notas)


def test_incluido_por_mp_caduca_fica_sem_efeito():
    p = parse(
        "<p>Art. 268-A. Fica criado o RNPC.</p>"
        '<p>§ 8º <strike><a href="m">(Incluído pela Medida Provisória nº 1.327, de 2025)</a></strike></p>'
    )
    assert disp(p, "art-268-A.par-8").status == "sem_efeito"


def test_artigo_sem_ponto_depois_de_art():
    p = parse("<p>Art. 67-A. O disposto.</p><p>Art 67-B. VETADO).</p>")
    assert [a.numero for a in p.artigos] == ["67-A", "67-B"]


def test_grupo_de_sancao_ignora_inciso_vetado():
    p = parse(
        "<p>Art. 162. Dirigir veículo:</p>"
        "<p>IV - (VETADO)</p>"
        "<p>V - com CNH vencida há mais de 30 dias:</p>"
        "<p>Infração - gravíssima;</p><p>Penalidade - multa;</p>"
        "<p>Medida administrativa - retenção do veículo;</p>"
        "<p>VI - sem usar lentes corretoras:</p>"
        "<p>Infração - gravíssima;</p><p>Penalidade - multa;</p>"
    )
    assert len(p.infracoes) == 2
    i1, i2 = p.infracoes
    assert i1["dispositivos"] == ["art. 162, V"]
    assert i1["infracao"] == "gravíssima" and i1["medida_administrativa"] == "retenção do veículo"
    assert i2["dispositivos"] == ["art. 162, VI"] and "medida_administrativa" not in i2


def test_grupo_de_sancao_multiplos_incisos():
    p = parse(
        "<p>Art. 230. Conduzir o veículo:</p><p>I - violado;</p><p>II - sem placa;</p>"
        "<p>Infração - gravíssima;</p><p>Penalidade - multa e apreensão;</p>"
    )
    assert p.infracoes[0]["dispositivos"] == ["art. 230, I", "art. 230, II"]


def test_sancao_no_caput():
    p = parse("<p>Art. 219. Transitar abaixo da metade:</p><p>Infração - média;</p><p>Penalidade - multa.</p>")
    inf = p.infracoes[0]
    assert inf["dispositivos"] == ["art. 219"] and inf["penalidade"] == "multa"


def test_hierarquia_paragrafo_inciso_alinea_item():
    p = parse(
        "<p>Art. 61. A velocidade máxima:</p><p>§ 1º Onde não existir sinalização:</p>"
        "<p>II - nas vias rurais:</p><p>a) nas rodovias de pista dupla:</p><p>1. 110 km/h;</p>"
        "<p>Parágrafo único. Texto.</p>"
    )
    assert disp(p, "art-61.par-1.inc-II.ali-a.item-1").citacao == 'art. 61, § 1º, II, "a", item 1'
    assert disp(p, "art-61.par-unico").citacao == "art. 61, parágrafo único"


def test_marcador_vazio_substituido():
    p = parse("<p>Art. 147. O candidato:</p><p>I - </p><p>I - de aptidão física;</p>")
    ids = [d.id for d in p.artigos[0].dispositivos]
    assert ids == ["art-147.caput", "art-147.inc-I"]


def test_anexo_I_definicoes_e_definicao_colada():
    p = parse(
        "<p>Art. 341. Revogam-se as disposições.</p><p>Brasília, 23 de setembro de 1997.</p>"
        "<p>ANEXO I<br>DOS CONCEITOS E DEFINIÇÕES</p><p>Para efeito deste Código:</p>"
        "<p>RODOVIA - via rural pavimentada. SEMI-REBOQUE - veículo de um ou mais eixos.</p>"
        "<p>VIA ARTERIAL - aquela caracterizada por interseções em nível.</p>"
    )
    termos = [d["termo"] for d in p.definicoes]
    assert termos == ["RODOVIA", "SEMI-REBOQUE", "VIA ARTERIAL"]
    assert p.definicoes[0]["definicao"] == "via rural pavimentada."
    assert p.anexos[0]["titulo"] == "DOS CONCEITOS E DEFINIÇÕES"
    assert p.meta["fecho"] == ["Brasília, 23 de setembro de 1997."]


# --------------------------------------------------------------------------- #
# Integração com o HTML real salvo do Planalto
# --------------------------------------------------------------------------- #
real = pytest.mark.skipif(not HTML_REAL.exists(), reason="l9503compilado.htm ausente")


@pytest.fixture(scope="module")
def saida(tmp_path_factory):
    out = tmp_path_factory.mktemp("saida")
    meta = run(HTML_REAL, out)
    doc = json.loads((out / "ctb.json").read_text(encoding="utf-8"))
    return meta, doc, out


def _d(doc, did):
    for a in doc["artigos"]:
        for d in a["dispositivos"]:
            if d["id"] == did:
                return d
    raise KeyError(did)


@real
def test_real_contagens(saida):
    meta, doc, _ = saida
    c = meta["contagem"]
    assert c["artigos"] >= 380 and c["definicoes"] >= 110 and c["infracoes"] >= 150
    nums = [a["numero"] for a in doc["artigos"]]
    assert len(nums) == len(set(nums)), "artigo duplicado"
    assert nums[0] == "1" and "341" in nums


@real
def test_real_art_280_requisitos_do_auto(saida):
    _, doc, _ = saida
    art = next(a for a in doc["artigos"] if a["numero"] == "280")
    incisos = [d["rotulo"] for d in art["dispositivos"] if d["tipo"] == "inciso"]
    assert incisos == ["I", "II", "III", "IV", "V", "VI"]
    assert _d(doc, "art-280.inc-II")["texto"] == "local, data e hora do cometimento da infração;"


@real
def test_real_art_218_III(saida):
    _, _, out = saida
    inf = json.loads((out / "ctb_infracoes.json").read_text(encoding="utf-8"))
    bloco = next(x for x in inf if "art-218.inc-III" in x["ids"])
    assert bloco["infracao"] == "gravíssima"
    assert "suspensão do direito de dirigir" in bloco["penalidade"]


@real
def test_real_art_147_par_2_recuperado(saida):
    _, doc, _ = saida
    assert _d(doc, "art-147.par-2")["texto"].startswith("O exame de aptidão física e mental")
    assert _d(doc, "art-147.par-2.inc-III")["status"] == "vigente"


@real
def test_real_status(saida):
    _, doc, _ = saida
    assert next(a for a in doc["artigos"] if a["numero"] == "262")["status"] == "revogado"
    d = _d(doc, "art-139-A.inc-I")
    assert d["status"] == "vigente" and any(n["sem_efeito"] for n in d["notas"])


@real
def test_real_texto_sem_notas_residuais(saida):
    _, doc, _ = saida
    residuo = re.compile(r"\((Redação dada|Incluíd|Revogad[oa] pel|Vide )")
    ruins = [d["id"] for a in doc["artigos"] for d in a["dispositivos"] if residuo.search(d["texto"])]
    assert ruins == []


@real
def test_real_definicoes(saida):
    _, doc, _ = saida
    termos = {d["termo"] for d in doc["definicoes"]}
    assert {"VIA ARTERIAL", "RODOVIA", "SEMI-REBOQUE", "ACOSTAMENTO"} <= termos


@real
def test_real_saidas_existem(saida):
    _, _, out = saida
    for f in ("ctb.json", "ctb.md", "ctb_chunks.jsonl", "ctb_infracoes.json", "ctb_definicoes.json"):
        assert (out / f).stat().st_size > 0
    linhas = (out / "ctb_chunks.jsonl").read_text(encoding="utf-8").splitlines()
    assert all(json.loads(l)["texto"] for l in linhas)
