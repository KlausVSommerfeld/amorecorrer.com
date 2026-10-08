"""Paridade com o diagnóstico do front (spec 2026-10-07, §7).

`tests/compartilhados/velocidade.json` é rodado aqui pelo caminho real do worker
(`montar_base` + `bloco_velocidade`) e em `src/lib/diagnostico.test.ts` pelo
`diagnostico.ts`. Quem mudar um lado muda o outro e o arquivo de casos.

    python3 -m unittest test_diagnostico_paridade -v
"""

import json
import unittest
from pathlib import Path

from base_legal import carregar_ctb, montar_base
from velocidade import _ENQUADRAMENTO_218, bloco_velocidade

CASOS = json.loads(
    (Path(__file__).resolve().parent.parent / "tests" / "compartilhados" / "velocidade.json")
    .read_text(encoding="utf-8")
)


class TestParidadeDoDiagnostico(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctb = carregar_ctb(str(Path(__file__).resolve().parent.parent / "CTB-compilado_files"))

    def test_cada_caso_bate_com_o_pipeline(self):
        for caso in CASOS:
            with self.subTest(amparo=caso["amparo_legal"], v=(caso["velocidade_permitida"], caso["velocidade_considerada"])):
                enq = montar_base(self.ctb, caso["amparo_legal"]).enquadramento
                enq218 = enq if enq and _ENQUADRAMENTO_218.match(enq) else None
                self.assertEqual(enq218, caso["enquadramento_218"])
                bloco = bloco_velocidade(caso, enq)
                self.assertEqual(bloco.situacao if bloco else None, caso["situacao"])
                self.assertEqual(bloco.inciso_da_conta if bloco else None, caso["inciso_da_conta"])

    def test_ha_casos_de_cada_situacao(self):
        situacoes = {c["situacao"] for c in CASOS}
        self.assertEqual(situacoes, {"sem_infracao", "desclassificacao", None})
