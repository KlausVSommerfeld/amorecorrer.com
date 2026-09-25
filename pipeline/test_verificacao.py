"""Testes de verificacao.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_verificacao -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import json
import unittest

from verificacao import (
    INSTRUCAO_EXIBICAO,
    INSTRUCAO_REPROVADO,
    bloco_verificacao,
    instrucao_de_redacao,
)


def verificacao(**sobre):
    base = {
        "status": "reprovado",
        "confianca": "alta",
        "metodo_match": "numero_serie",
        "instrumento": {
            "municipio": "RIO DE JANEIRO",
            "local_via": "Est Rio Grande Px1096",
            "proprietario": "CONSILUX",
        },
        "certificado_vigente": {
            "origem": "historico",
            "numero": "13785621",
            "data_laudo": "2024-07-12",
            "data_validade": "2025-07-11",
            "resultado": "Reprovado",
        },
        "evidencia": {"capturado_em": "2026-09-22T04:30:00+00:00"},
        "avisos": [],
    }
    base.update(sobre)
    return base


class TestInstrucao(unittest.TestCase):
    def test_nulo_e_nao_aplicavel_sem_instrucao(self):
        self.assertIsNone(instrucao_de_redacao(None))
        self.assertIsNone(instrucao_de_redacao({"status": "nao_aplicavel", "confianca": "baixa"}))
        self.assertIsNone(instrucao_de_redacao({}))

    def test_reprovado_alta_e_tese_forte(self):
        self.assertEqual(instrucao_de_redacao(verificacao()), INSTRUCAO_REPROVADO)

    def test_comprovado_alta_e_silencio(self):
        # Em duas rodadas reais (24/09/2026), com um bloco dizendo "não mencione",
        # o modelo mencionou a verificação e montou tese pelo art. 280. O que ele
        # não recebe, não cita: vigência comprovada não gera instrução nenhuma.
        self.assertIsNone(instrucao_de_redacao(verificacao(status="comprovado_valido")))

    def test_confianca_nao_alta_vence_o_status(self):
        for status in ("reprovado", "comprovado_valido"):
            for confianca in ("baixa", "media", None):
                with self.subTest(status=status, confianca=confianca):
                    self.assertEqual(
                        instrucao_de_redacao(verificacao(status=status, confianca=confianca)),
                        INSTRUCAO_EXIBICAO,
                    )

    def test_demais_status_pedem_exibicao(self):
        for status in ("nao_comprovado", "sem_registro", "ambiguo", "status_que_nao_existe"):
            with self.subTest(status=status):
                self.assertEqual(instrucao_de_redacao(verificacao(status=status)), INSTRUCAO_EXIBICAO)

    def test_string_json_e_aceita(self):
        self.assertEqual(instrucao_de_redacao(json.dumps(verificacao())), INSTRUCAO_REPROVADO)
        self.assertIsNone(instrucao_de_redacao("isto não é json"))


class TestBloco(unittest.TestCase):
    def test_nao_aplicavel_sem_bloco(self):
        self.assertIsNone(bloco_verificacao({"status": "nao_aplicavel", "confianca": "baixa"}))
        self.assertIsNone(bloco_verificacao(None))

    def test_comprovado_sem_bloco(self):
        self.assertIsNone(bloco_verificacao(verificacao(status="comprovado_valido")))

    def test_reprovado_cita_certificado_equipamento_e_fonte(self):
        b = bloco_verificacao(verificacao())
        self.assertIn("reprovado", b)
        self.assertIn("12/07/2024", b)
        self.assertIn("11/07/2025", b)
        self.assertIn("13785621", b)
        self.assertIn("Est Rio Grande Px1096, RIO DE JANEIRO", b)
        self.assertIn("CONSILUX", b)
        self.assertIn("capturada em 22/09/2026", b)
        self.assertTrue(b.rstrip().endswith(INSTRUCAO_REPROVADO))

    def test_reprovado_sem_numero_nao_inventa(self):
        cert = dict(verificacao()["certificado_vigente"], numero=None)
        b = bloco_verificacao(verificacao(certificado_vigente=cert))
        self.assertNotIn("nº", b)
        self.assertIn("12/07/2024", b)

    def test_numero_proibido_nunca_aparece(self):
        casos = [
            verificacao(status="nao_comprovado"),
            verificacao(status="reprovado", confianca="baixa"),
            verificacao(status="comprovado_valido", confianca="baixa"),
            verificacao(status="ambiguo"),
        ]
        for v in casos:
            with self.subTest(status=v["status"], confianca=v["confianca"]):
                b = bloco_verificacao(v)
                self.assertNotIn("13785621", b)
                self.assertNotIn("CONSILUX", b)

    def test_exibicao_nao_diz_reprovado(self):
        b = bloco_verificacao(verificacao(status="reprovado", confianca="baixa"))
        self.assertNotIn("foi reprovado", b)
        self.assertTrue(b.rstrip().endswith(INSTRUCAO_EXIBICAO))

    def test_avisos_da_base_entram(self):
        b = bloco_verificacao(verificacao(
            status="nao_comprovado",
            avisos=["ausência de certificado na base pública não comprova ausência de verificação"],
        ))
        self.assertIn("não comprova ausência de verificação", b)

    def test_objeto_incompleto_nao_quebra(self):
        b = bloco_verificacao({"status": "reprovado", "confianca": "alta"})
        self.assertIsNotNone(b)
        self.assertNotIn("Fonte", b)
        self.assertNotIn("Equipamento", b)

    def test_campos_nulos_nao_quebram(self):
        b = bloco_verificacao(verificacao(instrumento=None, certificado_vigente=None, evidencia=None, avisos=None))
        self.assertTrue(b.rstrip().endswith(INSTRUCAO_REPROVADO))

    def test_proprietario_aninhado_usa_o_nome(self):
        inst = {"municipio": "RIO DE JANEIRO", "local_via": "Est X",
                "proprietario": {"Nome": "SPLICE", "Municipio": "X", "Estado": "RJ"}}
        b = bloco_verificacao(verificacao(instrumento=inst))
        self.assertIn("proprietário: SPLICE", b)
        self.assertNotIn("Estado", b)


if __name__ == "__main__":
    unittest.main()
