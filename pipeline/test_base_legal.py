"""Testes de base_legal.py contra o ctb.json real. Rodar de dentro de pipeline/:

    python3 -m unittest test_base_legal -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import re
import shutil
import tempfile
import unittest
from pathlib import Path

from base_legal import (
    BaseLegalIndisponivel,
    cabe_advertencia,
    carregar_ctb,
    montar_base,
    natureza,
    numero_vigente,
)
from tabela_enquadramentos import carregar_tabela

CTB_DIR = str(Path(__file__).resolve().parent.parent / "CTB-compilado_files")

TABELA = str(Path(__file__).resolve().parent.parent / "enquadramentos" / "saida" / "enquadramentos.json")


def cabecalhos(texto):
    return re.findall(r"^### Art\. (\S+)", texto, re.M)


class TestCarregamento(unittest.TestCase):
    def test_carrega_a_base_real(self):
        c = carregar_ctb(CTB_DIR)
        self.assertRegex(c.ctb.meta["sha256"], r"^[0-9a-f]{64}$")

    def test_diretorio_ausente(self):
        with self.assertRaises(BaseLegalIndisponivel):
            carregar_ctb("/nao/existe/ctb")

    def test_json_corrompido_e_falha_nao_fica_em_cache(self):
        # 29/09/2026: um "Sim" colado no início do ctb.json o tornou inválido.
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            shutil.copy(Path(CTB_DIR) / "consulta.py", raiz / "consulta.py")
            (raiz / "saida").mkdir()
            original = (Path(CTB_DIR) / "saida" / "ctb.json").read_text(encoding="utf-8")
            (raiz / "saida" / "ctb.json").write_text("Sim" + original, encoding="utf-8")
            with self.assertRaises(BaseLegalIndisponivel):
                carregar_ctb(str(raiz))
            (raiz / "saida" / "ctb.json").write_text(original, encoding="utf-8")
            self.assertTrue(carregar_ctb(str(raiz)).ctb.meta["sha256"])


class TestMontarBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = carregar_ctb(CTB_DIR)

    def test_218_traz_enquadramento_extra_e_rito(self):
        b = montar_base(self.c, "Art. 218, I, do CTB")
        self.assertEqual(b.enquadramento, "art. 218, I")
        for n in ("218", "61", "90", "257", "280", "281", "281-A", "285", "290"):
            self.assertIn(n, b.artigos, n)
        self.assertIn("Art. 61", b.texto)
        self.assertRegex(b.sha256, r"^[0-9a-f]{64}$")
        self.assertTrue(b.obtido_em)

    def test_remissoes_entram_com_texto(self):
        b = montar_base(self.c, "Art. 208 do CTB")
        self.assertIn("44-A", b.artigos)
        self.assertIn("conversão à direita", b.texto)
        b = montar_base(self.c, "Art. 165-A")
        self.assertTrue({"277", "270"} <= b.artigos)

    def test_nenhum_artigo_duplicado(self):
        for amparo in ("Art. 218, I", "Art. 208", "Art. 165-A", "Art. 280", None):
            with self.subTest(amparo=amparo):
                cab = cabecalhos(montar_base(self.c, amparo).texto)
                self.assertEqual(len(cab), len(set(cab)))

    def test_nao_reconhecido_fica_so_com_rito(self):
        for amparo in ("7455-0", "", None, "Excesso de velocidade", "218-I"):
            with self.subTest(amparo=amparo):
                b = montar_base(self.c, amparo)
                self.assertIsNone(b.enquadramento)
                self.assertNotIn("218", b.artigos)
                self.assertIn("280", b.artigos)
                self.assertIn("90", b.artigos)

    # "§ único" caía no caput (15/10/2026): o celular do art. 252 virava o caput.
    def test_paragrafo_unico_com_sinal(self):
        b = montar_base(self.c, "Art. 252, § único")
        self.assertEqual(b.enquadramento, "art. 252, parágrafo único")

    # CASO_363f15e6 (15/10/2026): "Artigo 5" virou o art. 5º, e a peça sustentaria como
    # infração um artigo que não tipifica nenhuma. Só o Capítulo XV (162 a 255) tipifica.
    def test_artigo_fora_das_infracoes_fica_so_com_rito(self):
        for amparo in ("Artigo 5", "Art. 5", "Art. 161", "Art. 280", "Art. 256"):
            with self.subTest(amparo=amparo):
                b = montar_base(self.c, amparo)
                self.assertIsNone(b.enquadramento)
                self.assertIn("280", b.artigos)

    def test_bordas_das_infracoes_valem(self):
        for amparo, numero in (("Art. 162, I", "162"), ("Art. 165-A", "165-A"), ("Art. 255", "255")):
            with self.subTest(amparo=amparo):
                b = montar_base(self.c, amparo)
                self.assertIsNotNone(b.enquadramento)
                self.assertIn(numero, b.artigos)

    def test_numero_vigente_normaliza(self):
        self.assertEqual(numero_vigente(self.c, "90"), "90")
        self.assertEqual(numero_vigente(self.c, "281-a"), "281-A")
        self.assertIsNone(numero_vigente(self.c, "9999"))


class TestAdvertencia(unittest.TestCase):
    """Spec 2026-10-02, §3.4: art. 267 — leve ou média, punida com multa."""

    @classmethod
    def setUpClass(cls):
        cls.c = carregar_ctb(CTB_DIR)

    def test_natureza_do_218(self):
        self.assertEqual(natureza(self.c, "art. 218, I"), ("média", "multa"))
        self.assertEqual(natureza(self.c, "art. 218, II"), ("grave", "multa"))
        self.assertEqual(natureza(self.c, "art. 218, III")[0], "gravíssima")

    def test_natureza_desconhecida(self):
        for ref in ("art. 218", "7455-0", "", "art. 9999"):
            with self.subTest(ref=ref):
                self.assertIsNone(natureza(self.c, ref))

    def test_media_cabe(self):
        self.assertTrue(cabe_advertencia(self.c, "art. 218, I", None))

    def test_grave_e_gravissima_nao_cabem(self):
        self.assertFalse(cabe_advertencia(self.c, "art. 218, II", None))
        self.assertFalse(cabe_advertencia(self.c, "art. 218, III", None))

    def test_desclassificacao_usa_o_inciso_da_conta(self):
        # Auto no II (grave), conta no I (média): vale a natureza depois da desclassificação.
        self.assertTrue(cabe_advertencia(self.c, "art. 218, II", "I"))
        self.assertFalse(cabe_advertencia(self.c, "art. 218, III", "II"))

    def test_enquadramento_nao_reconhecido_nao_cabe(self):
        for enq in (None, ""):
            with self.subTest(enq=enq):
                self.assertFalse(cabe_advertencia(self.c, enq, None))
                self.assertFalse(cabe_advertencia(self.c, enq, "I"))

    def test_leve_fora_do_218_cabe(self):
        self.assertTrue(cabe_advertencia(self.c, "art. 181, II", None))

    def test_267_entra_na_base_quando_pedido(self):
        sem = montar_base(self.c, "Art. 218, I, do CTB")
        com = montar_base(self.c, "Art. 218, I, do CTB", artigos_do_pedido=("267",))
        self.assertNotIn("267", sem.artigos)
        self.assertIn("267", com.artigos)
        self.assertIn("Art. 267", com.texto)
        self.assertTrue(sem.artigos <= com.artigos)
        self.assertEqual(com.enquadramento, "art. 218, I")

    def test_artigo_do_pedido_inexistente_e_ignorado(self):
        b = montar_base(self.c, "Art. 218, I, do CTB", artigos_do_pedido=("9999",))
        self.assertNotIn("9999", b.artigos)


class TestCodigoDeEnquadramento(unittest.TestCase):
    """Spec 2026-10-15, §6.1: amparo → código → código no texto livre."""

    @classmethod
    def setUpClass(cls):
        cls.c = carregar_ctb(CTB_DIR)
        cls.t = carregar_tabela(TABELA)

    def base(self, amparo, codigo=None):
        return montar_base(self.c, amparo, codigo_enquadramento=codigo, tabela=self.t)

    def test_amparo_da_lista_e_codigo(self):
        b = self.base("art. 218, I", "7455-0")
        self.assertEqual((b.enquadramento, b.codigo), ("art. 218, I", "7455-0"))

    def test_codigo_sem_amparo(self):
        b = self.base(None, "7463-0")
        self.assertEqual((b.enquadramento, b.codigo), ("art. 218, II", "7463-0"))

    def test_codigo_no_texto_livre(self):
        for amparo in ("745-50", "Cód. 7455-0", "74550"):
            with self.subTest(amparo=amparo):
                b = self.base(amparo)
                self.assertEqual((b.enquadramento, b.codigo), ("art. 218, I", "7455-0"))

    def test_amparo_prevalece_e_codigo_divergente_nao_vai_ao_quadro(self):
        b = self.base("Art. 181, XI", "7455-0")
        self.assertEqual((b.enquadramento, b.codigo), ("art. 181, XI", None))

    def test_codigo_fora_da_lista_nao_enquadra(self):
        b = self.base("5002-0")  # art. 257, § 8º
        self.assertEqual((b.enquadramento, b.codigo), (None, None))

    def test_codigo_desconhecido(self):
        b = self.base(None, "9999-9")
        self.assertEqual((b.enquadramento, b.codigo), (None, None))

    def test_sem_tabela_como_antes(self):
        b = montar_base(self.c, "745-50")
        self.assertEqual((b.enquadramento, b.codigo), (None, None))


if __name__ == "__main__":
    unittest.main()
