"""Testes do consulta.py (dependem de saida/ctb.json gerado pelo parser)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from consulta import CTB, Ref, _singular, parse_ref  # noqa: E402

JSON = RAIZ / "saida" / "ctb.json"


@pytest.mark.parametrize(
    "txt,esperado",
    [
        ("art. 218, III", Ref("218", inciso="III")),
        ("218 III", Ref("218", inciso="III")),
        ("218, inciso III", Ref("218", inciso="III")),
        ("280 § 2º", Ref("280", paragrafo="2")),
        ("art. 2º, parágrafo único", Ref("2", paragrafo="unico")),
        ("29, III, c", Ref("29", inciso="III", alinea="c")),
        ('230, V, "a"', Ref("230", inciso="V", alinea="a")),
        ("art. 7º-A", Ref("7-A")),
        ("61 §1 II a item 2", Ref("61", paragrafo="1", inciso="II", alinea="a", item="2")),
        ("147, § 1º-A", Ref("147", paragrafo="1-A")),
        # Inciso em algarismo arábico, só com a palavra "inciso" (ou "inc."): é como
        # o cliente digita no questionário (teste ponta a ponta de 08/10/2026).
        ("Artigo 218, inciso 2, do CTB", Ref("218", inciso="II")),
        ("art. 218, inc. 3", Ref("218", inciso="III")),
        ("218, inciso 1º", Ref("218", inciso="I")),
        ("art. 230, inciso 5, a", Ref("230", inciso="V", alinea="a")),
        ("280, § 2º, inciso 1", Ref("280", paragrafo="2", inciso="I")),
        # Número solto continua sem inciso: "218, 2" é ambíguo.
        ("218, 2", Ref("218")),
    ],
)
def test_parse_ref(txt, esperado):
    assert parse_ref(txt) == esperado


@pytest.mark.parametrize("w,s", [("vias", "via"), ("arteriais", "arterial"), ("rodovias", "rodovia"), ("rapido", "rapido")])
def test_singular(w, s):
    assert _singular(w) == s


pytestmark_real = pytest.mark.skipif(not JSON.exists(), reason="rode ctb_parser.py antes")


@pytest.fixture(scope="module")
def ctb():
    return CTB.carregar(JSON)


@pytestmark_real
def test_dispositivo_e_sancao(ctb):
    md = ctb.dispositivo_md("218, III")
    assert "Transitar em velocidade superior" in md and "gravíssima" in md


@pytestmark_real
def test_sancao_de_grupo(ctb):
    inf = ctb.infracao("230, V")
    assert inf["infracao"] == "gravíssima" and "art. 230, VI" in inf["dispositivos"]


@pytestmark_real
def test_referencia_inexistente(ctb):
    with pytest.raises(KeyError):
        ctb.dispositivo("999")
    with pytest.raises(KeyError):
        ctb.dispositivo("218, XX")


@pytestmark_real
def test_contexto_peticao(ctb):
    md = ctb.contexto_peticao(["218, III"])
    assert "## Enquadramento do auto: 218, III" in md
    assert "### Art. 281" in md and "### Art. 280" in md
    assert "**VIA ARTERIAL**" in md  # 'vias arteriais' no caput → definição do Anexo I
    assert len(md) < 60_000  # cabe folgado no contexto


@pytestmark_real
def test_contexto_sem_processuais(ctb):
    md = ctb.contexto_peticao(["181, XVII"], processuais=[])
    assert "Processo administrativo" not in md
