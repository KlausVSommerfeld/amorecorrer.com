# Base legal do CTB em toda peça — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda peça recebe o texto oficial dos artigos do CTB que pode citar, e uma conferência em código impede que citação fora dessa base chegue ao PDF — refazendo uma vez e, se falhar de novo, levando o caso a `failed`.

**Architecture:** `pipeline/base_legal.py` carrega o `consulta.py` e o `ctb.json` de `CTB-compilado_files/` (caminho `CTB_DIR`) e monta, por caso, o bloco normativo (enquadramento + remissões + extras + rito). `pipeline/conferencia.py` extrai as citações da peça, recusa o que está fora da base e orquestra o refazer com um `gerar` injetado. O worker liga as duas peças entre o contexto do caso e o PDF.

**Tech Stack:** Python 3.12 (`unittest`, `importlib`, `re`, `dataclasses`), o `consulta.py` do Klaus (só stdlib), DeepSeek `deepseek-flash` via SDK `openai` 1.65 (só na verificação real).

**Spec:** `docs/superpowers/specs/2026-09-29-base-legal-ctb-design.md` — leia antes de começar.

## Global Constraints

- Branch: `feat/base-legal-ctb` (já existe; o CTB versionado e a spec já estão nela).
- **Não alterar** nada em `CTB-compilado_files/` (parser, `consulta.py`, `saida/`). O pipeline só lê.
- O pipeline nunca gera peça sem base: base ausente ou inválida → `BaseLegalIndisponivel` (RuntimeError) → caso `failed`.
- Citação recusada → **uma** nova chamada com o pedido de correção; recusa de novo → `CitacaoForaDaBase` (RuntimeError) → caso `failed`, sem e-mail.
- `amparo_legal` não reconhecido → base só com o rito + `REGRA_SEM_ENQUADRAMENTO`. Nada é adivinhado.
- Extras: `EXTRAS_POR_ARTIGO = {"218": ("61",)}` — nenhum item a mais.
- Trecho entre aspas que não bate literalmente → **alerta no log**, nunca recusa.
- Modelo: `deepseek-flash`, raciocínio desligado, `max_tokens=1200`, `temperature=0.4` — como hoje.
- Não tocar: contrato do 202, `peca.py`, radar (`verificacao.py`, `RADAR_TESE_ATIVA`), Express, Edge.
- Testes Python: sempre `python3 -m unittest <módulos explícitos>` de dentro de `pipeline/`. **Nunca `unittest discover`** — `test_resend_smtp.py` manda e-mail real ao ser importado.
- Módulos testados (`base_legal`, `conferencia`, `prompt`) **não podem importar** `config`, `worker` nem nada fora da stdlib: rodam fora do venv de Windows.
- Nunca instalar em `pipeline/.venv`. Dependências da verificação real vão num diretório temporário (`pip install --target`).
- Comentários e textos em português, no estilo dos arquivos vizinhos.
- Todo commit termina com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
  ```

## Review Focus

1. **O modelo repete a nota de redação da base** ("redação dada pela Lei nº 11.334") — não pode ser recusado como lei externa, porque a lei está na base. Teste na Task 2.
2. **Remissão para o próprio artigo ou para artigo que já está no rito** (o 165-A remete ao 270; o 218 cita a si mesmo no caput) — não pode duplicar o artigo no bloco nem na lista. Teste na Task 1.
3. **Número com º ou sufixo escrito de outro jeito** ("art. 7º-A", "art. 281-a", "artigo 90") — a conferência normaliza antes de comparar. Teste na Task 2.
4. **Resolução/portaria sem número** ("conforme resolução do CONTRAN") — conta como norma externa. Teste na Task 2.
5. **A base fica corrompida entre dois casos** (o "Sim" colado no `ctb.json` em 29/09) — o carregamento falha com mensagem clara, e a falha não fica em cache: corrigido o arquivo, o próximo caso carrega. Teste na Task 1.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `pipeline/base_legal.py` | Criar | Carregar o CTB de `CTB_DIR`; montar a `BaseLegal` do caso |
| `pipeline/test_base_legal.py` | Criar | `unittest` contra o `ctb.json` real |
| `pipeline/conferencia.py` | Criar | `conferir_citacoes`, `gerar_com_conferencia`, `CitacaoForaDaBase` |
| `pipeline/test_conferencia.py` | Criar | `unittest`, com `gerar` falso para o refazer |
| `pipeline/prompt.py` | Modificar | `REGRA_BASE_LEGAL`, `REGRA_SEM_ENQUADRAMENTO`, `system_prompt(..., sem_enquadramento)`, `pedido_de_correcao`, `argumentos_da_chamada(..., historico)` |
| `pipeline/test_prompt.py` | Modificar | Constantes e testes novos |
| `pipeline/config.py` | Modificar | `ctb_dir` |
| `pipeline/worker.py` | Modificar | `call_deepseek(..., historico)`; fluxo base → gerar → conferir → PDF; logs |
| `docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md` | Modificar | Dockerfile/compose/`.env.vps` levam o CTB e o modelo certo |
| `.env.example`, `.env.production.example` | Modificar | `CTB_DIR` comentado |
| `CLAUDE.md`, `PENDENCIAS.md`, `PROGRESSO.md` | Modificar | Invariante, variável, pendências, sessão |

---

### Task 1: A base normativa do caso

**Files:**
- Create: `pipeline/base_legal.py`
- Create: `pipeline/test_base_legal.py`
- Modify: `pipeline/config.py` (depois de `radar_tese_ativa`)

**Interfaces:**
- Consumes: `CTB-compilado_files/consulta.py` (`CTB.carregar(path)`, `.meta`, `.artigo(n) -> dict` com `numero`/`status`, `.dispositivo(ref) -> (artigo, dispositivo)` com `citacao`/`status`, `.dispositivo_md(ref)`, `.contexto_peticao(enquadramentos, extras=...)`, `parse_ref`, `ReferenciaInvalida`, `PROCESSUAIS_PADRAO`).
- Produces:
  - `class BaseLegalIndisponivel(RuntimeError)`
  - `@dataclass(frozen=True) class Ctb: consulta: ModuleType; ctb: Any`
  - `carregar_ctb(ctb_dir: str) -> Ctb` (cacheado por caminho; falha não é cacheada)
  - `@dataclass(frozen=True) class BaseLegal: texto: str; artigos: frozenset[str]; enquadramento: str | None; sha256: str; obtido_em: str`
  - `montar_base(c: Ctb, amparo_legal: str | None) -> BaseLegal`
  - `numero_vigente(c: Ctb, numero: str) -> str | None` (normaliza "7º-A" → número do CTB; `None` se inexistente ou não vigente)
  - `EXTRAS_POR_ARTIGO: dict[str, tuple[str, ...]]`
  - `settings.ctb_dir: str`

- [ ] **Step 1: Escrever o teste que falha**

`pipeline/test_base_legal.py`:
```python
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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_base_legal 2>&1 | grep -E "Error:" | head -2
```
Esperado: `ModuleNotFoundError: No module named 'base_legal'`.

- [ ] **Step 3: Implementar**

`pipeline/base_legal.py`:
```python
"""Base normativa do CTB que acompanha toda peça.

O pipeline não cita o CTB de memória: cada caso recebe o texto oficial dos
artigos que pode citar, montado a partir de CTB-compilado_files/ (parser e
consulta do Klaus, sobre o compilado do Planalto). Ver a spec
docs/superpowers/specs/2026-09-29-base-legal-ctb-design.md.

Puro e sem dependências fora da stdlib: testável fora do venv de Windows.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import ModuleType
from typing import Any

# Aprovado pelo Klaus: só entra item novo com aprovação dele.
EXTRAS_POR_ARTIGO: dict[str, tuple[str, ...]] = {
    "218": ("61",),  # multa de velocidade → limites de velocidade por tipo de via
}

_REMISSAO = re.compile(r"\barts?\.\s*(\d+)\s*[º°]?\s*(-\s*[A-Za-z])?", re.I)
# "art. 5º da Lei nº …" não é remissão ao CTB.
_OUTRA_NORMA_A_SEGUIR = re.compile(r"^[^.;]{0,40}?\b(da|do)\s+(lei|decreto|c[óo]digo|constitui)", re.I)


class BaseLegalIndisponivel(RuntimeError):
    """Sem base do CTB não há peça: o caso vai a `failed`."""


@dataclass(frozen=True)
class Ctb:
    consulta: ModuleType
    ctb: Any  # consulta.CTB


@dataclass(frozen=True)
class BaseLegal:
    texto: str
    artigos: frozenset[str]
    enquadramento: str | None
    sha256: str
    obtido_em: str


@lru_cache(maxsize=4)
def carregar_ctb(ctb_dir: str) -> Ctb:
    """Uma vez por processo. Exceção não entra no cache do lru_cache."""
    raiz = Path(ctb_dir)
    modulo, dados = raiz / "consulta.py", raiz / "saida" / "ctb.json"
    if not modulo.is_file() or not dados.is_file():
        raise BaseLegalIndisponivel(
            f"base do CTB ausente em {raiz} (esperado consulta.py e saida/ctb.json)"
        )
    nome = f"consulta_ctb_{abs(hash(str(raiz.resolve())))}"
    spec = importlib.util.spec_from_file_location(nome, modulo)
    consulta = importlib.util.module_from_spec(spec)
    sys.modules[nome] = consulta  # dataclasses do consulta.py exigem o módulo registrado
    spec.loader.exec_module(consulta)
    try:
        ctb = consulta.CTB.carregar(dados)
    except (ValueError, KeyError) as e:  # JSONDecodeError é ValueError
        raise BaseLegalIndisponivel(f"{dados} inválido: {e}") from e
    if not ctb.meta.get("sha256"):
        raise BaseLegalIndisponivel(f"{dados} sem meta.sha256 — rode o parser de novo")
    return Ctb(consulta=consulta, ctb=ctb)


def numero_vigente(c: Ctb, numero: str) -> str | None:
    try:
        artigo = c.ctb.artigo(numero)
    except (KeyError, ValueError):
        return None
    return artigo["numero"] if artigo.get("status") == "vigente" else None


def _enquadramento(c: Ctb, amparo_legal: str | None) -> tuple[str, str] | None:
    """(citação, número do artigo) do dispositivo vigente, ou None — nada é adivinhado."""
    if not amparo_legal or not str(amparo_legal).strip():
        return None
    try:
        artigo, disp = c.ctb.dispositivo(c.consulta.parse_ref(str(amparo_legal)))
    except (c.consulta.ReferenciaInvalida, KeyError, ValueError):
        return None
    if disp.get("status") != "vigente" or artigo.get("status") != "vigente":
        return None
    return disp["citacao"], artigo["numero"]


def _remissoes(c: Ctb, citacao: str, proprio: str) -> list[str]:
    """Artigos que o dispositivo enquadrado (e a sanção dele) mencionam. Um nível só."""
    texto = c.ctb.dispositivo_md(citacao)
    achados: list[str] = []
    for m in _REMISSAO.finditer(texto):
        if _OUTRA_NORMA_A_SEGUIR.match(texto[m.end():]):
            continue
        n = numero_vigente(c, m.group(1) + (m.group(2) or "").replace(" ", "").upper())
        if n and n != proprio and n not in achados:
            achados.append(n)
    return achados


def montar_base(c: Ctb, amparo_legal: str | None) -> BaseLegal:
    processuais = [n for n in c.consulta.PROCESSUAIS_PADRAO if numero_vigente(c, n)]
    enq = _enquadramento(c, amparo_legal)
    citacao, proprio = enq if enq else (None, None)
    extras: list[str] = []
    if proprio:
        extras = _remissoes(c, citacao, proprio)
        extras += [n for n in EXTRAS_POR_ARTIGO.get(proprio, ()) if numero_vigente(c, n)]
    # Fora o que o rito já traz: o contexto_peticao repetiria o artigo.
    extras = [n for n in dict.fromkeys(extras) if n not in processuais]
    texto = c.ctb.contexto_peticao(enquadramentos=[citacao] if citacao else [], extras=extras)
    artigos = frozenset(([proprio] if proprio else []) + extras + processuais)
    return BaseLegal(
        texto=texto,
        artigos=artigos,
        enquadramento=citacao,
        sha256=c.ctb.meta["sha256"],
        obtido_em=str(c.ctb.meta.get("obtido_em", "")),
    )
```

Em `pipeline/config.py`, depois de `radar_tese_ativa: bool = False`:
```python

    # Base normativa do CTB (parser + consulta do Klaus). O pipeline lê direto
    # de lá — uma fonte da verdade, sem cópia. No contêiner, aponta para a
    # pasta copiada pelo Dockerfile.
    ctb_dir: str = str(REPO_ROOT / "CTB-compilado_files")
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_base_legal -v 2>&1 | tail -3 && python3 -m py_compile config.py && echo compila
```
Esperado: `Ran 8 tests`, `OK`, `compila`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/base_legal.py pipeline/test_base_legal.py pipeline/config.py
git commit -m "feat(pipeline): base normativa do CTB montada por caso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 2: A conferência das citações

**Files:**
- Create: `pipeline/conferencia.py`
- Create: `pipeline/test_conferencia.py`

**Interfaces:**
- Consumes: `BaseLegal`, `Ctb`, `numero_vigente`, `carregar_ctb`, `montar_base` (Task 1).
- Produces:
  - `@dataclass(frozen=True) class Recusa: trecho: str; motivo: str`
  - `@dataclass(frozen=True) class Resultado: recusas: list[Recusa]; alertas: list[str]`
  - `conferir_citacoes(peca: str, base: BaseLegal, c: Ctb) -> Resultado`
  - Motivos exatos: `"norma fora do CTB"`, `"não consta da base normativa fornecida"`, `"não existe no CTB"`.

- [ ] **Step 1: Escrever o teste que falha**

`pipeline/test_conferencia.py`:
```python
"""Testes de conferencia.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_conferencia -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest
from pathlib import Path

from base_legal import carregar_ctb, montar_base
from conferencia import conferir_citacoes

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

    def test_ctb_e_lei_9503_nao_sao_citacoes_externas(self):
        self.assertEqual(self.motivos("Nos termos do Código de Trânsito Brasileiro (Lei nº 9.503/1997)."), [])

    def test_aspas_nao_literais_viram_alerta_nao_recusa(self):
        r = self.conferir('O art. 280 exige "a identificação completa e inequívoca do radar utilizado".')
        self.assertEqual(r.recusas, [])
        self.assertEqual(len(r.alertas), 1)

    def test_aspas_literais_nao_alertam(self):
        r = self.conferir('O art. 281 diz que "no prazo máximo de trinta dias, não for expedida a notificação da autuação".')
        self.assertEqual(r.alertas, [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_conferencia 2>&1 | grep -E "Error:" | head -2
```
Esperado: `ModuleNotFoundError: No module named 'conferencia'`.

- [ ] **Step 3: Implementar**

`pipeline/conferencia.py`:
```python
"""Conferência das citações da peça contra a base normativa entregue.

Nenhuma citação fora da base chega ao PDF: o que não passa é recusado, e o
worker pede ao modelo uma nova versão (uma vez). Ver a spec
docs/superpowers/specs/2026-09-29-base-legal-ctb-design.md, §4.

Puro, sem dependências fora da stdlib.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from base_legal import BaseLegal, Ctb

_NUM = r"\d+\s*[º°]?\s*(?:-\s*[A-Za-z])?"
_CITACAO = re.compile(rf"\b(?:arts?\.|artigos?)\s*({_NUM}(?:\s*(?:,|\be\b|\ba\b)\s*{_NUM})*)", re.I)
_UM_NUMERO = re.compile(r"(\d+)\s*[º°]?\s*(?:-\s*([A-Za-z]))?")
_EXTERNA = re.compile(
    r"c[óo]digo\s+penal|c[óo]digo\s+civil|c[óo]digo\s+de\s+processo|constitui[çc][ãa]o|\bCF(?:/88)?\b"
    r"|resolu[çc](?:[ãa]o|[õo]es)|portarias?|delibera[çc](?:[ãa]o|[õo]es)|instru[çc][ãa]o\s+normativa"
    r"|s[úu]mulas?|jurisprud[êe]ncia|\bdecreto\b"
    r"|\blei\s+(?:federal\s+)?n[º°o.]*\s*(\d[\d.]*)",
    re.I,
)
_ASPAS = re.compile(r"[“\"]([^”\"]{25,})[”\"]")
_JANELA_EXTERNA = 60


@dataclass(frozen=True)
class Recusa:
    trecho: str
    motivo: str


@dataclass(frozen=True)
class Resultado:
    recusas: list[Recusa] = field(default_factory=list)
    alertas: list[str] = field(default_factory=list)


def _normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _so_digitos(s: str) -> str:
    return re.sub(r"\D", "", s)


def _leis_da_base(base: BaseLegal) -> set[str]:
    # A base traz notas como "(Redação dada pela Lei nº 11.334, de 2006)": repetir não é citar lei externa.
    return {_so_digitos(m.group(1)) for m in re.finditer(r"Lei\s+n[º°o.]*\s*(\d[\d.]*)", base.texto, re.I)}


def _externas(peca: str, base: BaseLegal) -> list[tuple[int, int, str]]:
    permitidas = _leis_da_base(base) | {"9503"}
    achados = []
    for m in _EXTERNA.finditer(peca):
        if m.group(1) is not None and _so_digitos(m.group(1)) in permitidas:
            continue
        achados.append((m.start(), m.end(), m.group(0)))
    return achados


def conferir_citacoes(peca: str, base: BaseLegal, c: Ctb) -> Resultado:
    recusas: list[Recusa] = []
    externas = _externas(peca, base)
    ja = set()

    for m in _CITACAO.finditer(peca):
        # "art. 24 do Código Penal": a citação é da outra norma, não do CTB.
        if any(0 <= ini - m.end() <= _JANELA_EXTERNA for ini, _, _ in externas):
            continue
        for n in _UM_NUMERO.finditer(m.group(1)):
            bruto = n.group(1) + (f"-{n.group(2).upper()}" if n.group(2) else "")
            if bruto in ja:
                continue
            ja.add(bruto)
            try:
                artigo = c.ctb.artigo(bruto)
            except (KeyError, ValueError):
                recusas.append(Recusa(f"art. {bruto}", "não existe no CTB"))
                continue
            numero = artigo["numero"]
            if numero in base.artigos:
                continue
            if artigo.get("status") != "vigente":
                recusas.append(Recusa(f"art. {numero}", f"dispositivo {artigo.get('status')}"))
            else:
                recusas.append(Recusa(f"art. {numero}", "não consta da base normativa fornecida"))

    vistos = set()
    for _, _, trecho in externas:
        chave = trecho.lower()
        if chave not in vistos:
            vistos.add(chave)
            recusas.append(Recusa(trecho, "norma fora do CTB"))

    base_norm = _normalizar(base.texto)
    alertas = [q for q in _ASPAS.findall(peca) if _normalizar(q) not in base_norm]
    return Resultado(recusas=recusas, alertas=alertas)
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_conferencia test_base_legal -v 2>&1 | tail -3
```
Esperado: `Ran 19 tests`, `OK`. Se `test_artigo_do_codigo_penal_nao_conta_como_ctb` falhar porque o art. 24 **também** foi recusado como "não consta da base", a janela de 60 caracteres não está pegando a norma a seguir — corrija a comparação de posição (o teste descreve o comportamento correto).

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/conferencia.py pipeline/test_conferencia.py
git commit -m "feat(pipeline): conferência das citações da peça contra a base do CTB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 3: As regras do prompt e o pedido de correção

**Files:**
- Modify: `pipeline/prompt.py`
- Modify: `pipeline/test_prompt.py`

**Interfaces:**
- Consumes: nada novo (o `pedido_de_correcao` recebe objetos com `.trecho` e `.motivo`, como a `Recusa` da Task 2).
- Produces:
  - `REGRA_BASE_LEGAL: str`, `REGRA_SEM_ENQUADRAMENTO: str`
  - `system_prompt(tese_ativa: bool, verificacao: Any = None, sem_enquadramento: bool = False) -> str` — ordem: `SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL [+ REGRA_SEM_ENQUADRAMENTO] [+ REGRAS_RADAR]`
  - `pedido_de_correcao(recusas) -> str`
  - `argumentos_da_chamada(modelo, sistema, contexto, historico: list[dict] | None = None) -> dict` — `messages = [system, user(contexto)] + (historico or [])`

- [ ] **Step 1: Escrever os testes que falham**

Em `pipeline/test_prompt.py`:

1. No bloco `from prompt import (...)`, acrescente `REGRA_BASE_LEGAL`, `REGRA_SEM_ENQUADRAMENTO` e `pedido_de_correcao`.
2. Troque:
```python
# Com a chave do radar desligada (ou sem bloco), o system prompt é só a base.
PROMPT_ANTIGO = SYSTEM_PROMPT_BASE
```
por:
```python
# Sem bloco do radar, o system prompt é a base mais a regra de base legal —
# que entra em toda peça desde a integração do CTB (29/09/2026).
PROMPT_ANTIGO = SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL
```
3. Antes de `class TestChaveDesligada`, acrescente:
```python
class TestBaseLegalNoPrompt(unittest.TestCase):
    def test_regra_de_base_legal_em_toda_peca(self):
        self.assertIn("exclusivamente a base normativa do CTB", REGRA_BASE_LEGAL)
        self.assertIn("Não cite outras leis, códigos, resoluções, portarias nem jurisprudência", REGRA_BASE_LEGAL)
        self.assertEqual(system_prompt(False), SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL)

    def test_sem_enquadramento_proibe_o_artigo_da_infracao(self):
        self.assertIn("não cite o artigo da infração", REGRA_SEM_ENQUADRAMENTO)
        self.assertEqual(system_prompt(False, sem_enquadramento=True),
                         SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_SEM_ENQUADRAMENTO)

    def test_ordem_com_radar(self):
        v = CASO["verificacao_medidor"]
        self.assertEqual(system_prompt(True, v, sem_enquadramento=True),
                         SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_SEM_ENQUADRAMENTO + REGRAS_RADAR)

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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_prompt 2>&1 | grep -E "Error:" | head -2
```
Esperado: `ImportError: cannot import name 'REGRA_BASE_LEGAL'`.

- [ ] **Step 3: Implementar**

Em `pipeline/prompt.py`:

1. Depois do bloco `SYSTEM_PROMPT_BASE = (...)`, acrescente:
```python

# Em toda peça, desde a integração do CTB (29/09/2026): a base normativa vai na
# mensagem do usuário, e a conferencia.py recusa o que estiver fora dela.
REGRA_BASE_LEGAL = (
    " Base legal: use exclusivamente a base normativa do CTB fornecida junto com os "
    "dados do caso; cite apenas dispositivos que constem dela e apenas o que o texto "
    "deles diz. Não cite outras leis, códigos, resoluções, portarias nem jurisprudência."
)
# Quando o amparo legal digitado não foi reconhecido: nada é adivinhado.
REGRA_SEM_ENQUADRAMENTO = (
    " O dispositivo da infração não pôde ser confirmado: não cite o artigo da infração; "
    "defenda pelos dispositivos da base."
)
```
2. Troque a função `system_prompt` inteira por:
```python
def system_prompt(tese_ativa: bool, verificacao: Any = None, sem_enquadramento: bool = False) -> str:
    # As regras do radar só entram quando há bloco: sem ele, qualquer menção
    # ao tema no prompt bastou para o modelo discutir o tema (24/09/2026).
    com_bloco = tese_ativa and bloco_verificacao(verificacao) is not None
    return (
        SYSTEM_PROMPT_BASE
        + REGRA_BASE_LEGAL
        + (REGRA_SEM_ENQUADRAMENTO if sem_enquadramento else "")
        + (REGRAS_RADAR if com_bloco else "")
    )
```
3. Troque a função `argumentos_da_chamada` inteira por:
```python
def argumentos_da_chamada(
    modelo: str, sistema: str, contexto: str, historico: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    return {
        "model": modelo,
        "messages": [
            {"role": "system", "content": sistema},
            {"role": "user", "content": contexto},
            # No refazer: a peça recusada (assistant) e o pedido de correção (user).
            *(historico or []),
        ],
        "max_tokens": 1200,
        "temperature": 0.4,
        # O deepseek-flash vem com raciocínio LIGADO por padrão. Numa rodada real
        # (25/09/2026), os 1200 tokens foram todos para o raciocínio e a peça voltou
        # vazia. Desligado, ele se comporta como o deepseek-chat de antes — que a
        # API já redirecionava para o próprio flash sem raciocínio.
        "extra_body": {"thinking": {"type": "disabled"}},
    }
```
4. No fim do arquivo, acrescente:
```python


def pedido_de_correcao(recusas) -> str:
    """Mensagem do refazer: diz exatamente o que foi recusado e por quê."""
    itens = "; ".join(f"'{r.trecho}' ({r.motivo})" for r in recusas)
    return (
        "Reescreva a peça inteira sem estas citações, mantendo o restante e as mesmas "
        f"regras de antes: {itens}."
    )
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_prompt test_peca test_verificacao test_base_legal test_conferencia 2>&1 | tail -3
```
Esperado: `OK` — todos os testes antigos do `test_prompt` continuam passando com o novo `PROMPT_ANTIGO`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/prompt.py pipeline/test_prompt.py
git commit -m "feat(pipeline): regra de base legal no prompt e pedido de correção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 4: Refazer uma vez, e o worker

**Files:**
- Modify: `pipeline/conferencia.py` (fim do arquivo)
- Modify: `pipeline/test_conferencia.py` (classe nova)
- Modify: `pipeline/worker.py` (imports; `call_deepseek`; bloco de geração em `run_dispatch_pipeline`)

**Interfaces:**
- Consumes: `conferir_citacoes`, `Recusa`, `Resultado` (Task 2); `pedido_de_correcao`, `system_prompt(..., sem_enquadramento)`, `argumentos_da_chamada(..., historico)` (Task 3); `carregar_ctb`, `montar_base` (Task 1); `settings.ctb_dir`.
- Produces:
  - `class CitacaoForaDaBase(RuntimeError)` com `.recusas: list[Recusa]`
  - `async def gerar_com_conferencia(gerar, base, c) -> tuple[str, Resultado, list[Recusa]]` — `gerar(historico: list[dict] | None) -> Awaitable[str]`; devolve (peça aprovada, resultado final, recusas da 1ª tentativa)
  - `call_deepseek(text_context: str, sistema: str | None = None, historico: list[dict] | None = None) -> str`

- [ ] **Step 1: Escrever o teste que falha**

No fim de `pipeline/test_conferencia.py`, antes do `if __name__`, e acrescentando `import asyncio` no topo e `from conferencia import CitacaoForaDaBase, gerar_com_conferencia` nos imports:
```python
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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_conferencia 2>&1 | grep -E "Error:" | head -2
```
Esperado: `ImportError: cannot import name 'CitacaoForaDaBase'`.

- [ ] **Step 3: Implementar a orquestração**

No fim de `pipeline/conferencia.py`, e acrescentando `from typing import Awaitable, Callable` e `from prompt import pedido_de_correcao` aos imports:
```python


class CitacaoForaDaBase(RuntimeError):
    """Recusada duas vezes: o caso vai a `failed`, sem e-mail ao cliente."""

    def __init__(self, recusas: list[Recusa]):
        self.recusas = recusas
        itens = "; ".join(f"{r.trecho} ({r.motivo})" for r in recusas)
        super().__init__(f"citação fora da base normativa após nova tentativa: {itens}")


async def gerar_com_conferencia(
    gerar: Callable[[list[dict[str, str]] | None], Awaitable[str]],
    base: BaseLegal,
    c: Ctb,
) -> tuple[str, Resultado, list[Recusa]]:
    """Gera, confere e refaz UMA vez. Devolve (peça, resultado final, recusas da 1ª)."""
    peca = await gerar(None)
    primeiro = conferir_citacoes(peca, base, c)
    if not primeiro.recusas:
        return peca, primeiro, []
    historico = [
        {"role": "assistant", "content": peca},
        {"role": "user", "content": pedido_de_correcao(primeiro.recusas)},
    ]
    segunda = await gerar(historico)
    resultado = conferir_citacoes(segunda, base, c)
    if resultado.recusas:
        raise CitacaoForaDaBase(resultado.recusas)
    return segunda, resultado, primeiro.recusas
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_conferencia 2>&1 | tail -2
```
Esperado: `OK`.

- [ ] **Step 5: Ligar o worker**

Em `pipeline/worker.py`:

1. Nos imports, depois de `from peca import paragrafo_para_pdf, texto_da_peca`, acrescente:
```python
from base_legal import carregar_ctb, montar_base
from conferencia import gerar_com_conferencia
```
2. Troque a assinatura `async def call_deepseek(text_context: str, sistema: str | None = None) -> str:` por:
```python
async def call_deepseek(
    text_context: str, sistema: str | None = None, historico: list[dict[str, str]] | None = None
) -> str:
```
e, dentro dela, troque
```python
        **argumentos_da_chamada(settings.deepseek_model, sistema or system_prompt(False), text_context)
```
por
```python
        **argumentos_da_chamada(
            settings.deepseek_model, sistema or system_prompt(False), text_context, historico
        )
```
3. Em `run_dispatch_pipeline`, troque:
```python
            sistema = system_prompt(settings.radar_tese_ativa, case.get("verificacao_medidor"))
            draft = await call_deepseek(context, sistema)
```
por:
```python
            # Base normativa do CTB: sem ela não há peça (BaseLegalIndisponivel → failed).
            ctb = carregar_ctb(settings.ctb_dir)
            base = montar_base(ctb, case.get("amparo_legal"))
            log.info(
                "base legal case_id=%s ctb_sha256=%s obtido_em=%s enquadramento=%s artigos=%s",
                payload.case_id, base.sha256[:12], base.obtido_em,
                base.enquadramento or "não reconhecido", sorted(base.artigos),
            )
            usuario = f"{context}\n\n{base.texto}"
            sistema = system_prompt(
                settings.radar_tese_ativa,
                case.get("verificacao_medidor"),
                sem_enquadramento=base.enquadramento is None,
            )

            async def gerar(historico: list[dict[str, str]] | None) -> str:
                return await call_deepseek(usuario, sistema, historico)

            # Citação fora da base: refaz uma vez; de novo → CitacaoForaDaBase → failed.
            draft, conferido, recusas_1a = await gerar_com_conferencia(gerar, base, ctb)
            if recusas_1a:
                log.warning(
                    "peça refeita case_id=%s recusas=%s",
                    payload.case_id, [(r.trecho, r.motivo) for r in recusas_1a],
                )
            if conferido.alertas:
                log.info("aspas não literais case_id=%s alertas=%r", payload.case_id, conferido.alertas)
```

- [ ] **Step 6: Compilar e rodar a suíte**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline
python3 -m py_compile worker.py && echo compila
python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia 2>&1 | tail -2
cd .. && npm run radar:test 2>&1 | grep -E '^# (pass|fail)'
```
Esperado: `compila`; `OK`; `# pass 49` / `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/conferencia.py pipeline/test_conferencia.py pipeline/worker.py
git commit -m "feat(pipeline): toda peça com base do CTB, conferida e refeita uma vez

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 5: Verificação real com o DeepSeek, até o PDF

**Files:** nenhum arquivo do projeto. Código descartável num diretório temporário.

**Interfaces:**
- Consumes: `worker.call_deepseek`, `worker.build_pdf_bytes`, `prompt.build_case_context`, `prompt.system_prompt`, `base_legal.*`, `conferencia.*`, `peca.texto_da_peca`.
- Produces: 8 PDFs abertos e julgados; a tabela de resultados para o `PROGRESSO.md`.

- [ ] **Step 1: Dependências fora do venv e a chave**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
TMP=$(mktemp -d); echo $TMP
python3 -m pip install --quiet --target "$TMP/pydeps" -r pipeline/requirements.txt && echo instalado
grep -qE '^DEEPSEEK_API_KEY=.+' .env && echo chave-no-.env
```
Esperado: `instalado`, `chave-no-.env`. O `.env.local` deixa a chave vazia de propósito (sem IA no perfil local): a chave vai **só** como variável de ambiente do processo, sem editar nem imprimir arquivo nenhum.

- [ ] **Step 2: O script de verificação**

```bash
cat > "$TMP/verificar.py" <<'EOF'
import asyncio, os, re
from config import settings
from worker import call_deepseek, build_pdf_bytes
from prompt import build_case_context, system_prompt
from base_legal import carregar_ctb, montar_base
from conferencia import gerar_com_conferencia, CitacaoForaDaBase
from peca import texto_da_peca

BASE = {"nome": "Mariana Souza Lima", "email": "m@example.com", "cpf": "52998224725", "cidade": "Rio de Janeiro",
        "estado": "RJ", "endereco": "Rua das Laranjeiras, 120", "placa": "RIO2A19", "orgao_autuador": "CET-RIO",
        "numero_auto": "E123456789", "especie_documento": "defesa_previa", "marca_modelo_especie": "FIAT/ARGO 1.0",
        "expedida_em": "20/08/2026", "data_infracao": "2026-08-14T07:52:00"}
CASOS = {
 "218_I": dict(amparo_legal="Art. 218, I, do CTB", velocidade_permitida=80, velocidade_aferida=97,
   justificativa="Levava minha filha ao hospital com crise de asma. Não vi placa de velocidade no trecho."),
 "218_III": dict(amparo_legal="Art. 218, III, do CTB", velocidade_permitida=60, velocidade_aferida=95, expedida_em="30/09/2026",
   justificativa="O radar ficava escondido atrás de uma árvore. A notificação chegou quase 50 dias depois da infração."),
 "208": dict(amparo_legal="Art. 208 do CTB", justificativa="O semáforo estava com defeito, piscando amarelo, e eu passei com cuidado."),
 "230_V": dict(amparo_legal="Art. 230, V, do CTB", justificativa="O licenciamento foi pago dois dias antes; tenho o comprovante."),
 "165A": dict(amparo_legal="Art. 165-A do CTB", justificativa="O agente não me ofereceu o bafômetro nem explicou nada. Eu não tinha bebido."),
 "181_XVII": dict(amparo_legal="Art. 181, XVII, do CTB", justificativa="Não havia placa de proibido estacionar visível; estava coberta por galhos."),
 "codigo_7455": dict(amparo_legal="7455-0", velocidade_permitida=60, velocidade_aferida=70,
   justificativa="Não reconheço a infração; não vi placa de velocidade."),
 "provocado_CP": dict(amparo_legal="Art. 218, I, do CTB", velocidade_permitida=80, velocidade_aferida=97,
   justificativa="Estava levando minha filha ao hospital. Quero que a defesa cite o estado de necessidade do art. 24 do Código Penal e a Constituição Federal."),
}

async def main():
    out = os.environ["OUT"]
    ctb = carregar_ctb(settings.ctb_dir)
    for nome, extra in CASOS.items():
        caso = dict(BASE, **extra)
        base = montar_base(ctb, caso["amparo_legal"])
        usuario = f"{build_case_context(caso)}\n\n{base.texto}"
        sistema = system_prompt(False, None, sem_enquadramento=base.enquadramento is None)
        chamadas = []
        async def gerar(hist):
            chamadas.append(hist)
            return await call_deepseek(usuario, sistema, hist)
        try:
            peca, res, recusas_1a = await gerar_com_conferencia(gerar, base, ctb)
            corpo = "Rascunho gerado para apreciação. Revise antes de protocolar.\n\n" + texto_da_peca(peca, caso)
            open(f"{out}/{nome}.pdf", "wb").write(build_pdf_bytes(f"Recurso — {nome}", corpo))
            open(f"{out}/{nome}.txt", "w").write(peca)
            arts = sorted(set(re.findall(r"\bart(?:igo)?s?\.?\s*(\d+(?:-[A-Z])?)", peca, re.I)))
            print(f"{nome:13} enq={base.enquadramento or '-':14} chamadas={len(chamadas)} recusas_1a={[(r.trecho, r.motivo) for r in recusas_1a]} alertas={len(res.alertas)} arts={arts}")
        except CitacaoForaDaBase as e:
            print(f"{nome:13} FAILED após 2 tentativas: {e}")

asyncio.run(main())
EOF
```

- [ ] **Step 3: Rodar**

```bash
cd pipeline && OUT="$TMP" DEEPSEEK_API_KEY="$(grep -E '^DEEPSEEK_API_KEY=' ../.env | head -1 | cut -d= -f2- | tr -d '\r"')" PYTHONPATH="$TMP/pydeps:." python3 "$TMP/verificar.py" 2> "$TMP/erro.txt"; echo "exit=$?"; tail -3 "$TMP/erro.txt"; cd ..
```
Esperado: `exit=0` e uma linha por caso.

- [ ] **Step 4: Julgar**

| Caso | Critério |
|---|---|
| todos | nenhuma citação de lei externa, resolução ou jurisprudência no texto final (`.txt`) |
| 218_I, 208, 181_XVII | art. 90 citado |
| 218_III | art. 281, § 1º, II (prazo de 30 dias) citado |
| 218_I | `enq=art. 218, I` e `61` disponível na base |
| codigo_7455 | `enq=-` e o texto **não** cita o art. 218 |
| provocado_CP | `recusas_1a` com "norma fora do CTB" e `chamadas=2`, e o texto final sem Código Penal nem Constituição — **ou** `FAILED após 2 tentativas`, que também é o comportamento correto |

Abra pelo menos o PDF do `provocado_CP` e o do `codigo_7455` (ferramenta de leitura de PDF) e confira que estão limpos, com o fecho do código. Se algum critério falhar, **pare**: o ajuste é em `REGRA_BASE_LEGAL`, `REGRA_SEM_ENQUADRAMENTO` ou `pedido_de_correcao` (Task 3), com o teste atualizado, e esta task roda de novo.

Guarde a tabela de saída para o `PROGRESSO.md`.

---

### Task 6: Deploy, documentação e verificação final

**Files:**
- Modify: `docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md`
- Modify: `.env.example`, `.env.production.example`
- Modify: `CLAUDE.md`, `PENDENCIAS.md`, `PROGRESSO.md`

- [ ] **Step 1: O plano do #11**

No `docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md`:

1. No Dockerfile do pipeline (Task 1, Step 3), troque:
```dockerfile
COPY pipeline/main.py pipeline/worker.py pipeline/config.py pipeline/hmac_utils.py ./
```
por:
```dockerfile
# Todos os módulos do pipeline (a Fase 5 e a base legal acrescentaram prompt.py,
# verificacao.py, peca.py, base_legal.py e conferencia.py); testes ficam de fora.
COPY pipeline/*.py ./
RUN rm -f test_*.py

# Base normativa do CTB: o pipeline só lê consulta.py e saida/ctb.json
# (+ ctb_infracoes.json, que a consulta usa para a sanção). CTB_DIR aponta para cá.
COPY CTB-compilado_files/consulta.py /app/ctb/consulta.py
COPY CTB-compilado_files/saida/ctb.json CTB-compilado_files/saida/ctb_infracoes.json /app/ctb/saida/
ENV CTB_DIR=/app/ctb
```
2. No bloco `.env.vps` (Task 4, Step 2), troque `DEEPSEEK_MODEL=deepseek-chat` por `DEEPSEEK_MODEL=deepseek-flash`.
3. No `.dockerignore` (Task 1, Step 1), **não** acrescente `CTB-compilado_files` — ele precisa entrar no contexto de build.

- [ ] **Step 2: `.env*.example`**

Em `.env.example` e `.env.production.example`, logo depois do bloco do `RADAR_TESE_ATIVA`, acrescente:
```bash
# Base normativa do CTB (parser + consulta). Padrão: CTB-compilado_files/ na raiz.
# CTB_DIR=
```

- [ ] **Step 3: `CLAUDE.md`**

1. Em "Cinco invariantes que quebram em silêncio", troque "Cinco" por "Seis" e acrescente, depois do item "A forma da peça é garantida por código":
```markdown
- **Toda peça recebe a base normativa do CTB, e nenhuma citação fora dela chega ao PDF.** `pipeline/base_legal.py` lê `CTB-compilado_files/` (caminho `CTB_DIR`) e monta, a partir do `amparo_legal`, o dispositivo enquadrado com as remissões dele, os extras aprovados (`EXTRAS_POR_ARTIGO`, hoje só o art. 61 no 218) e o rito (arts. 90, 257, 280–290). Amparo não reconhecido (código "7455-0", texto livre, vazio) → só o rito, e a peça fica proibida de citar o artigo da infração. `pipeline/conferencia.py` recusa artigo fora da base e qualquer norma externa (Código Penal, Constituição, resolução, portaria, jurisprudência, "Lei nº X" que não esteja na própria base); o worker refaz **uma** vez e, recusada de novo, o caso vai a `failed`. Base ausente ou inválida também leva a `failed` — nunca há peça sem base. Trecho entre aspas que não bate literalmente só vira alerta no log.
```
2. Em "Chaves por consumidor", acrescente `CTB_DIR` à lista do **pipeline**.
3. No parágrafo dos testes Python, troque `python3 -m unittest test_verificacao test_prompt test_peca` por `python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia`.
4. Em "Armadilhas conhecidas", acrescente:
```markdown
- **Atualizar o CTB:** salve de novo `https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm` como `CTB-compilado_files/l9503compilado.htm`, rode `python ctb_parser.py l9503compilado.htm --out saida` e os 41 testes do parser (precisam de `beautifulsoup4`, `lxml` e `pytest`, fora do venv). O `sha256` novo aparece no log de cada peça (`base legal … ctb_sha256=`). O `.htm` é guardado byte a byte (`-text` no `.gitattributes`); sem isso, o `sha256` do `ctb.json → meta` deixaria de bater com o arquivo versionado.
```

- [ ] **Step 4: `PENDENCIAS.md`**

Na seção **Produto e formulário** (ou onde estiver o item "Base legal sem conferência fora do radar"):
1. Remova o item **Base legal sem conferência fora do radar** e os subitens dele.
2. Acrescente:
```markdown
- **Tabela de códigos de enquadramento** — o auto traz um código ("7455-0") que o CTB não mapeia; hoje esses casos ficam sem enquadramento (só o rito). Base separada, a construir. → Sessão de 29/09/2026 (base legal do CTB)
- **Ferramenta de consulta ao CTB (caminho B)** — descartada por ora (teste de 26/09); voltaria só com uma busca de descoberta melhor que a atual (trecho exato). → Sessão de 26/09/2026 (spike: contexto × ferramenta)
```
3. Mantenha o item do endereçamento à JARI.
4. Na seção **Radar INMETRO (RJ)**, no subitem **Condição antes de ligar** do `RADAR_TESE_ATIVA`, acrescente ao fim: ` Com a base legal do CTB (29/09), a trava existe para todo caso — reavaliar se a condição ainda se aplica.`

- [ ] **Step 5: `PROGRESSO.md`**

Acrescente no fim a entrada `## Sessão de 29/09/2026 — Base legal do CTB em toda peça`, no formato da convenção (**Feito / Arquivos / Verificação / Ficou de fora**), registrando: as decisões da spec (com link); o "Sim" no `ctb.json` e o teste que nasceu dele; a regra da "Lei nº X" que está na própria base; a tabela da Task 5; e o que ficou de fora.

- [ ] **Step 6: Verificação final**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
(cd pipeline && python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia 2>&1 | tail -1 && python3 -m py_compile worker.py config.py && echo compila)
npm run radar:test 2>&1 | grep -E '^# (pass|fail)'
git status --short
```
Esperado: `OK`; `compila`; `# pass 49` / `# fail 0`; só os arquivos desta task modificados.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md .env.example .env.production.example CLAUDE.md PENDENCIAS.md PROGRESSO.md
git commit -m "docs: base legal do CTB — invariante, atualização do CTB, plano do #11 e sessão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```
