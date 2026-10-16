"""Testes de tabela_enquadramentos.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_tabela_enquadramentos -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import json
import tempfile
import unittest
from pathlib import Path

from tabela_enquadramentos import TabelaIndisponivel, carregar_tabela, ler_codigo

RAIZ = Path(__file__).resolve().parent.parent
CASOS = json.loads((RAIZ / "tests" / "compartilhados" / "codigos.json").read_text(encoding="utf-8"))


class TestLerCodigo(unittest.TestCase):
    def test_paridade_com_o_site(self):
        for caso in CASOS:
            with self.subTest(texto=caso["texto"]):
                self.assertEqual(ler_codigo(caso["texto"]), caso["codigo"])

    def test_none(self):
        self.assertIsNone(ler_codigo(None))


def _tabela_em(pasta: Path, dados) -> str:
    arquivo = pasta / "enquadramentos.json"
    arquivo.write_text(dados if isinstance(dados, str) else json.dumps(dados), encoding="utf-8")
    return str(arquivo)


MINIMA = {
    "meta": {"ctb_sha256": "abc"},
    "enquadramentos": [
        {"codigo": "7455-0", "dispositivo": "art. 218, I", "na_lista": True},
        {"codigo": "5002-0", "dispositivo": "art. 257, § 8º", "na_lista": False},
    ],
}


class TestCarregarTabela(unittest.TestCase):
    def test_dispositivo_so_dos_codigos_da_lista(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = carregar_tabela(_tabela_em(Path(tmp), MINIMA))
        self.assertEqual(t.ctb_sha256, "abc")
        self.assertEqual(t.dispositivo("7455-0"), "art. 218, I")
        self.assertIsNone(t.dispositivo("5002-0"))
        self.assertIsNone(t.dispositivo("9999-9"))
        self.assertIsNone(t.dispositivo(None))

    def test_arquivo_ausente(self):
        with self.assertRaises(TabelaIndisponivel):
            carregar_tabela("/nao/existe/enquadramentos.json")

    def test_json_invalido_e_falha_nao_fica_em_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            caminho = _tabela_em(Path(tmp), "Sim" + json.dumps(MINIMA))
            with self.assertRaises(TabelaIndisponivel):
                carregar_tabela(caminho)
            _tabela_em(Path(tmp), MINIMA)
            self.assertEqual(carregar_tabela(caminho).ctb_sha256, "abc")

    def test_forma_errada(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(TabelaIndisponivel):
                carregar_tabela(_tabela_em(Path(tmp), {"meta": {}}))


if __name__ == "__main__":
    unittest.main()
