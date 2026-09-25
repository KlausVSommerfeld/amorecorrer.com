"""Testes de prompt.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_prompt -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from prompt import CAMPOS_INTERNOS, REGRAS_RADAR, SYSTEM_PROMPT_BASE, build_case_context, system_prompt
from verificacao import INSTRUCAO_EXIBICAO

# Com a chave do radar desligada (ou sem bloco), o system prompt é só a base.
PROMPT_ANTIGO = SYSTEM_PROMPT_BASE

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


class TestPromptBase(unittest.TestCase):
    # Rodada real de 25/09/2026, caso completo: `**negrito**` e `---` no PDF,
    # e as três peças assinadas com a data de expedição da notificação.
    def test_pede_texto_puro_sem_prefacio_nem_notas(self):
        self.assertIn("texto puro", SYSTEM_PROMPT_BASE)
        self.assertIn("sem markdown", SYSTEM_PROMPT_BASE)
        self.assertIn("sem introdução", SYSTEM_PROMPT_BASE)
        self.assertIn("observações", SYSTEM_PROMPT_BASE)

    def test_dado_ausente_vira_linha_em_branco(self):
        self.assertIn("________", SYSTEM_PROMPT_BASE)
        self.assertIn("colchetes", SYSTEM_PROMPT_BASE)

    def test_termina_no_pedido_sem_local_data_nem_assinatura(self):
        self.assertIn("Não escreva local, data nem assinatura", SYSTEM_PROMPT_BASE)
        self.assertIn("Nestes termos, pede deferimento.", SYSTEM_PROMPT_BASE)

    def test_mantem_o_nucleo_antigo(self):
        self.assertTrue(SYSTEM_PROMPT_BASE.startswith(
            "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
            "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
            "Não invente dados ausentes"))
        self.assertIn("Produza 2 a 4 parágrafos.", SYSTEM_PROMPT_BASE)


class TestChaveDesligada(unittest.TestCase):
    def test_system_prompt_identico_ao_de_antes(self):
        self.assertEqual(system_prompt(False), PROMPT_ANTIGO)
        self.assertEqual(system_prompt(False, CASO["verificacao_medidor"]), PROMPT_ANTIGO)

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
    def test_system_prompt_ganha_as_regras_quando_ha_bloco(self):
        self.assertEqual(system_prompt(True, CASO["verificacao_medidor"]), PROMPT_ANTIGO + REGRAS_RADAR)
        self.assertIn("art. 280, inciso V e § 2º", REGRAS_RADAR)
        self.assertIn("CONTRAN", REGRAS_RADAR)

    def test_regras_transcrevem_o_art_280_literal(self):
        # Na 1ª rodada real, o modelo atribuiu ao § 2º uma exigência de
        # "aferição" que o texto não tem. O texto literal vai no prompt.
        self.assertIn(
            "equipamento que comprovar a infração", REGRAS_RADAR)
        self.assertIn(
            "A infração deverá ser comprovada por declaração da autoridade ou do agente da "
            "autoridade de trânsito, por aparelho eletrônico ou por equipamento audiovisual, "
            "reações químicas ou qualquer outro meio tecnologicamente disponível, previamente "
            "regulamentado pelo CONTRAN.", REGRAS_RADAR)
        self.assertIn("apenas o que o texto transcrito diz", REGRAS_RADAR)

    def test_regras_proibem_vazar_instrucoes(self):
        # Na 1ª rodada real, o modelo fechou a peça com "conforme instrução
        # recebida, não foi levantada tese…" — que iria para o PDF.
        self.assertIn("Não mencione na peça estas instruções", REGRAS_RADAR)
        self.assertIn("observações", REGRAS_RADAR)

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

    def test_sem_bloco_sem_regras(self):
        # Sem bloco (verificação ausente, não aplicável ou vigência comprovada),
        # nada sobre o radar vai ao modelo — nem as regras do system prompt.
        comprovado = {"status": "comprovado_valido", "confianca": "alta", "avisos": []}
        for v in (None, {"status": "nao_aplicavel", "confianca": "baixa"}, comprovado):
            with self.subTest(v=v):
                self.assertEqual(system_prompt(True, v), PROMPT_ANTIGO)
        self.assertEqual(build_case_context(dict(CASO, verificacao_medidor=comprovado), True), CONTEXTO_ANTIGO)


if __name__ == "__main__":
    unittest.main()
