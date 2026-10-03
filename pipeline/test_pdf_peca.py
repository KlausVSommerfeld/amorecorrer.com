"""Testes de pdf_peca.py. Precisam de reportlab e pyphen; sem eles, pulam.
Fora do venv, de dentro de pipeline/:

    PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_pdf_peca -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from peca import DEFESA_PREVIA, RECURSO_JARI, montar_peca

TEM_DEPS = all(importlib.util.find_spec(m) for m in ("reportlab", "pyphen"))
if TEM_DEPS:
    import pdf_peca
    from pdf_peca import FonteAusente, gerar_pdf

CASO = {
    "case_id": "CASO_abc", "nome": "Mariana Souza Lima", "cpf": "52998224725",
    "cnh": "04512345678", "endereco": "Rua das Laranjeiras, 120, apto 302", "cep": "22240003",
    "cidade": "Rio de Janeiro", "estado": "RJ", "email": "mariana@example.com",
    "orgao_autuador": "CET-RIO", "numero_auto": "E123456789", "placa": "RIO2A19",
    "data_infracao": "2026-08-14T07:52:00", "especie_documento": DEFESA_PREVIA,
}
RASCUNHO = (
    "DOS FATOS\n\nNo dia 14/08/2026, às 07h52, o veículo foi autuado na Av. Brasil, altura do "
    "nº 5000, com velocidade considerada de 90 km/h em via de 80 km/h.\n\n"
    "DOS FUNDAMENTOS\n\nO art. 90 do CTB afasta a sanção quando a sinalização é insuficiente, "
    "e não havia placa de velocidade no trecho."
)


def peca(rascunho=RASCUNHO, caso=CASO):
    return montar_peca(rascunho, caso, "desclassificacao", "I", True)


@unittest.skipUnless(TEM_DEPS, "precisa de reportlab e pyphen (venv ou PYTHONPATH)")
class TestGerarPdf(unittest.TestCase):
    def test_pdf_valido_com_as_fontes_embutidas(self):
        b = gerar_pdf(peca())
        self.assertTrue(b.startswith(b"%PDF-"))
        for fonte in (b"SourceSerif4-Regular", b"SourceSerif4-Semibold", b"SourceSerif4-Bold",
                      b"IBMPlexMono-Regular", b"IBMPlexMono-Medium"):
            with self.subTest(fonte=fonte):
                self.assertIn(fonte, b)
        self.assertNotIn(b"/BaseFont /Helvetica", b)

    def test_numeracao_em_toda_pagina(self):
        longo = "Parágrafo com texto suficiente para ocupar várias linhas da página impressa. " * 6
        rascunho = ("DOS FATOS\n\n" + "\n\n".join([longo] * 5)
                    + "\n\nDOS FUNDAMENTOS\n\n" + "\n\n".join([longo] * 8))
        with mock.patch.object(pdf_peca._CanvasNumerado, "drawRightString") as desenho:
            gerar_pdf(peca(rascunho))
        numeros = [chamada.args[2] for chamada in desenho.call_args_list]
        self.assertGreaterEqual(len(numeros), 2)
        self.assertEqual(numeros, [f"{i}/{len(numeros)}" for i in range(1, len(numeros) + 1)])

    def test_texto_do_modelo_com_marcacao(self):
        b = gerar_pdf(peca("DOS FATOS\n\nValor <b>x</b> & <script>.\n\nDOS FUNDAMENTOS\n\nArt. 90 & <i>."))
        self.assertTrue(b.startswith(b"%PDF-"))

    def test_dados_do_caso_com_marcacao(self):
        caso = dict(CASO, nome="Ana <b>& Cia", endereco="Rua A & B <fundos>", orgao_autuador="DER & <X>")
        self.assertTrue(gerar_pdf(peca(caso=caso)).startswith(b"%PDF-"))

    def test_quadro_do_recurso_com_valores_longos(self):
        caso = dict(CASO, especie_documento=RECURSO_JARI,
                    notificacao_penalidade="P" + "9" * 40, numero_auto="", placa="")
        self.assertTrue(gerar_pdf(montar_peca(RASCUNHO, caso)).startswith(b"%PDF-"))

    def test_fonte_ausente_acusa(self):
        with tempfile.TemporaryDirectory() as vazio, \
                mock.patch.object(pdf_peca, "FONTES_DIR", Path(vazio)), \
                mock.patch.object(pdf_peca, "_registradas", False):
            with self.assertRaises(FonteAusente):
                pdf_peca.registrar_fontes()


if __name__ == "__main__":
    unittest.main()
