"""Testes de prompt.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_prompt -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from prompt import CAMPOS_INTERNOS, REGRAS_RADAR, build_case_context, system_prompt
from verificacao import INSTRUCAO_EXIBICAO

# O system prompt exato de antes da Fase 5 (worker.py, call_deepseek).
PROMPT_ANTIGO = (
    "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
    "Não invente dados ausentes. Produza 2 a 4 parágrafos."
)

CASO = {
    "id": "uuid",
    "case_id": "CASO_x",
    "nome": "Fulana",
    "placa": "ABC1D23",
    "velocidade_aferida": 55,
    "justificativa": "",
    "cpf": None,
    "medidor_numero_serie": "2000065",
    "verificacao_medidor": {
        "status": "nao_comprovado",
        "confianca": "baixa",
        "metodo_match": "numero_serie",
        "certificado_vigente": None,
        "avisos": [],
    },
}

# O contexto exato que a implementação de antes produzia para CASO, sem a
# coluna nova (que não existia).
CONTEXTO_ANTIGO = (
    "Dados do caso para o recurso:\n"
    "medidor_numero_serie: 2000065\n"
    "nome: Fulana\n"
    "placa: ABC1D23\n"
    "velocidade_aferida: 55"
)


class TestChaveDesligada(unittest.TestCase):
    def test_system_prompt_identico_ao_de_antes(self):
        self.assertEqual(system_prompt(False), PROMPT_ANTIGO)

    def test_contexto_identico_ao_de_antes(self):
        self.assertEqual(build_case_context(CASO, False), CONTEXTO_ANTIGO)
        self.assertEqual(build_case_context(CASO), CONTEXTO_ANTIGO)

    def test_dict_cru_nunca_entra(self):
        self.assertIn("verificacao_medidor", CAMPOS_INTERNOS)
        for ativa in (False, True):
            with self.subTest(tese_ativa=ativa):
                ctx = build_case_context(CASO, ativa)
                self.assertNotIn("verificacao_medidor", ctx)
                self.assertNotIn("{'status'", ctx)


class TestChaveLigada(unittest.TestCase):
    def test_system_prompt_ganha_as_regras(self):
        self.assertEqual(system_prompt(True), PROMPT_ANTIGO + REGRAS_RADAR)
        self.assertIn("art. 280, inciso V e § 2º", REGRAS_RADAR)
        self.assertIn("CONTRAN", REGRAS_RADAR)

    def test_bloco_logo_depois_do_cabecalho(self):
        ctx = build_case_context(CASO, True)
        self.assertTrue(ctx.startswith("Dados do caso para o recurso:\nVerificação metrológica"))
        self.assertIn(INSTRUCAO_EXIBICAO, ctx)
        self.assertTrue(ctx.endswith("velocidade_aferida: 55"))

    def test_bloco_fica_fora_do_corte_de_200_linhas(self):
        caso = dict(CASO, **{f"campo_{i:03d}": "x" for i in range(300)})
        ctx = build_case_context(caso, True)
        self.assertIn(INSTRUCAO_EXIBICAO, ctx)
        linhas_de_campo = [l for l in ctx.splitlines() if l.startswith("campo_")]
        self.assertEqual(len(linhas_de_campo), 200)

    def test_nao_aplicavel_sem_bloco(self):
        caso = dict(CASO, verificacao_medidor={"status": "nao_aplicavel", "confianca": "baixa"})
        self.assertEqual(build_case_context(caso, True), CONTEXTO_ANTIGO)


if __name__ == "__main__":
    unittest.main()
