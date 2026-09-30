"""Testes de base_legal.py contra o ctb.json real. Rodar de dentro de pipeline/:

    python3 -m unittest test_base_legal -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import re
import shutil
import tempfile
import unittest
from pathlib import Path

from base_legal import BaseLegalIndisponivel, carregar_ctb, montar_base, numero_vigente

CTB_DIR = str(Path(__file__).resolve().parent.parent / "CTB-compilado_files")


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

    def test_numero_vigente_normaliza(self):
        self.assertEqual(numero_vigente(self.c, "90"), "90")
        self.assertEqual(numero_vigente(self.c, "281-a"), "281-A")
        self.assertIsNone(numero_vigente(self.c, "9999"))


if __name__ == "__main__":
    unittest.main()
