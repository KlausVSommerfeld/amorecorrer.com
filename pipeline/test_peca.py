"""Testes de peca.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_peca -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from peca import (
    ABERTURA_PEDIDO,
    LINHA_CURTA,
    LINHA_EM_BRANCO,
    campos,
    corpo_do_email,
    data_da_infracao,
    nome_arquivo,
    pedido,
    qualificacao,
    titulo,
    titulo_documento,
    DEFESA_PREVIA,
    RECURSO_JARI,
    cortar_depois_do_pedido,
    enderecamento,
    fecho,
    limpar_markdown,
    paragrafo_para_pdf,
    remover_enderecamento,
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
        self.assertIn("[Modo sem IA", t)
        self.assertTrue(t.endswith("CPF 529.982.247-25"))

    def test_enderecamento_do_codigo_abre_a_peca(self):
        caso = dict(CASO, especie_documento=DEFESA_PREVIA, orgao_autuador="CET-RIO")
        t = texto_da_peca(RASCUNHO_REAL, caso)
        self.assertTrue(t.startswith(
            "À Autoridade de Trânsito do órgão autuador CET-RIO\n\nDEFESA PRÉVIA"))

    # Rodada 3 de 25/09/2026: a defesa prévia que o modelo endereçou à JARI.
    def test_enderecamento_do_modelo_e_trocado_pelo_do_codigo(self):
        rascunho = (
            "Excelentíssimo Senhor Presidente da Junta Administrativa de Recursos de "
            "Infrações (JARI) do órgão autuador CET-RIO,\n\n"
            "MARIANA SOUZA LIMA vem apresentar DEFESA PRÉVIA.\n\n"
            "Nestes termos, pede deferimento."
        )
        caso = dict(CASO, especie_documento=DEFESA_PREVIA, orgao_autuador="CET-RIO")
        t = texto_da_peca(rascunho, caso)
        self.assertNotIn("JARI", t)
        self.assertTrue(t.startswith(
            "À Autoridade de Trânsito do órgão autuador CET-RIO\n\nMARIANA SOUZA LIMA"))


# Os dois valores que o formulário grava em `especie_documento` (Form.tsx, ESTAGIOS).
class TestEnderecamento(unittest.TestCase):
    def test_defesa_previa_vai_a_autoridade_do_orgao_autuador(self):
        caso = {"especie_documento": "Notificação de autuação — defesa prévia",
                "orgao_autuador": "DETRAN-RJ"}
        self.assertEqual(enderecamento(caso),
                         "À Autoridade de Trânsito do órgão autuador DETRAN-RJ")

    def test_recurso_vai_ao_presidente_da_jari(self):
        caso = {"especie_documento": "Notificação de penalidade — recurso à JARI",
                "orgao_autuador": " CET-RIO "}
        self.assertEqual(
            enderecamento(caso),
            "Ao Senhor Presidente da Junta Administrativa de Recursos de Infrações (JARI) "
            "do órgão autuador CET-RIO")

    def test_orgao_ausente_vira_linha_em_branco(self):
        for orgao in (None, "", "   "):
            caso = {"especie_documento": RECURSO_JARI, "orgao_autuador": orgao}
            self.assertTrue(enderecamento(caso).endswith("do órgão autuador ______________________"))

    def test_estagio_desconhecido_nao_adivinha(self):
        for estagio in (None, "", "defesa_previa", "Recurso ao CETRAN"):
            caso = {"especie_documento": estagio, "orgao_autuador": "CET-RIO"}
            self.assertEqual(enderecamento(caso), "À ______________________")


class TestRemoverEnderecamento(unittest.TestCase):
    def test_vocativos_do_modelo_saem(self):
        for vocativo in (
            "Excelentíssimo Senhor Presidente da JARI,",
            "Ilustríssimo Senhor Diretor do DETRAN-RJ",
            "Ilmo. Sr. Presidente da JARI",
            "À CET-RIO – Companhia de Engenharia de Tráfego do Rio de Janeiro",
            "Ao Senhor Presidente da Junta Administrativa de Recursos de Infrações — JARI.",
            "À Autoridade de Trânsito,",
        ):
            t = remover_enderecamento(f"{vocativo}\n\nMariana Souza Lima vem apresentar defesa.")
            self.assertEqual(t, "Mariana Souza Lima vem apresentar defesa.", vocativo)

    def test_vocativo_em_duas_linhas_sai_inteiro(self):
        t = remover_enderecamento(
            "Excelentíssimo Senhor\nPresidente da JARI do DETRAN-RJ\n\nMariana vem recorrer.")
        self.assertEqual(t, "Mariana vem recorrer.")

    def test_corpo_da_peca_fica(self):
        for corpo in (
            "Mariana Souza Lima, já qualificada, vem apresentar defesa prévia.",
            "DEFESA PRÉVIA\n\nMariana vem apresentar defesa.",
            "A condutora autuada, Mariana Souza Lima, apresentou recurso à JARI.",
        ):
            self.assertEqual(remover_enderecamento(corpo), corpo)

    def test_paragrafo_longo_comecado_por_ao_fica(self):
        corpo = "Ao contrário do que consta do auto, " + "a sinalização não existia. " * 15
        self.assertEqual(remover_enderecamento(corpo), corpo.strip())


# Caso fictício da sessão de 02/10/2026, com as colunas que o formulário grava.
COMPLETO = {
    "case_id": "CASO_abc",
    "nome": "Mariana Souza Lima",
    "cpf": "52998224725",
    "cnh": "04512345678",
    "endereco": "Rua das Laranjeiras, 120, apto 302",
    "cep": "22240003",
    "cidade": "Rio de Janeiro",
    "estado": "RJ",
    "email": "mariana@example.com",
    "orgao_autuador": "CET-RIO",
    "numero_auto": "E123456789",
    "placa": "rio2a19",
    "data_infracao": "2026-08-14T07:52:00",
    "notificacao_penalidade": "P987654321",
}
DEFESA = dict(COMPLETO, especie_documento=DEFESA_PREVIA)
RECURSO = dict(COMPLETO, especie_documento=RECURSO_JARI)
DESCONHECIDO = dict(COMPLETO, especie_documento="defesa_previa")
ADVERTENCIA = (
    "subsidiariamente, não havendo outra infração cometida nos últimos 12 (doze) meses, a "
    "aplicação da penalidade de advertência por escrito em substituição à multa, nos termos "
    "do art. 267 do CTB"
)


class TestTitulo(unittest.TestCase):
    def test_por_estagio(self):
        self.assertEqual(titulo(DEFESA), "DEFESA PRÉVIA")
        self.assertEqual(titulo(RECURSO), "RECURSO À JARI")
        self.assertIsNone(titulo(DESCONHECIDO))
        self.assertIsNone(titulo({}))


class TestDataDaInfracao(unittest.TestCase):
    def test_formatos(self):
        self.assertEqual(data_da_infracao("2026-08-14T07:52:00"), "14/08/2026 07:52")
        self.assertEqual(data_da_infracao("2026-08-14 07:52:00"), "14/08/2026 07:52")
        self.assertEqual(data_da_infracao("2026-08-14"), "14/08/2026")
        self.assertEqual(data_da_infracao("14/08/2026"), "14/08/2026")
        self.assertEqual(data_da_infracao(None), "")

    # `data_infracao` é o relógio de parede do auto: nunca se converte fuso.
    def test_data_com_fuso_nao_converte(self):
        self.assertEqual(data_da_infracao("2026-08-14T07:52:00+00:00"), "14/08/2026 07:52")
        self.assertEqual(data_da_infracao("2026-08-14T23:30:00-03:00"), "14/08/2026 23:30")


class TestCampos(unittest.TestCase):
    def test_defesa(self):
        self.assertEqual(campos(DEFESA), (
            ("Auto de infração", "E123456789"),
            ("Placa", "RIO2A19"),
            ("Data da infração", "14/08/2026 07:52"),
        ))

    def test_recurso_traz_a_notificacao(self):
        self.assertEqual(campos(RECURSO), (
            ("Auto de infração", "E123456789"),
            ("Notificação de penalidade", "P987654321"),
            ("Placa", "RIO2A19"),
            ("Data da infração", "14/08/2026 07:52"),
        ))

    def test_estagio_desconhecido_usa_o_da_defesa(self):
        self.assertEqual(campos(DESCONHECIDO), campos(DEFESA))

    def test_ausentes_viram_linha_curta(self):
        self.assertEqual(campos({"especie_documento": DEFESA_PREVIA}), (
            ("Auto de infração", LINHA_CURTA),
            ("Placa", LINHA_CURTA),
            ("Data da infração", LINHA_CURTA),
        ))


class TestQualificacao(unittest.TestCase):
    def test_defesa_completa(self):
        self.assertEqual(
            qualificacao(DEFESA),
            "MARIANA SOUZA LIMA, CPF nº 529.982.247-25, CNH nº 04512345678, com endereço em "
            "Rua das Laranjeiras, 120, apto 302, CEP 22240-003, Rio de Janeiro/RJ, e-mail "
            "mariana@example.com, vem, respeitosamente, apresentar DEFESA PRÉVIA em face do "
            "Auto de Infração nº E123456789, pelos fundamentos a seguir expostos.",
        )

    def test_recurso(self):
        self.assertTrue(qualificacao(RECURSO).endswith(
            "vem, respeitosamente, interpor RECURSO contra a penalidade imposta na Notificação "
            "de Penalidade nº P987654321, referente ao Auto de Infração nº E123456789, pelos "
            "fundamentos a seguir expostos."))

    def test_sem_cnh_some_inteira(self):
        q = qualificacao(dict(DEFESA, cnh=""))
        self.assertNotIn("CNH", q)
        self.assertIn("CPF nº 529.982.247-25, com endereço em", q)

    def test_estagio_desconhecido_nao_adivinha_a_peca(self):
        self.assertIn(f"apresentar {LINHA_EM_BRANCO} em face do Auto", qualificacao(DESCONHECIDO))

    def test_ausentes_viram_linha(self):
        q = qualificacao({"especie_documento": RECURSO_JARI})
        self.assertTrue(q.startswith(f"{LINHA_EM_BRANCO}, CPF nº ______________, com endereço em "))
        self.assertIn(f"CEP {LINHA_CURTA}", q)
        self.assertIn(f"Notificação de Penalidade nº {LINHA_EM_BRANCO}", q)
        self.assertIn(f"Auto de Infração nº {LINHA_EM_BRANCO}", q)
        self.assertNotIn("None", q)


class TestPedido(unittest.TestCase):
    def test_abertura(self):
        self.assertEqual(ABERTURA_PEDIDO, "Diante do exposto, requer:")

    def test_defesa_comum(self):
        self.assertEqual(pedido(DEFESA, None, None, False), (
            "a) o acolhimento desta defesa prévia, com o arquivamento do Auto de Infração nº "
            "E123456789 e a declaração de insubsistência do seu registro.",
        ))

    def test_recurso_comum(self):
        self.assertEqual(pedido(RECURSO, None, None, False), (
            "a) o conhecimento e o provimento deste recurso, com o cancelamento da penalidade "
            "imposta e o arquivamento do Auto de Infração nº E123456789.",
        ))

    def test_estagio_desconhecido(self):
        self.assertEqual(pedido(DESCONHECIDO, None, None, False), (
            "a) o acolhimento desta peça, com o arquivamento do Auto de Infração nº E123456789.",
        ))

    def test_sem_infracao(self):
        motivo = ("por inconsistência, nos termos do art. 281, § 1º, I, do CTB, uma vez que a "
                  "velocidade considerada no próprio auto não supera a máxima permitida.")
        self.assertEqual(pedido(DEFESA, "sem_infracao", None, False), (
            f"a) o arquivamento do Auto de Infração nº E123456789 {motivo}",
        ))
        self.assertEqual(pedido(RECURSO, "sem_infracao", None, False), (
            "a) o provimento deste recurso, com o cancelamento da penalidade imposta e o "
            f"arquivamento do Auto de Infração nº E123456789 {motivo}",
        ))
        self.assertEqual(pedido(DESCONHECIDO, "sem_infracao", None, False),
                         pedido(DEFESA, "sem_infracao", None, False))

    def test_desclassificacao(self):
        subsidiario = ("b) subsidiariamente, o arquivamento do Auto de Infração nº E123456789 por "
                       "inconsistência, nos termos do art. 281, § 1º, I, do CTB.")
        self.assertEqual(pedido(DEFESA, "desclassificacao", "I", False), (
            "a) a desclassificação da infração para o art. 218, I, do CTB, compatível com a "
            "velocidade considerada no próprio auto;",
            subsidiario,
        ))
        self.assertEqual(pedido(RECURSO, "desclassificacao", "I", False), (
            "a) o provimento deste recurso, para desclassificar a infração para o art. 218, I, do "
            "CTB, compatível com a velocidade considerada no próprio auto, com a readequação da "
            "penalidade;",
            subsidiario,
        ))

    def test_desclassificacao_sem_inciso_vira_caso_comum(self):
        self.assertEqual(pedido(DEFESA, "desclassificacao", None, False),
                         pedido(DEFESA, None, None, False))

    def test_advertencia_e_o_ultimo_item_e_leva_o_ponto(self):
        p = pedido(DEFESA, "desclassificacao", "I", True)
        self.assertEqual(len(p), 3)
        self.assertTrue(p[0].endswith(";") and p[1].endswith(";"))
        self.assertEqual(p[2], f"c) {ADVERTENCIA}.")

    def test_advertencia_no_caso_comum(self):
        p = pedido(RECURSO, None, None, True)
        self.assertTrue(p[0].startswith("a) o conhecimento") and p[0].endswith(";"))
        self.assertEqual(p[1], f"b) {ADVERTENCIA}.")

    def test_sem_auto_linha_em_branco(self):
        self.assertIn(f"Auto de Infração nº {LINHA_EM_BRANCO}",
                      pedido({"especie_documento": DEFESA_PREVIA}, None, None, False)[0])


class TestArquivoEDocumento(unittest.TestCase):
    def test_nome_do_arquivo(self):
        self.assertEqual(nome_arquivo(DEFESA), "defesa-previa-E123456789.pdf")
        self.assertEqual(nome_arquivo(RECURSO), "recurso-jari-E123456789.pdf")
        self.assertEqual(nome_arquivo(dict(DEFESA, numero_auto="E 123/456.7")), "defesa-previa-E1234567.pdf")
        self.assertEqual(nome_arquivo(dict(DEFESA, numero_auto="")), "peca-CASO_abc.pdf")
        self.assertEqual(nome_arquivo(DESCONHECIDO), "peca-CASO_abc.pdf")
        self.assertEqual(nome_arquivo({}), "peca.pdf")

    def test_titulo_do_documento(self):
        self.assertEqual(titulo_documento(DEFESA), "Defesa prévia — Auto nº E123456789")
        self.assertEqual(titulo_documento(RECURSO), "Recurso à JARI — Auto nº E123456789")
        self.assertEqual(titulo_documento(DESCONHECIDO), "Peça — Auto nº E123456789")
        self.assertEqual(titulo_documento(dict(DEFESA, numero_auto=None)), "Defesa prévia")


class TestCorpoDoEmail(unittest.TestCase):
    def test_passos_aviso_e_identificacao(self):
        corpo = corpo_do_email("CASO_abc")
        for trecho in ("1. Confira os dados e preencha à mão as linhas em branco.",
                       "2. Assine no espaço indicado.",
                       "3. Protocole no órgão de trânsito até o prazo que consta da sua notificação",
                       "inteligência artificial",
                       "Identificação do pedido: CASO_abc"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, corpo)
        self.assertNotIn("rascunho", corpo.lower())


class TestParagrafoParaPdf(unittest.TestCase):
    def test_quebra_de_linha_vira_br(self):
        self.assertEqual(paragrafo_para_pdf("Mariana\nCPF 1"), "Mariana<br/>CPF 1")

    def test_escapa_html(self):
        self.assertEqual(paragrafo_para_pdf("A & B <x>"), "A &amp; B &lt;x&gt;")


if __name__ == "__main__":
    unittest.main()
