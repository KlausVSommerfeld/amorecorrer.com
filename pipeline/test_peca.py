"""Testes de peca.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_peca -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from peca import (
    cortar_depois_do_pedido,
    fecho,
    limpar_markdown,
    paragrafo_para_pdf,
    remover_prefacio,
    texto_da_peca,
)

CASO = {
    "nome": "Mariana Souza Lima",
    "cpf": "52998224725",
    "cidade": "Rio de Janeiro",
    "estado": "rj",
}

# Trecho real da rodada 3 de 25/09/2026 (prompt antigo, caso completo).
RASCUNHO_REAL = """**DEFESA PRÉVIA**

**Auto de Infração nº:** E123456789
**Órgão Autuador:** CET-RIO

---

MARIANA SOUZA LIMA vem apresentar **DEFESA PRÉVIA** pelos motivos a seguir.

Diante do exposto, requer-se o cancelamento do auto de infração.

Nestes termos, pede deferimento.

Rio de Janeiro/RJ, 20 de agosto de 2026.

Mariana Souza Lima
CPF: 529.982.247-25"""


class TestLimparMarkdown(unittest.TestCase):
    def test_negrito_sai(self):
        self.assertEqual(limpar_markdown("**DEFESA PRÉVIA** e __outra__"), "DEFESA PRÉVIA e outra")

    def test_cerquilha_de_titulo_sai(self):
        self.assertEqual(limpar_markdown("## Dos fatos\nTexto"), "Dos fatos\nTexto")

    def test_linha_de_tracos_sai(self):
        self.assertEqual(limpar_markdown("A\n\n---\n\nB"), "A\n\nB")
        self.assertEqual(limpar_markdown("A\n\n***\n\nB"), "A\n\nB")

    def test_linha_em_branco_para_preencher_fica(self):
        # O próprio prompt pede "________" para dado ausente.
        texto = "Auto de Infração nº ________\n\n________"
        self.assertEqual(limpar_markdown(texto), texto)


class TestCortarDepoisDoPedido(unittest.TestCase):
    def test_corta_local_data_e_assinatura(self):
        t = "Requer-se o cancelamento.\n\nNestes termos, pede deferimento.\n\nRio, 20 de agosto de 2026.\n\nFulana"
        self.assertEqual(cortar_depois_do_pedido(t), "Requer-se o cancelamento.\n\nNestes termos, pede deferimento.")

    def test_pedido_em_duas_linhas(self):
        t = "Termos em que,\nPede deferimento.\n\n[Local], [data].\n[Nome do recorrente]"
        self.assertEqual(cortar_depois_do_pedido(t), "Termos em que,\nPede deferimento.")

    def test_variantes_do_pedido(self):
        for verbo in ("pede", "requer", "espera", "aguarda", "peço"):
            with self.subTest(verbo=verbo):
                t = f"Nestes termos, {verbo} deferimento.\n\nObservação: preencha os campos."
                self.assertEqual(cortar_depois_do_pedido(t), f"Nestes termos, {verbo} deferimento.")

    def test_sem_pedido_so_tira_observacao_final(self):
        t = "Requer-se o cancelamento.\n\nObservação: os campos entre colchetes precisam ser completados."
        self.assertEqual(cortar_depois_do_pedido(t), "Requer-se o cancelamento.")
        t2 = "Requer-se o cancelamento.\n\n*Obs.: revise antes de protocolar.*"
        self.assertEqual(cortar_depois_do_pedido(limpar_markdown(t2)), "Requer-se o cancelamento.")

    def test_sem_pedido_nem_nota_fica_igual(self):
        self.assertEqual(cortar_depois_do_pedido("Um.\n\nDois."), "Um.\n\nDois.")


class TestPrefacio(unittest.TestCase):
    def test_prefacio_curto_sai(self):
        t = "Com base nos dados informados, apresento o rascunho do recurso:\n\nÀ Autoridade de Trânsito,"
        self.assertEqual(remover_prefacio(t), "À Autoridade de Trânsito,")

    def test_primeiro_paragrafo_da_peca_fica(self):
        t = "Com base no art. 218 do CTB, a autuação é indevida porque…\n\nSegundo parágrafo."
        self.assertEqual(remover_prefacio(t), t)


class TestFecho(unittest.TestCase):
    def test_fecho_completo(self):
        self.assertEqual(
            fecho(CASO),
            "Rio de Janeiro/RJ, ____ de ______________ de ________.\n\n"
            "______________________________\n"
            "Mariana Souza Lima\n"
            "CPF 529.982.247-25",
        )

    def test_data_sempre_em_branco(self):
        self.assertNotIn("2026", fecho(dict(CASO, data_infracao="2026-08-14T07:52:00", expedida_em="20/08/2026")))

    def test_sem_cidade_nem_cpf_viram_linha(self):
        f = fecho({"nome": "Fulana"})
        self.assertTrue(f.startswith("______________________, ____ de"))
        self.assertIn("\nCPF ______________", f)

    def test_cidade_sem_uf(self):
        self.assertTrue(fecho(dict(CASO, estado=None)).startswith("Rio de Janeiro, ____ de"))

    def test_cpf_fora_do_padrao_vai_como_veio(self):
        self.assertIn("CPF 123", fecho(dict(CASO, cpf="123")))


class TestTextoDaPeca(unittest.TestCase):
    def test_rascunho_real_sai_limpo_e_com_fecho_do_codigo(self):
        t = texto_da_peca(RASCUNHO_REAL, CASO)
        self.assertNotIn("**", t)
        self.assertNotIn("---", t)
        self.assertNotIn("20 de agosto de 2026", t)
        self.assertEqual(t.count("Nestes termos, pede deferimento."), 1)
        self.assertTrue(t.endswith("Mariana Souza Lima\nCPF 529.982.247-25"))
        self.assertIn("pede deferimento.\n\nRio de Janeiro/RJ, ____ de", t)

    def test_sem_ia_continua_funcionando(self):
        t = texto_da_peca("[Modo sem IA: defina DEEPSEEK_API_KEY] Rascunho indisponível.", CASO)
        self.assertTrue(t.startswith("[Modo sem IA"))
        self.assertTrue(t.endswith("CPF 529.982.247-25"))


class TestParagrafoParaPdf(unittest.TestCase):
    def test_quebra_de_linha_vira_br(self):
        self.assertEqual(paragrafo_para_pdf("Mariana\nCPF 1"), "Mariana<br/>CPF 1")

    def test_escapa_html(self):
        self.assertEqual(paragrafo_para_pdf("A & B <x>"), "A &amp; B &lt;x&gt;")


if __name__ == "__main__":
    unittest.main()
