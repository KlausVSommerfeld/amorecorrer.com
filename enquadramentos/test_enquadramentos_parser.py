"""Testes do extrator contra o PDF real. Rodar de dentro de enquadramentos/:

    PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import enquadramentos_parser as ep  # noqa: E402


@pytest.fixture(scope="module")
def ctb():
    return ep.carregar_ctb(str(ep.CTB_DIR))


@pytest.fixture(scope="module")
def texto():
    return ep.texto_do_anexo(ep.FONTE)


@pytest.fixture(scope="module")
def alteracoes():
    return json.loads(ep.ALTERACOES.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def tabela(ctb, texto, alteracoes):
    return ep.gerar(ctb, texto, alteracoes, hashlib.sha256(ep.FONTE.read_bytes()).hexdigest())


def por_codigo(tabela):
    return {i["codigo"]: i for i in tabela["enquadramentos"]}


def test_fonte_e_a_conferida():
    assert hashlib.sha256(ep.FONTE.read_bytes()).hexdigest() == (
        "81bceadbc1e48b84d7e5f21b1e8f1fbe79da14dbdb7b6768dc5ea99b13035946"
    )


def test_le_todas_as_linhas_do_anexo(texto):
    assert len(ep.linhas(texto)) == 439


def test_so_o_6068_5_e_rejeitado(tabela):
    # Nenhuma "linha ilegível": toda linha do PDF virou código ou rejeição com motivo.
    assert [(r["codigo"], r["motivo"]) for r in tabela["rejeitados"]] == [
        ("6068-5", "amparo com outra norma")
    ]


def test_totais(tabela):
    assert tabela["meta"]["total"] == 442
    assert tabela["meta"]["na_lista"] == 427


@pytest.mark.parametrize(
    "codigo,dispositivo,gravidade,na_lista",
    [
        ("7455-0", "art. 218, I", "média", True),
        ("7463-0", "art. 218, II", "grave", True),
        ("7471-0", "art. 218, III", "gravíssima", True),
        ("7633-1", "art. 252, parágrafo único", "gravíssima", True),  # "§ único"
        ("5070-1", "art. 163", "gravíssima", True),  # 163 c/c 162, II
        ("7056-2", "art. 244, III", "média", True),  # c/c § 1º, de ciclos
        ("7609-0", "art. 253-A, § 1º", "gravíssima", True),  # "1º" repetido no PDF
        ("7382-0", "art. 254, I", "leve", True),  # pedestre, "3 - Leve 50%"
        ("6785-1", 'art. 231, II, "a"', "gravíssima", True),  # alínea
        ("7803-0", "art. 165-B, parágrafo único", "gravíssima", True),  # Portaria 423/2024
        ("5002-0", "art. 257, § 8º", None, False),
        ("7480-1", "art. 93", None, False),
    ],
)
def test_linhas_conhecidas(tabela, codigo, dispositivo, gravidade, na_lista):
    item = por_codigo(tabela)[codigo]
    assert (item["dispositivo"], item["gravidade"], item["na_lista"]) == (dispositivo, gravidade, na_lista)


def test_descricao_sem_as_quebras_do_pdf(tabela):
    t = por_codigo(tabela)
    assert t["7455-0"]["descricao"] == "Transitar em velocidade superior à máxima permitida em até 20%"
    assert t["5169-2"]["descricao"] == (
        "Dirigir sob a influência de qquer substância psicoativa que deter. dependência"
    )


def test_desdobramentos(tabela):
    assert {"5100-1", "5100-2", "5100-3", "5100-4"} <= set(por_codigo(tabela))


def test_lista_so_nos_artigos_de_infracao(tabela):
    for item in tabela["enquadramentos"]:
        if item["na_lista"]:
            numero = int(re.match(r"art\. (\d+)", item["dispositivo"]).group(1))
            assert 162 <= numero <= 255, item["codigo"]
            assert item["gravidade"] in {"leve", "média", "grave", "gravíssima"}, item["codigo"]


def test_amparo_desconhecido_reprova(ctb):
    r = ep.conferir(ctb, "0000-0", "x", "999", "Condutor", None, "teste")
    assert r["motivo"] == "amparo não reconhecido no CTB"


def test_gravidade_divergente_reprova(ctb):
    r = ep.conferir(ctb, "0000-0", "x", "218, I", "Condutor", "leve", "teste")
    assert r["motivo"] == "gravidade leve na tabela, média no CTB"


def test_arquivos_gerados_estao_em_dia(tabela):
    assert json.loads(ep.SAIDA.read_text(encoding="utf-8")) == tabela
    assert json.loads(ep.SAIDA_SITE.read_text(encoding="utf-8")) == ep.projecao_do_site(tabela)
