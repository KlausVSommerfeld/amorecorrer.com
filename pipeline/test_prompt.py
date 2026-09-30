"""Testes de prompt.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_prompt -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from prompt import (
    CAMPOS_INTERNOS,
    REGRAS_RADAR,
    SYSTEM_PROMPT_BASE,
    REGRA_BASE_LEGAL,
    REGRA_ENQUADRAMENTO,
    REGRA_SEM_ENQUADRAMENTO,
    RespostaDoModeloInvalida,
    argumentos_da_chamada,
    build_case_context,
    pedido_de_correcao,
    system_prompt,
    texto_da_resposta,
)
from verificacao import INSTRUCAO_EXIBICAO

# Sem bloco do radar, o system prompt é a base mais a regra de base legal —
# que entra em toda peça desde a integração do CTB (29/09/2026).
PROMPT_ANTIGO = SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO

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


class TestChamadaAoModelo(unittest.TestCase):
    # Rodada real de 25/09/2026: o deepseek-flash vem com raciocínio LIGADO por
    # padrão, e com max_tokens=1200 gastou os 1200 tokens pensando — a peça
    # voltou vazia, nos dois casos testados. O deepseek-chat de antes já era
    # o flash sem raciocínio (a API o redirecionava).
    def test_raciocinio_desligado_explicitamente(self):
        args = argumentos_da_chamada("deepseek-flash", "SISTEMA", "CONTEXTO")
        self.assertEqual(args["extra_body"], {"thinking": {"type": "disabled"}})

    def test_mantem_modelo_limite_e_temperatura(self):
        args = argumentos_da_chamada("deepseek-flash", "SISTEMA", "CONTEXTO")
        self.assertEqual(args["model"], "deepseek-flash")
        self.assertEqual(args["max_tokens"], 1200)
        self.assertEqual(args["temperature"], 0.4)
        self.assertEqual(args["messages"], [
            {"role": "system", "content": "SISTEMA"},
            {"role": "user", "content": "CONTEXTO"},
        ])

    def test_resposta_completa_passa(self):
        self.assertEqual(texto_da_resposta("  Texto da peça.  ", "stop"), "Texto da peça.")

    def test_resposta_vazia_nunca_vira_peca(self):
        # Antes virava "(resposta vazia do modelo)" — no PDF e no e-mail do cliente.
        for vazio in (None, "", "   \n "):
            with self.subTest(conteudo=vazio):
                with self.assertRaises(RespostaDoModeloInvalida):
                    texto_da_resposta(vazio, "stop")

    def test_resposta_cortada_nunca_vira_peca(self):
        with self.assertRaises(RespostaDoModeloInvalida):
            texto_da_resposta("Excelentíssimo Senhor, venho apresentar", "length")

    def test_erro_e_runtime_error(self):
        # O worker já trata RuntimeError: caso vai a failed, sem e-mail ao cliente.
        self.assertTrue(issubclass(RespostaDoModeloInvalida, RuntimeError))


class TestBaseLegalNoPrompt(unittest.TestCase):
    def test_regra_de_base_legal_em_toda_peca(self):
        self.assertIn("exclusivamente a base normativa do CTB", REGRA_BASE_LEGAL)
        self.assertIn("Não cite outras leis, códigos, resoluções, portarias nem jurisprudência", REGRA_BASE_LEGAL)
        self.assertEqual(system_prompt(False), SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO)

    def test_regra_de_enquadramento_em_toda_peca(self):
        # 29/09/2026: a IA calculou 97/80 = 21,25% e sustentou o inciso II contra o cliente.
        self.assertIn("mais severos do que os indicados no auto", REGRA_ENQUADRAMENTO)
        self.assertIn("não calcule percentuais de excesso de velocidade", REGRA_ENQUADRAMENTO)
        for args in ((False,), (True, CASO["verificacao_medidor"])):
            with self.subTest(args=args):
                self.assertIn(REGRA_ENQUADRAMENTO, system_prompt(*args))

    def test_sem_enquadramento_proibe_o_artigo_da_infracao(self):
        self.assertIn("não cite o artigo da infração", REGRA_SEM_ENQUADRAMENTO)
        self.assertEqual(system_prompt(False, sem_enquadramento=True),
                         SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO + REGRA_SEM_ENQUADRAMENTO)

    def test_ordem_com_radar(self):
        v = CASO["verificacao_medidor"]
        self.assertEqual(system_prompt(True, v, sem_enquadramento=True),
                         SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO + REGRA_SEM_ENQUADRAMENTO + REGRAS_RADAR)

    def test_pedido_de_correcao_lista_cada_recusa(self):
        class R:
            def __init__(self, trecho, motivo):
                self.trecho, self.motivo = trecho, motivo
        texto = pedido_de_correcao([R("art. 24 do Código Penal", "norma fora do CTB"),
                                    R("art. 29", "não consta da base normativa fornecida")])
        self.assertIn("Reescreva a peça inteira", texto)
        self.assertIn("'art. 24 do Código Penal' (norma fora do CTB)", texto)
        self.assertIn("'art. 29' (não consta da base normativa fornecida)", texto)

    def test_historico_vai_depois_da_primeira_mensagem(self):
        hist = [{"role": "assistant", "content": "PECA"}, {"role": "user", "content": "CORRIJA"}]
        args = argumentos_da_chamada("deepseek-flash", "S", "C", hist)
        self.assertEqual([m["role"] for m in args["messages"]], ["system", "user", "assistant", "user"])
        self.assertEqual(args["extra_body"], {"thinking": {"type": "disabled"}})
        self.assertEqual(argumentos_da_chamada("deepseek-flash", "S", "C")["messages"][-1],
                         {"role": "user", "content": "C"})


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
