"""Testes de conferencia.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_conferencia -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import asyncio
import unittest
from pathlib import Path

from base_legal import carregar_ctb, montar_base
from conferencia import CitacaoForaDaBase, conferir_citacoes, gerar_com_conferencia, resumo_alertas

CTB_DIR = str(Path(__file__).resolve().parent.parent / "CTB-compilado_files")

# Trechos da peça real do caminho A no caso 218, III (teste de 26/09/2026).
PECA_BOA = (
    "Mariana Souza Lima apresenta defesa prévia em face do auto lavrado com fundamento no "
    "art. 218, III, do Código de Trânsito Brasileiro. O art. 281, § 1º, II, do CTB determina "
    "que o auto de infração será arquivado e seu registro julgado insubsistente se, no prazo "
    "máximo de trinta dias, não for expedida a notificação da autuação. Ademais, nos termos do "
    "art. 90 da Lei nº 9.503/1997, não serão aplicadas as sanções quando a sinalização for "
    "insuficiente, e o art. 280 exige os requisitos do auto. Nestes termos, pede deferimento."
)


class TestConferencia(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = carregar_ctb(CTB_DIR)
        cls.base = montar_base(cls.c, "Art. 218, III, do CTB")

    def conferir(self, texto):
        return conferir_citacoes(texto, self.base, self.c)

    def motivos(self, texto):
        return [(r.trecho, r.motivo) for r in self.conferir(texto).recusas]

    def test_peca_real_passa(self):
        self.assertEqual(self.conferir(PECA_BOA).recusas, [])

    def test_normas_externas_recusadas(self):
        for trecho in ("o art. 24 do Código Penal", "a Resolução nº 798/2020 do CONTRAN",
                       "a Lei nº 9.784/1999", "a Constituição Federal", "a pacífica jurisprudência",
                       "conforme resolução do CONTRAN", "a Súmula 312 do STJ"):
            with self.subTest(trecho=trecho):
                m = self.motivos(f"Invoca-se {trecho}. Nestes termos, pede deferimento.")
                self.assertTrue(m and all(mot == "norma fora do CTB" for _, mot in m), m)

    def test_artigo_do_codigo_penal_nao_conta_como_ctb(self):
        m = self.motivos("Aplica-se o art. 24 do Código Penal.")
        self.assertEqual({mot for _, mot in m}, {"norma fora do CTB"})

    def test_nota_de_redacao_da_propria_base_passa(self):
        # A base traz "(Redação dada pela Lei nº 11.334, de 2006)"; repetir não é citar lei externa.
        self.assertIn("Lei nº 11.334", self.base.texto)
        self.assertEqual(self.motivos("O art. 218, com redação dada pela Lei nº 11.334, de 2006, prevê."), [])

    def test_artigo_fora_da_base(self):
        self.assertEqual(self.motivos("Conforme o art. 29 do CTB."),
                         [("art. 29", "não consta da base normativa fornecida")])

    def test_artigo_inexistente(self):
        self.assertEqual(self.motivos("Conforme o art. 999 do CTB."), [("art. 999", "não existe no CTB")])

    def test_listas_e_intervalos(self):
        self.assertEqual(self.motivos("Os arts. 280 e 281, e os arts. 284 a 290, regem o rito."), [])
        m = self.motivos("Os arts. 280, 29 e 281 regem o rito.")
        self.assertEqual([t for t, _ in m], ["art. 29"])

    def test_grafias(self):
        self.assertEqual(self.motivos("O artigo 90 e o art. 281-a, e o Art. 90º."), [])

    def test_hifen_separado_nao_vira_sufixo(self):
        # "art. 280 - A infração…" não é o art. 280-A (defeito achado na execução).
        self.assertEqual(self.motivos("Conforme o art. 280 - A infração deve ser comprovada."), [])

    def test_ctb_e_lei_9503_nao_sao_citacoes_externas(self):
        self.assertEqual(self.motivos("Nos termos do Código de Trânsito Brasileiro (Lei nº 9.503/1997)."), [])

    def test_aspas_nao_literais_viram_alerta_nao_recusa(self):
        r = self.conferir('O art. 280 exige "a identificação completa e inequívoca do radar utilizado".')
        self.assertEqual(r.recusas, [])
        self.assertEqual(len(r.alertas), 1)

    def test_aspas_literais_nao_alertam(self):
        r = self.conferir('O art. 281 diz que "no prazo máximo de trinta dias, não for expedida a notificação da autuação".')
        self.assertEqual(r.alertas, [])



class TestRefazer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = carregar_ctb(CTB_DIR)
        cls.base = montar_base(cls.c, "Art. 218, III, do CTB")

    def rodar(self, respostas):
        chamadas = []

        async def gerar(historico):
            chamadas.append(historico)
            return respostas[len(chamadas) - 1]

        return asyncio.run(gerar_com_conferencia(gerar, self.base, self.c)), chamadas

    def test_passa_de_primeira_sem_refazer(self):
        (peca, res, recusas_1a), chamadas = self.rodar([PECA_BOA])
        self.assertEqual(peca, PECA_BOA)
        self.assertEqual(recusas_1a, [])
        self.assertEqual(chamadas, [None])

    def test_refaz_uma_vez_com_o_pedido_de_correcao(self):
        ruim = PECA_BOA.replace("Nestes termos", "Aplica-se o art. 24 do Código Penal. Nestes termos")
        (peca, res, recusas_1a), chamadas = self.rodar([ruim, PECA_BOA])
        self.assertEqual(peca, PECA_BOA)
        self.assertEqual([r.motivo for r in recusas_1a], ["norma fora do CTB"])
        self.assertEqual(len(chamadas), 2)
        self.assertEqual(chamadas[1][0], {"role": "assistant", "content": ruim})
        self.assertEqual(chamadas[1][1]["role"], "user")
        self.assertIn("Código Penal", chamadas[1][1]["content"])

    def test_falha_de_novo_levanta_erro_com_as_recusas(self):
        ruim = "Aplica-se o art. 24 do Código Penal. Nestes termos, pede deferimento."
        with self.assertRaises(CitacaoForaDaBase) as ctx:
            self.rodar([ruim, ruim])
        self.assertTrue(isinstance(ctx.exception, RuntimeError))
        self.assertIn("Código Penal", str(ctx.exception))
        self.assertEqual(ctx.exception.recusas[0].motivo, "norma fora do CTB")

class TestRevisaoFinal(unittest.TestCase):
    """Achados da revisão final (29/09/2026): cada falso positivo gasta o único
    refazer e pode mandar um caso pago para failed; cada falso negativo deixa
    uma norma proibida chegar ao PDF."""

    @classmethod
    def setUpClass(cls):
        cls.c = carregar_ctb(CTB_DIR)
        cls.base = montar_base(cls.c, "Art. 218, III, do CTB")

    def recusas(self, texto, base=None):
        return [(r.trecho, r.motivo) for r in conferir_citacoes(texto, base or self.base, self.c).recusas]

    def test_palavras_comuns_do_cliente_nao_sao_norma(self):
        for texto in ("A autuada reside na Rua da Constituição, 45.",
                      "A fotografia do radar tem baixa resolução e não identifica a placa.",
                      "O veículo saía da portaria do condomínio.",
                      "Nos termos do art. 281 (cf. art. 280), requer-se o arquivamento.",
                      "Consta o auto nº CF-004512."):
            with self.subTest(texto=texto):
                self.assertEqual(self.recusas(texto), [])

    def test_normas_com_contexto_legal_continuam_recusadas(self):
        for texto in ("Conforme resolução do CONTRAN, a tolerância é aplicável.",
                      "A Resolução nº 798/2020 exige a verificação.",
                      "A Portaria nº 544/2014 do Inmetro regula o equipamento.",
                      "O art. 5º, LV, da Constituição garante a ampla defesa.",
                      "A Constituição Federal garante o contraditório.",
                      "Nos termos da CF/88."):
            with self.subTest(texto=texto):
                self.assertIn("norma fora do CTB", [m for _, m in self.recusas(texto)])

    def test_normas_que_escapavam(self):
        for texto in ("A Res. 798/2020 do CONTRAN disciplina o tema.",
                      "O Manual Brasileiro de Fiscalização de Trânsito (MBFT) orienta a autuação.",
                      "É o entendimento do STJ no REsp 1.234.567.",
                      "A Lei Complementar nº 95/1998 rege a matéria.",
                      "A Lei número 9.784 regula o processo administrativo.",
                      "Há acórdão do TJRJ nesse sentido."):
            with self.subTest(texto=texto):
                self.assertIn("norma fora do CTB", [m for _, m in self.recusas(texto)])

    def test_numeros_depois_da_citacao_nao_sao_artigos(self):
        for texto in ("Nos termos do art. 218, 20% acima do limite configura a infração.",
                      "O art. 61, 80 km/h nas vias arteriais, fixa o limite.",
                      "O art. 218, 30 dias após a infração, não foi observado."):
            with self.subTest(texto=texto):
                self.assertEqual(self.recusas(texto), [])

    def test_a_propria_base_passa_na_conferencia(self):
        # A base cita os arts. 256, 258 e 259 (decadência do art. 282, § 6º; art. 257, § 9º):
        # uma citação fiel do próprio texto entregue não pode ser recusada.
        for amparo in (None, "Art. 218, I", "Art. 208", "Art. 165-A", "Art. 230, V"):
            with self.subTest(amparo=amparo):
                b = montar_base(self.c, amparo)
                # O que importa aqui é "não consta": a base citar artigo que não traz.
                # Artigo VETADO mencionado no texto (ex.: 233-A) continua recusado — a
                # peça não deve citá-lo.
                fora = [r for r in self.recusas(b.texto, b) if r[1] == "não consta da base normativa fornecida"]
                self.assertEqual(fora, [])
                self.assertTrue({"256", "258", "259"} <= b.artigos)

    def test_artigo_de_outra_lei_da_base_nao_e_artigo_do_ctb(self):
        # A base cita "art. 10 da Lei nº 13.103"; repetir isso não é citar o art. 10 do CTB.
        b = montar_base(self.c, None)
        self.assertIn("art. 10 da Lei nº 13.103", b.texto)
        self.assertEqual(self.recusas("Conforme o art. 10 da Lei nº 13.103, de 2015.", b), [])

    def test_citacao_do_ctb_por_extenso_continua_conferida(self):
        # "do Código de Trânsito" não é outra norma: o artigo tem que ser conferido.
        self.assertEqual(self.recusas("Conforme o art. 999 do Código de Trânsito Brasileiro."),
                         [("art. 999", "não existe no CTB")])
        self.assertEqual(self.recusas("Conforme o art. 281 do Código de Trânsito Brasileiro."), [])
        self.assertEqual(self.recusas("Conforme o art. 29 da Lei nº 9.503/1997."),
                         [("art. 29", "não consta da base normativa fornecida")])

    def test_trecho_recusado_vem_inteiro(self):
        # O trecho vai no pedido de correção: cortado, o modelo não sabe o que remover.
        self.assertEqual(self.recusas("O art. 5º, LV, da Constituição garante a ampla defesa."),
                         [("art. 5º, LV, da Constituição", "norma fora do CTB")])
        self.assertEqual(self.recusas("Aplica-se o art. 24 do Código Penal. Fim."),
                         [("art. 24 do Código Penal", "norma fora do CTB")])

    def test_lei_sem_numero_abreviado(self):
        self.assertIn("norma fora do CTB", [m for _, m in self.recusas("Conforme a Lei 9.784, de 1999.")])

    def test_resumo_de_alertas_sem_dados_pessoais(self):
        r = resumo_alertas(["Mariana Souza Lima levava a filha ao hospital", "outro trecho qualquer longo"])
        self.assertEqual(r["quantidade"], 2)
        self.assertNotIn("Mariana", repr(r))
        self.assertEqual(len(r["hashes"]), 2)
        self.assertTrue(all(len(h) == 12 for h in r["hashes"]))


if __name__ == "__main__":
    unittest.main()
