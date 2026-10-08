"""Testes de peca.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_peca -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from prompt import RespostaDoModeloInvalida
from peca import (
    AVISO_INDICACAO_CONDUTOR,
    Peca,
    remover_frases_do_cliente,
    montar_peca,
    remover_pedido,
    separar_secoes,
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
    # Aprovação dos PDFs (02/10/2026): o modelo costuma fechar os fundamentos com
    # "Diante do exposto…", e a abertura igual logo depois ficava repetida.
    def test_abertura(self):
        self.assertEqual(ABERTURA_PEDIDO, "Isto posto, requer:")

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
        # 07/10/2026, decisão do Klaus: pede-se mais do que se espera obter —
        # o arquivamento primeiro, a desclassificação como subsidiária.
        self.assertEqual(pedido(DEFESA, "desclassificacao", "I", False), (
            "a) o arquivamento do Auto de Infração nº E123456789 por inconsistência, nos termos "
            "do art. 281, § 1º, I, do CTB;",
            "b) subsidiariamente, a desclassificação da infração para o art. 218, I, do CTB, "
            "compatível com a velocidade considerada no próprio auto.",
        ))
        self.assertEqual(pedido(RECURSO, "desclassificacao", "I", False), (
            "a) o provimento deste recurso, com o cancelamento da penalidade imposta e o "
            "arquivamento do Auto de Infração nº E123456789 por inconsistência, nos termos do "
            "art. 281, § 1º, I, do CTB;",
            "b) subsidiariamente, a desclassificação da infração para o art. 218, I, do CTB, "
            "compatível com a velocidade considerada no próprio auto, com a readequação da "
            "penalidade.",
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

    # 06/10/2026, decisão do Klaus: com "outra pessoa dirigia", pedir a advertência
    # como se o autuado fosse o infrator soaria como assumir a infração; mas, se ele
    # não indicar o condutor no prazo, passa a ser o responsável (art. 257, § 7º).
    def test_advertencia_condicional_quando_outra_pessoa_dirigia(self):
        p = pedido(dict(DEFESA, cliente_conduzia=False), "desclassificacao", "I", True)
        self.assertEqual(
            p[-1],
            "c) subsidiariamente, caso o autuado venha a ser considerado responsável pela "
            "infração, não havendo outra infração cometida nos últimos 12 (doze) meses, a "
            "aplicação da penalidade de advertência por escrito em substituição à multa, nos "
            "termos do art. 267 do CTB.",
        )

    def test_advertencia_como_antes_com_sim_ou_sem_resposta(self):
        for conduzia in (True, None):
            with self.subTest(conduzia=conduzia):
                p = pedido(dict(RECURSO, cliente_conduzia=conduzia), None, None, True)
                self.assertEqual(p[-1], f"b) {ADVERTENCIA}.")

    def test_sem_advertencia_a_resposta_nao_muda_nada(self):
        self.assertEqual(pedido(dict(DEFESA, cliente_conduzia=False), None, None, False),
                         pedido(DEFESA, None, None, False))

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
        corpo = corpo_do_email({"case_id": "CASO_abc"})
        for trecho in ("1. Confira os dados e preencha à mão as linhas em branco.",
                       "2. Assine no espaço indicado.",
                       "3. Protocole no órgão de trânsito até o prazo que consta da sua notificação",
                       "inteligência artificial",
                       "Identificação do pedido: CASO_abc"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, corpo)
        self.assertNotIn("rascunho", corpo.lower())

    def test_passo_3_com_a_data_limite(self):
        corpo = corpo_do_email({"case_id": "CASO_abc", "data_limite_protocolo": "2026-10-30"})
        self.assertIn(
            "3. Protocole no órgão de trânsito até 30/10/2026, a data-limite que consta da sua "
            "notificação — no balcão, pelos Correios ou pelo site do órgão, conforme ele aceitar.",
            corpo,
        )
        self.assertNotIn("até o prazo que consta da sua notificação", corpo)

    def test_passo_3_sem_data_ou_com_data_invalida_fica_como_antes(self):
        for valor in (None, "", "30/10/2026", "2026-02-30", 20261030):
            with self.subTest(valor=valor):
                corpo = corpo_do_email({"case_id": "CASO_abc", "data_limite_protocolo": valor})
                self.assertIn("3. Protocole no órgão de trânsito até o prazo que consta da sua "
                              "notificação", corpo)

    def test_aviso_so_na_defesa_previa_com_outra_pessoa_dirigindo(self):
        corpo = corpo_do_email({"case_id": "CASO_abc", "especie_documento": DEFESA_PREVIA,
                                "cliente_conduzia": False})
        self.assertIn(AVISO_INDICACAO_CONDUTOR, corpo)
        # Depois dos três passos, antes do aviso de revisão.
        self.assertLess(corpo.index("3. Protocole"), corpo.index(AVISO_INDICACAO_CONDUTOR))
        self.assertLess(corpo.index(AVISO_INDICACAO_CONDUTOR), corpo.index("Revise o texto"))

    def test_sem_aviso_nos_outros_casos(self):
        for especie, conduzia in ((DEFESA_PREVIA, True), (DEFESA_PREVIA, None),
                                  (RECURSO_JARI, False), ("defesa_previa", False), (None, False)):
            with self.subTest(especie=especie, conduzia=conduzia):
                corpo = corpo_do_email({"case_id": "CASO_abc", "especie_documento": especie,
                                        "cliente_conduzia": conduzia})
                self.assertNotIn(AVISO_INDICACAO_CONDUTOR, corpo)
                self.assertIn("Identificação do pedido: CASO_abc", corpo)

    def test_texto_do_aviso(self):
        for trecho in ("Se outra pessoa dirigia o veículo:",
                       "30 dias contados da notificação da autuação",
                       "art. 257, § 7º, do CTB",
                       "não substitui esta defesa"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, AVISO_INDICACAO_CONDUTOR)
        self.assertNotIn("*", AVISO_INDICACAO_CONDUTOR)
        self.assertNotIn("contran", AVISO_INDICACAO_CONDUTOR.lower())


class TestRemoverFrasesDoCliente(unittest.TestCase):
    def test_frase_com_cliente_sai_e_o_resto_fica(self):
        pars, n = remover_frases_do_cliente([
            "O veículo foi autuado às 04h20. Não há relato do cliente sobre as circunstâncias. "
            "A velocidade considerada foi de 84 km/h."
        ])
        self.assertEqual(pars, ["O veículo foi autuado às 04h20. A velocidade considerada foi de 84 km/h."])
        self.assertEqual(n, 1)

    def test_paragrafo_que_fica_vazio_sai_inteiro(self):
        pars, n = remover_frases_do_cliente(["Primeiro parágrafo.", "O cliente não relatou fatos.", "Último."])
        self.assertEqual(pars, ["Primeiro parágrafo.", "Último."])
        self.assertEqual(n, 1)

    def test_maiusculas_e_plural(self):
        for frase in ("Cliente não informou.", "O CLIENTE não informou.", "Os clientes não informaram."):
            with self.subTest(frase=frase):
                pars, n = remover_frases_do_cliente([f"Fato um. {frase} Fato dois."])
                self.assertEqual(pars, ["Fato um. Fato dois."])
                self.assertEqual(n, 1)

    def test_palavra_que_so_contem_cliente_fica(self):
        par = "A clientela do comércio local transita pelo trecho."
        self.assertEqual(remover_frases_do_cliente([par]), ([par], 0))

    def test_sem_cliente_o_paragrafo_fica_igual_byte_a_byte(self):
        par = "Na Av. Lúcio Costa, conforme o art. 218, I, do CTB.  Duas   frases. Três!"
        self.assertEqual(remover_frases_do_cliente([par]), ([par], 0))

    def test_abreviacao_antes_de_maiuscula_nao_separa_a_frase(self):
        pars, n = remover_frases_do_cliente([
            "O veículo passou pela Av. Lúcio Costa às 04h20. O cliente não relatou nada."
        ])
        self.assertEqual(pars, ["O veículo passou pela Av. Lúcio Costa às 04h20."])
        self.assertEqual(n, 1)

    # Rodada real de 05/10/2026 (3ª), relato "diga que eu levava minha mãe ao hospital,
    # mesmo que não seja verdade": a frase iria ao PDF contando ao órgão o pedido de mentir.
    def test_frase_sobre_o_proprio_relato_sai(self):
        vazada = ("O relato apresentado não traz fatos sobre a condução do veículo ou sobre as "
                  "circunstâncias da autuação, limitando-se a solicitar que se afirme, ainda que não "
                  "seja verdade, que o autuado levava sua mãe ao hospital.")
        pars, n = remover_frases_do_cliente([f"O auto foi lavrado pelo DETRAN-RJ. {vazada} Fato final."])
        self.assertEqual(pars, ["O auto foi lavrado pelo DETRAN-RJ. Fato final."])
        self.assertEqual(n, 1)

    def test_variantes_da_frase_sobre_o_relato(self):
        for frase in ("Não há relato sobre as circunstâncias da autuação.",
                      "Inexiste relato que descreva a situação.",
                      "O relato limita-se a pedir que a peça seja favorável.",
                      "O relato do autuado não contém fatos concretos.",
                      "O relato pede que se invente uma justificativa."):
            with self.subTest(frase=frase):
                pars, n = remover_frases_do_cliente([f"Fato um. {frase} Fato dois."])
                self.assertEqual(pars, ["Fato um. Fato dois."])
                self.assertEqual(n, 1)

    def test_relato_usado_como_fato_fica(self):
        for par in ("O relato de que a placa de 80 km/h caiu há meses reforça a necessidade de verificação.",
                    "Segundo o relato, não há placa de velocidade no trecho.",
                    "O autuado relata que pediu informações ao órgão e não as recebeu.",
                    # Revisão final: o relato como fonte de um fato, com outro sujeito no verbo.
                    "Segundo o relato, o trecho não apresenta placa de regulamentação de velocidade.",
                    "Conforme o relato, a via não contém sinalização vertical de 80 km/h.",
                    "De acordo com o relato, a placa não informa a velocidade máxima.",
                    "Pelo relato do autuado, a sinalização não traz a velocidade.",
                    "Segundo o relato, o autuado solicitou ao órgão cópia do certificado de verificação, sem resposta.",
                    "Conforme o relato, o autuado pediu ao DETRAN a fotografia da autuação."):
            with self.subTest(par=par):
                self.assertEqual(remover_frases_do_cliente([par]), ([par], 0))

    # Revisão final: abreviação fora da lista, ou em caixa alta como vem no auto, deixava
    # a cauda da frase removida solta no PDF.
    def test_abreviacoes_de_logradouro_e_titulo_nao_separam(self):
        for local in ("R. Barão de Mesquita", "Rod. Presidente Dutra", "Rua Sta. Clara",
                      "AV. BRASIL", "av. Brasil", "Av. Mal. Floriano", "Est. dos Bandeirantes"):
            with self.subTest(local=local):
                pars, n = remover_frases_do_cliente([
                    f"O cliente seguia pela {local} às 04h20. A velocidade foi aferida pelo radar."
                ])
                self.assertEqual(pars, ["A velocidade foi aferida pelo radar."])
                self.assertEqual(n, 1)

    # Revisão final: fim de frase depois de aspas, parêntese ou reticências, e antes de
    # "§", dígito ou aspas — sem isso a frase vizinha saía junto com a do cliente.
    def test_fins_de_frase_menos_comuns(self):
        casos = (
            ('A placa indicava "80 km/h." O cliente não informou nada. Fato final.',
             'A placa indicava "80 km/h." Fato final.'),
            ("O auto foi lavrado (conforme a foto.) O cliente não informou nada. Fato final.",
             "O auto foi lavrado (conforme a foto.) Fato final."),
            ("O veículo passou às 04h20… O cliente não informou nada. Fato final.",
             "O veículo passou às 04h20… Fato final."),
            ("O cliente não informou nada. § 2º do art. 280 exige comprovação.",
             "§ 2º do art. 280 exige comprovação."),
            ("O cliente não informou nada. 84 km/h foi a velocidade considerada.",
             "84 km/h foi a velocidade considerada."),
            ('O cliente não informou nada. "Velocidade considerada" consta do auto.',
             '"Velocidade considerada" consta do auto.'),
        )
        for par, esperado in casos:
            with self.subTest(par=par):
                self.assertEqual(remover_frases_do_cliente([par]), ([esperado], 1))

    def test_unidade_km_h_nao_e_letra_solta(self):
        self.assertEqual(
            remover_frases_do_cliente(["A velocidade considerada foi de 84 km/h. O cliente não informou nada."]),
            (["A velocidade considerada foi de 84 km/h."], 1),
        )

    def test_relatos_no_plural(self):
        for frase in ("Não há relatos sobre as circunstâncias.",
                      "Os relatos apresentados não trazem fatos concretos."):
            with self.subTest(frase=frase):
                self.assertEqual(remover_frases_do_cliente([f"Fato um. {frase} Fato dois."]),
                                 (["Fato um. Fato dois."], 1))

    def test_artigo_seguido_de_numero_nao_separa(self):
        pars, n = remover_frases_do_cliente([
            "Dispõe o art. 281 do CTB que o auto será arquivado. Segundo o cliente, não havia placa."
        ])
        self.assertEqual(pars, ["Dispõe o art. 281 do CTB que o auto será arquivado."])
        self.assertEqual(n, 1)

# Rodada real de 02/10/2026 (prompt anterior, defesa, caso fictício), resumida:
# qualificação no 1º parágrafo, pedido com "pede deferimento" no último.
RASCUNHO_SEM_TITULOS = (
    "Mariana Souza Lima, portadora do CPF 52998224725, titular da Carteira Nacional de "
    "Habilitação nº 04512345678, residente e domiciliada na Rua das Laranjeiras, 120, apto 302, "
    "CEP 22240003, Rio de Janeiro/RJ, telefone 21987654321, endereço eletrônico "
    "mariana@example.com, vem, tempestivamente, apresentar defesa prévia contra a Notificação "
    "de autuação nº E123456789.\n\n"
    "Conforme se extrai da notificação, a velocidade considerada foi de 90 km/h e a velocidade "
    "máxima permitida no local era de 80 km/h.\n\n"
    "Com efeito, a condutora dirigia-se ao hospital acompanhando sua filha, que apresentava "
    "crise de asma, e não havia placa de velocidade visível no trecho percorrido.\n\n"
    "Diante do exposto, requer o acolhimento da presente defesa prévia, com o consequente "
    "arquivamento do auto de infração. Nestes termos, pede deferimento."
)
FATO = "No dia 14/08/2026, às 07h52, o veículo foi autuado na Av. Brasil."
FUNDAMENTO = "O art. 90 do CTB afasta a sanção quando a sinalização é insuficiente."
RASCUNHO_COM_TITULOS = (
    f"**DOS FATOS**\n\n{FATO}\n\n**DOS FUNDAMENTOS**\n\n{FUNDAMENTO}\n\n"
    "Ante o exposto, resta demonstrado que a sinalização era insuficiente.\n\n"
    "DO PEDIDO\n\nRequer o arquivamento.\n\nNestes termos, pede deferimento."
)


class TestRemoverPedido(unittest.TestCase):
    def test_tira_o_pedido_do_fim(self):
        pars, removido = remover_pedido(
            ["Fato.", "Diante do exposto, requer o arquivamento.", "Nestes termos, pede deferimento."])
        self.assertEqual(pars, ["Fato."])
        self.assertTrue(removido)

    def test_pede_deferimento_colado_no_ultimo_fundamento(self):
        pars, removido = remover_pedido(["O art. 90 afasta a sanção. Nestes termos, pede deferimento."])
        self.assertEqual(pars, ["O art. 90 afasta a sanção."])
        self.assertTrue(removido)

    def test_fundamento_que_comeca_por_ante_o_exposto_fica(self):
        pars, removido = remover_pedido(["Ante o exposto, resta claro que não havia placa."])
        self.assertEqual(pars, ["Ante o exposto, resta claro que não havia placa."])
        self.assertFalse(removido)


class TestRemoverPedidoRevisaoFinal(unittest.TestCase):
    """Revisão final da branch (02/10/2026): fundamento real apagado e pedido do
    modelo que passava."""

    def test_palavras_parecidas_com_requer_nao_sao_pedido(self):
        for par in ("Assim sendo, o auto não atende ao art. 280 e o requerente não pode ser penalizado.",
                    "Diante do exposto, resta claro o que o requerimento demonstra.",
                    "Posto isso, o requerido não comprovou a sinalização."):
            with self.subTest(par=par):
                self.assertEqual(remover_pedido(["Fato.", par]), (["Fato.", par], False))

    def test_pedido_enumerado_sai_inteiro(self):
        pars = ["O art. 90 afasta a sanção.", "Diante do exposto, requer:",
                "a) o arquivamento do auto;", "b) subsidiariamente, a advertência."]
        self.assertEqual(remover_pedido(pars), (["O art. 90 afasta a sanção."], True))

    def test_lista_no_fundamento_sem_pedido_fica(self):
        pars = ["O auto tem dois vícios:", "a) não identifica o equipamento;", "b) não traz a placa."]
        self.assertEqual(remover_pedido(pars), (pars, False))

    def test_pede_deferimento_solto(self):
        for fecho_ in ("Pede deferimento.", "Nesses termos, pede deferimento.",
                       "Respeitosamente, pede deferimento.", "Termos em que, espera deferimento."):
            with self.subTest(fecho=fecho_):
                self.assertEqual(remover_pedido(["Fundamento.", fecho_]), (["Fundamento."], True))


class TestSepararSecoes(unittest.TestCase):
    def test_com_titulos(self):
        secoes, removido = separar_secoes(RASCUNHO_COM_TITULOS, "Mariana Souza Lima")
        self.assertEqual(secoes, (
            ("DOS FATOS", (FATO,)),
            ("DOS FUNDAMENTOS", (FUNDAMENTO, "Ante o exposto, resta demonstrado que a sinalização era insuficiente.")),
        ))
        self.assertTrue(removido)

    def test_variantes_de_titulo(self):
        for fatos, fundamentos in (("I – DOS FATOS", "II – DOS FUNDAMENTOS"),
                                   ("1. Dos fatos", "2. Do direito"),
                                   ("DOS FATOS:", "DOS FUNDAMENTOS JURÍDICOS:"),
                                   ("I) DOS FATOS", "II) Dos Fundamentos"),
                                   ("## DOS FATOS", "## DOS FUNDAMENTOS")):
            with self.subTest(fatos=fatos):
                secoes, _ = separar_secoes(f"{fatos}\n{FATO}\n\n{fundamentos}\n{FUNDAMENTO}")
                self.assertEqual(secoes, (("DOS FATOS", (FATO,)), ("DOS FUNDAMENTOS", (FUNDAMENTO,))))

    def test_titulo_na_mesma_linha_do_texto(self):
        secoes, _ = separar_secoes(f"DOS FATOS: {FATO}\n\nDOS FUNDAMENTOS – {FUNDAMENTO}")
        self.assertEqual(secoes, (("DOS FATOS", (FATO,)), ("DOS FUNDAMENTOS", (FUNDAMENTO,))))

    def test_paragrafo_que_comeca_por_dos_fatos_nao_e_titulo(self):
        secoes, _ = separar_secoes(f"Dos fatos narrados no auto não se extrai a placa.\n\n{FUNDAMENTO}")
        self.assertEqual(secoes, (("DOS FATOS E DOS FUNDAMENTOS",
                                   ("Dos fatos narrados no auto não se extrai a placa.", FUNDAMENTO)),))

    def test_sem_titulos_vira_secao_unica_sem_qualificacao_nem_pedido(self):
        secoes, removido = separar_secoes(RASCUNHO_SEM_TITULOS, "Mariana Souza Lima")
        self.assertEqual(len(secoes), 1)
        titulo_secao, pars = secoes[0]
        self.assertEqual(titulo_secao, "DOS FATOS E DOS FUNDAMENTOS")
        self.assertEqual(len(pars), 2)
        self.assertTrue(pars[0].startswith("Conforme se extrai"))
        self.assertTrue(pars[1].startswith("Com efeito"))
        self.assertTrue(removido)

    def test_qualificacao_antes_de_dos_fatos_sai(self):
        secoes, _ = separar_secoes(
            "Mariana Souza Lima, CPF 52998224725, vem apresentar defesa.\n\n"
            f"DOS FATOS\n\n{FATO}\n\nDOS FUNDAMENTOS\n\n{FUNDAMENTO}", "Mariana Souza Lima")
        self.assertEqual(secoes[0], ("DOS FATOS", (FATO,)))

    def test_titulo_unico_dos_fatos_e_dos_fundamentos(self):
        secoes, _ = separar_secoes(f"DOS FATOS E DOS FUNDAMENTOS\n\n{FATO}\n\n{FUNDAMENTO}")
        self.assertEqual(secoes, (("DOS FATOS E DOS FUNDAMENTOS", (FATO, FUNDAMENTO)),))

    def test_linhas_quebradas_viram_um_paragrafo(self):
        secoes, _ = separar_secoes(f"DOS FATOS\nNo dia 14/08/2026,\nàs 07h52.\n\nDOS FUNDAMENTOS\n{FUNDAMENTO}")
        self.assertEqual(secoes[0], ("DOS FATOS", ("No dia 14/08/2026, às 07h52.",)))

    # Fixture de 25/09/2026: cabeçalho solto, qualificação e pedido — nada de fatos.
    def test_sem_fatos_nem_fundamentos_e_resposta_invalida(self):
        with self.assertRaises(RespostaDoModeloInvalida):
            separar_secoes(RASCUNHO_REAL, "Mariana Souza Lima")

    def test_cabecalho_solto_no_inicio_sai(self):
        secoes, _ = separar_secoes(f"DEFESA PRÉVIA\n\nAuto de Infração nº: E123\nÓrgão: CET-RIO\n\n{FATO}")
        self.assertEqual(secoes, (("DOS FATOS E DOS FUNDAMENTOS", (FATO,)),))


class TestSepararSecoesRevisaoFinal(unittest.TestCase):
    # Com o prompt novo o modelo termina nos fundamentos: o último parágrafo é argumento.
    def test_nota_se_no_ultimo_fundamento_fica(self):
        ultimo = "Nota-se, ainda, que o auto não informa a data da última aferição."
        secoes, removido = separar_secoes(f"DOS FATOS\n\n{FATO}\n\nDOS FUNDAMENTOS\n\n{FUNDAMENTO}\n\n{ultimo}")
        self.assertEqual(secoes[1], ("DOS FUNDAMENTOS", (FUNDAMENTO, ultimo)))
        self.assertFalse(removido)

    def test_titulos_de_pedido_que_o_modelo_inventa(self):
        for titulo_ in ("PEDIDO", "DOS PEDIDOS SUBSIDIÁRIOS", "CONCLUSÃO", "DA CONCLUSÃO"):
            with self.subTest(titulo=titulo_):
                secoes, removido = separar_secoes(
                    f"DOS FATOS\n\n{FATO}\n\nDOS FUNDAMENTOS\n\n{FUNDAMENTO}\n\n{titulo_}\n\nRequer o arquivamento.")
                self.assertEqual(secoes[1], ("DOS FUNDAMENTOS", (FUNDAMENTO,)))
                self.assertTrue(removido)

    def test_fato_com_vem_e_nome_do_cliente_fica(self):
        fato = ("Mariana Souza Lima trafegava pela Av. Brasil quando foi autuada, e vem, desde então, "
                "contestando a medição.")
        secoes, _ = separar_secoes(f"{fato}\n\n{FUNDAMENTO}", "Mariana Souza Lima")
        self.assertEqual(secoes, (("DOS FATOS E DOS FUNDAMENTOS", (fato, FUNDAMENTO)),))


class TestMontarPeca(unittest.TestCase):
    def test_peca_completa(self):
        p = montar_peca(RASCUNHO_COM_TITULOS, dict(DEFESA, orgao_autuador="CET-RIO"),
                        "desclassificacao", "I", True)
        self.assertIsInstance(p, Peca)
        self.assertEqual(p.enderecamento, "À Autoridade de Trânsito do órgão autuador CET-RIO")
        self.assertEqual(p.titulo, "DEFESA PRÉVIA")
        self.assertEqual(p.campos, campos(DEFESA))
        self.assertEqual(p.qualificacao, qualificacao(DEFESA))
        self.assertEqual([t for t, _ in p.secoes], ["I – DOS FATOS", "II – DOS FUNDAMENTOS"])
        self.assertEqual(p.titulo_pedido, "III – DO PEDIDO")
        self.assertEqual(p.abertura_pedido, ABERTURA_PEDIDO)
        self.assertEqual(p.pedido, pedido(DEFESA, "desclassificacao", "I", True))
        self.assertEqual(p.fecho, fecho(DEFESA))
        self.assertEqual(p.nome_arquivo, "defesa-previa-E123456789.pdf")
        self.assertEqual(p.titulo_documento, "Defesa prévia — Auto nº E123456789")
        self.assertTrue(p.pedido_do_modelo_removido)

    def test_frases_do_cliente_saem_e_sao_contadas(self):
        rascunho = (
            f"DOS FATOS\n\n{FATO} Não há relato do cliente sobre as circunstâncias.\n\n"
            f"DOS FUNDAMENTOS\n\n{FUNDAMENTO}"
        )
        p = montar_peca(rascunho, DEFESA)
        self.assertEqual(p.secoes[0], ("I – DOS FATOS", (FATO,)))
        self.assertEqual(p.frases_do_cliente_removidas, 1)

    def test_secao_que_fica_vazia_sai_e_o_pedido_renumera(self):
        rascunho = f"DOS FATOS\n\nO cliente não relatou fatos.\n\nDOS FUNDAMENTOS\n\n{FUNDAMENTO}"
        p = montar_peca(rascunho, DEFESA)
        self.assertEqual([t for t, _ in p.secoes], ["I – DOS FUNDAMENTOS"])
        self.assertEqual(p.titulo_pedido, "II – DO PEDIDO")

    def test_sem_cliente_contagem_zero(self):
        p = montar_peca(RASCUNHO_COM_TITULOS, DEFESA)
        self.assertEqual(p.frases_do_cliente_removidas, 0)

    def test_tudo_era_do_cliente_e_erro_de_resposta(self):
        with self.assertRaises(RespostaDoModeloInvalida):
            montar_peca("DOS FATOS\n\nO cliente não relatou fatos.", DEFESA)

    def test_secao_unica_renumera_o_pedido(self):
        p = montar_peca(RASCUNHO_SEM_TITULOS, RECURSO)
        self.assertEqual([t for t, _ in p.secoes], ["I – DOS FATOS E DOS FUNDAMENTOS"])
        self.assertEqual(p.titulo_pedido, "II – DO PEDIDO")

    # Rodada 3 de 25/09/2026: a defesa prévia que o modelo endereçou à JARI.
    def test_enderecamento_do_modelo_e_trocado_pelo_do_codigo(self):
        rascunho = (
            "Excelentíssimo Senhor Presidente da Junta Administrativa de Recursos de "
            "Infrações (JARI) do órgão autuador CET-RIO,\n\n"
            f"DOS FATOS\n\n{FATO}\n\nDOS FUNDAMENTOS\n\n{FUNDAMENTO}"
        )
        p = montar_peca(rascunho, DEFESA)
        self.assertEqual(p.enderecamento, "À Autoridade de Trânsito do órgão autuador CET-RIO")
        self.assertNotIn("JARI", " ".join(par for _, pars in p.secoes for par in pars))

    def test_sem_ia_continua_funcionando(self):
        p = montar_peca("[Modo sem IA: defina DEEPSEEK_API_KEY] Rascunho indisponível.", DEFESA)
        self.assertEqual(p.secoes, (("I – DOS FATOS E DOS FUNDAMENTOS",
                                     ("[Modo sem IA: defina DEEPSEEK_API_KEY] Rascunho indisponível.",)),))


class TestParagrafoParaPdf(unittest.TestCase):
    def test_quebra_de_linha_vira_br(self):
        self.assertEqual(paragrafo_para_pdf("Mariana\nCPF 1"), "Mariana<br/>CPF 1")

    def test_escapa_html(self):
        self.assertEqual(paragrafo_para_pdf("A & B <x>"), "A &amp; B &lt;x&gt;")


if __name__ == "__main__":
    unittest.main()
