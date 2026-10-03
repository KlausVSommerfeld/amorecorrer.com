"""Testes de velocidade.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_velocidade -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from velocidade import bloco_velocidade, inciso_pela_velocidade


def caso(permitida=80, considerada=90, aferida=97):
    c = {"velocidade_permitida": permitida, "velocidade_aferida": aferida}
    if considerada is not None:
        c["velocidade_considerada"] = considerada
    return c


class TestIncisoPelaVelocidade(unittest.TestCase):
    def test_limites_exatos_do_art_218(self):
        self.assertEqual(inciso_pela_velocidade(100, 120), "I")    # 20% cravado
        self.assertEqual(inciso_pela_velocidade(100, 121), "II")   # 21%
        self.assertEqual(inciso_pela_velocidade(100, 150), "II")   # 50% cravado
        self.assertEqual(inciso_pela_velocidade(100, 151), "III")  # 51%
        self.assertEqual(inciso_pela_velocidade(80, 81), "I")

    def test_sem_excesso(self):
        self.assertIsNone(inciso_pela_velocidade(80, 80))
        self.assertIsNone(inciso_pela_velocidade(80, 78))

    def test_fracao_exata_nos_limites(self):
        # 60 → 72 é exatamente 20% (float: 72/60*100-100 = 19.999999…).
        self.assertEqual(inciso_pela_velocidade(60, 72), "I")
        self.assertEqual(inciso_pela_velocidade(60, 90), "II")  # 50% cravado


class TestBlocoVelocidade(unittest.TestCase):
    def test_o_caso_que_falhou_fica_em_silencio(self):
        # 29/09: aferida 97, limite 80, auto no inciso I. Com a considerada 90 (12,5%) o inciso bate.
        self.assertIsNone(bloco_velocidade(caso(80, 90, 97), "art. 218, I"))

    def test_sem_infracao_mesmo_sem_inciso_no_auto(self):
        self.assertEqual(bloco_velocidade(caso(80, 78, 85), "art. 218").situacao, "sem_infracao")

    def test_sem_infracao_sustenta_inconsistencia(self):
        for considerada in (80, 78):
            with self.subTest(considerada=considerada):
                b = bloco_velocidade(caso(80, considerada, 85), "art. 218, I")
                self.assertEqual(b.situacao, "sem_infracao")
                self.assertIsNone(b.inciso_da_conta)
                self.assertIn(f"{considerada} km/h", b.texto)
                self.assertIn("art. 281, § 1º, I", b.texto)
                self.assertIn("Sustente nos fundamentos", b.texto)

    def test_auto_mais_grave_sustenta_desclassificacao(self):
        b = bloco_velocidade(caso(80, 118, 125), "art. 218, III")  # 47,5% → II
        self.assertEqual(b.situacao, "desclassificacao")
        self.assertEqual(b.inciso_da_conta, "II")
        self.assertIn("47,5%", b.texto)
        self.assertIn("inciso II", b.texto)
        self.assertIn("inciso III", b.texto)
        self.assertIn("art. 281, § 1º, I", b.texto)
        self.assertIn("Sustente nos fundamentos", b.texto)

    # Spec 2026-10-02: o pedido é do código (peca.pedido). Um bloco mandando
    # "requerer" faria o modelo escrever um pedido que o código corta.
    def test_bloco_nunca_manda_requerer(self):
        for b in (bloco_velocidade(caso(80, 78, 85), "art. 218, I"),
                  bloco_velocidade(caso(80, 118, 125), "art. 218, III")):
            with self.subTest(situacao=b.situacao):
                self.assertNotIn("Requeira", b.texto)
                self.assertIn("o pedido é escrito à parte, não o escreva", b.texto)

    def test_auto_mais_leve_nunca_vira_tese(self):
        self.assertIsNone(bloco_velocidade(caso(80, 100, 105), "art. 218, I"))  # 25% → II

    def test_auto_igual_silencio(self):
        self.assertIsNone(bloco_velocidade(caso(80, 100, 105), "art. 218, II"))

    def test_auto_sem_inciso_e_com_excesso_silencio(self):
        self.assertIsNone(bloco_velocidade(caso(80, 118, 125), "art. 218"))

    def test_fora_do_218_ou_sem_enquadramento(self):
        for enq in ("art. 208", "art. 181, XVII", None, "", "art. 2180"):
            with self.subTest(enq=enq):
                self.assertIsNone(bloco_velocidade(caso(80, 78, 85), enq))

    def test_dados_ausentes_ou_invalidos(self):
        for c in (caso(80, None), caso(None, 90), caso(0, 90), caso(80, 0),
                  caso("80 km/h", 90), caso(80, " 90 km"), caso(True, 90), {}):
            with self.subTest(c=c):
                self.assertIsNone(bloco_velocidade(c, "art. 218, III"))

    def test_string_de_digitos_vale(self):
        self.assertEqual(bloco_velocidade(caso("80", "78", "85"), "art. 218, I").situacao, "sem_infracao")

    def test_considerada_maior_que_aferida_nao_e_confiavel(self):
        self.assertIsNone(bloco_velocidade(caso(80, 78, 70), "art. 218, III"))

    def test_percentual_arredonda_meio_para_cima(self):
        b = bloco_velocidade(caso(80, 97, 100), "art. 218, III")  # 21,25% → "21,3%", inciso II
        self.assertIn("21,3%", b.texto)


if __name__ == "__main__":
    unittest.main()
