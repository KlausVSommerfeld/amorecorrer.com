# Enquadramento por lista — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente escolhe o enquadramento numa lista com busca (por código, artigo ou descrição), gerada da tabela oficial da SENATRAN e conferida contra o CTB; o pipeline passa a traduzir código em dispositivo.

**Architecture:** Um extrator Python (`enquadramentos/enquadramentos_parser.py`) lê o Anexo IV da Portaria SENATRAN 354/2022 (PDF guardado no repositório) e as alterações transcritas, confere cada linha contra o `ctb.json` e gera a tabela completa (`enquadramentos/saida/enquadramentos.json`) e a cópia enxuta do site (`src/data/enquadramentos.json`). O site busca nessa cópia (`src/lib/enquadramentos.ts` + `CampoEnquadramento`) e grava `amparo_legal` canônico e `codigo_enquadramento`; a `form-submit` grava a coluna nova; o pipeline (`pipeline/tabela_enquadramentos.py` + `base_legal.montar_base`) resolve amparo → código → código no texto livre, sempre sob a trava dos arts. 162–255, e põe o código no quadro da peça.

**Tech Stack:** Python 3 (pypdf 5.1.0, pytest fora do venv, unittest no pipeline), React 18 + Vite + Tailwind, Node 22 `node --test`, Deno (Edge), Postgres (migration Supabase).

**Spec:** `docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md`

## Global Constraints

- Fonte: `Portaria3542022AnexoN4.pdf`, sha256 `81bceadbc1e48b84d7e5f21b1e8f1fbe79da14dbdb7b6768dc5ea99b13035946`, de `https://www.gov.br/transportes/pt-br/assuntos/transito/arquivos-senatran/portarias/2022/Portaria3542022AnexoN4.pdf`.
- Alterações transcritas: só a Portaria SENATRAN nº 423/2024 (7790-0, 7803-0, 7811-0, 7820-0); `conferido_em` = `2026-10-15`.
- A lista oferece só dispositivos dos arts. 162–255 (`na_lista: true`). Amparo com outra norma ("c/c … da Lei …") é rejeitado.
- Escolher da lista grava `amparo_legal` = dispositivo canônico ("art. 218, I") e `codigo_enquadramento` = "7455-0"; texto livre grava só o `amparo_legal` (código vazio).
- Quem não achar na lista digita (texto livre). Nada é adivinhado: linha que não confere vai a `rejeitados`.
- A `form-submit` aceita só `^\d{4}-\d$` em `codigo_enquadramento`; o resto vira `null`, sem recusar o envio; fora do `dup_guard`.
- Ordem de resolução no pipeline: `amparo_legal` → `codigo_enquadramento` → código no texto do `amparo_legal`; trava dos arts. 162–255 sempre. Sem a tabela, o pipeline não sobe.
- `codigo_enquadramento` em `CAMPOS_INTERNOS`; o quadro da peça ganha "Código da infração" só quando o código aponta o mesmo dispositivo do enquadramento.
- Python do pipeline: `python3 -m unittest <módulos>` de dentro de `pipeline/`, **nunca `unittest discover`** (manda e-mail real). PDFs: `PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:."`.
- Testes do extrator e do CTB: pytest de `$HOME/.cache/ctb-testdeps`; pypdf de `$HOME/.cache/amorecorrer-pdftext` (instalar com `pip install --target "$HOME/.cache/amorecorrer-pdftext" pypdf==5.1.0` se faltar). Nunca instalar em `pipeline/.venv`.
- `git add` só com caminhos explícitos. Todo commit termina com as duas linhas:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
  ```
- Deploy (`db push`, `functions deploy`, rebuild do contêiner) é do Klaus; push também.
- Design system: `.form-label`, `.form-input`, `.form-hint`, código em `font-mono`, erro por `aria-invalid`; nenhum matiz novo; pares de cor novos conferidos AA nos dois temas.

## Review Focus

1. **Rascunho do formulário com par desencontrado** — o rascunho tem amparo livre ("Art. 230") e o questionário tinha código ("7455-0"): o formulário não pode juntar os dois (o quadro da peça sairia com o código errado). Teste: Task 7, `mesclarComRascunho` com pares.
2. **A lista não carrega** (arquivo à parte falha: rede, deploy novo trocou o hash) — o campo vira texto livre, sem travar ninguém. Teste: Task 8, passo no navegador com a requisição da lista bloqueada.
3. **Código fora da lista no texto livre** ("5002-0", art. 257) — não enquadra (fica só o rito). Teste: Task 4, `test_codigo_fora_da_lista_nao_enquadra`.
4. **Código e amparo apontando dispositivos diferentes** — o amparo prevalece e o código não vai ao quadro. Teste: Task 4, `test_amparo_prevalece_e_codigo_divergente_nao_vai_ao_quadro`.
5. **Código em formato estranho no POST** ("7455-00", 74550 número, espaços) — vira `null`. Teste: Task 9, `codigoEnquadramento`.

---

### Task 1: `parse_ref` lê "§ único"

Hoje `parse_ref("252, § único")` descarta o "§ único" e devolve o caput: amparo "Art. 252, § único" (celular, gravíssima) enquadra no art. 252 caput. A tabela da SENATRAN escreve "§ único".

**Files:**
- Modify: `CTB-compilado_files/consulta.py:140`
- Test: `CTB-compilado_files/tests/test_consulta.py:19-39`, `pipeline/test_base_legal.py`

**Interfaces:**
- Produces: `parse_ref("252, § único") == Ref("252", paragrafo="unico")` — consumido pelo extrator (Task 3) e pelo pipeline.

- [ ] **Step 1: Write the failing tests**

Em `CTB-compilado_files/tests/test_consulta.py`, na lista do `@pytest.mark.parametrize` de `test_parse_ref`, logo depois de `("art. 2º, parágrafo único", Ref("2", paragrafo="unico")),`:

```python
        # Como a tabela da SENATRAN escreve (15/10/2026): o "§ único" era descartado.
        ("252, § único", Ref("252", paragrafo="unico")),
        ("165-B, §único", Ref("165-B", paragrafo="unico")),
```

Em `pipeline/test_base_legal.py`, na classe `TestMontarBase`, antes de `test_numero_vigente_normaliza`:

```python
    # "§ único" caía no caput (15/10/2026): o celular do art. 252 virava o caput.
    def test_paragrafo_unico_com_sinal(self):
        b = montar_base(self.c, "Art. 252, § único")
        self.assertEqual(b.enquadramento, "art. 252, parágrafo único")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd CTB-compilado_files && PYTHONPATH="$HOME/.cache/ctb-testdeps" python3 -m pytest -q tests/test_consulta.py 2>&1 | tail -3
cd ../pipeline && python3 -m unittest test_base_legal -k paragrafo_unico_com_sinal 2>&1 | tail -3
```
Expected: pytest `2 failed, 25 passed`; unittest `FAILED (failures=1)` com `'art. 252' != 'art. 252, parágrafo único'`.

- [ ] **Step 3: Implement**

Em `CTB-compilado_files/consulta.py`, linha 140, trocar:

```python
    if pm := re.search(r"par[áa]grafo\s+[úu]nico|p\.\s*[úu]nico", resto, re.I):
```
por:
```python
    if pm := re.search(r"par[áa]grafo\s+[úu]nico|p\.\s*[úu]nico|§\s*[úu]nico", resto, re.I):
```

E acrescentar `'252, § único'` à docstring de `parse_ref` (linha 132), na lista do "Aceita:".

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd CTB-compilado_files && PYTHONPATH="$HOME/.cache/ctb-testdeps" python3 -m pytest -q tests/ 2>&1 | tail -2
cd ../pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_verificacao test_diagnostico_paridade test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca test_tentativas 2>&1 | tail -3
```
Expected: pytest todos passando (os 41 do parser + consulta, mais os 2 novos); unittest `Ran 249 tests … OK`.

- [ ] **Step 5: Commit**

```bash
git add CTB-compilado_files/consulta.py CTB-compilado_files/tests/test_consulta.py pipeline/test_base_legal.py
git commit -q -F - <<'EOF'
fix(ctb): parse_ref lê "§ único"

"Art. 252, § único" (celular, gravíssima) caía no caput do art. 252. A
tabela de enquadramentos da SENATRAN escreve assim.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 2: Leitura de código e carga da tabela no pipeline

**Files:**
- Create: `pipeline/tabela_enquadramentos.py`
- Create: `tests/compartilhados/codigos.json`
- Test: `pipeline/test_tabela_enquadramentos.py`

**Interfaces:**
- Produces:
  - `ler_codigo(texto: str | None) -> str | None` — "7455-0", "745-50", "74550", "Código 7455 - 0" → `"7455-0"`.
  - `class TabelaIndisponivel(RuntimeError)`.
  - `@dataclass(frozen=True) class Tabela: por_codigo: dict[str, dict]; ctb_sha256: str; def dispositivo(self, codigo: str | None) -> str | None` (só itens `na_lista`).
  - `carregar_tabela(caminho: str) -> Tabela` (com `lru_cache`).
  - `tests/compartilhados/codigos.json`: `[{"texto": str, "codigo": str | null}]`, também lido pela Task 6.

- [ ] **Step 1: Write the shared cases file**

`tests/compartilhados/codigos.json`:

```json
[
  {"texto": "7455-0", "codigo": "7455-0"},
  {"texto": "745-50", "codigo": "7455-0"},
  {"texto": "74550", "codigo": "7455-0"},
  {"texto": "Código 7455 - 0", "codigo": "7455-0"},
  {"texto": "Infração 745-50 art. 218, I", "codigo": "7455-0"},
  {"texto": "5169-1", "codigo": "5169-1"},
  {"texto": "2026-10-15", "codigo": null},
  {"texto": "123456", "codigo": null},
  {"texto": "218, I", "codigo": null},
  {"texto": "Art. 218, inciso II, do CTB", "codigo": null},
  {"texto": "745-5", "codigo": null},
  {"texto": "", "codigo": null}
]
```

- [ ] **Step 2: Write the failing tests**

`pipeline/test_tabela_enquadramentos.py`:

```python
"""Testes de tabela_enquadramentos.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_tabela_enquadramentos -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import json
import tempfile
import unittest
from pathlib import Path

from tabela_enquadramentos import TabelaIndisponivel, carregar_tabela, ler_codigo

RAIZ = Path(__file__).resolve().parent.parent
CASOS = json.loads((RAIZ / "tests" / "compartilhados" / "codigos.json").read_text(encoding="utf-8"))


class TestLerCodigo(unittest.TestCase):
    def test_paridade_com_o_site(self):
        for caso in CASOS:
            with self.subTest(texto=caso["texto"]):
                self.assertEqual(ler_codigo(caso["texto"]), caso["codigo"])

    def test_none(self):
        self.assertIsNone(ler_codigo(None))


def _tabela_em(pasta: Path, dados) -> str:
    arquivo = pasta / "enquadramentos.json"
    arquivo.write_text(dados if isinstance(dados, str) else json.dumps(dados), encoding="utf-8")
    return str(arquivo)


MINIMA = {
    "meta": {"ctb_sha256": "abc"},
    "enquadramentos": [
        {"codigo": "7455-0", "dispositivo": "art. 218, I", "na_lista": True},
        {"codigo": "5002-0", "dispositivo": "art. 257, § 8º", "na_lista": False},
    ],
}


class TestCarregarTabela(unittest.TestCase):
    def test_dispositivo_so_dos_codigos_da_lista(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = carregar_tabela(_tabela_em(Path(tmp), MINIMA))
        self.assertEqual(t.ctb_sha256, "abc")
        self.assertEqual(t.dispositivo("7455-0"), "art. 218, I")
        self.assertIsNone(t.dispositivo("5002-0"))
        self.assertIsNone(t.dispositivo("9999-9"))
        self.assertIsNone(t.dispositivo(None))

    def test_arquivo_ausente(self):
        with self.assertRaises(TabelaIndisponivel):
            carregar_tabela("/nao/existe/enquadramentos.json")

    def test_json_invalido_e_falha_nao_fica_em_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            caminho = _tabela_em(Path(tmp), "Sim" + json.dumps(MINIMA))
            with self.assertRaises(TabelaIndisponivel):
                carregar_tabela(caminho)
            _tabela_em(Path(tmp), MINIMA)
            self.assertEqual(carregar_tabela(caminho).ctb_sha256, "abc")

    def test_forma_errada(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(TabelaIndisponivel):
                carregar_tabela(_tabela_em(Path(tmp), {"meta": {}}))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd pipeline && python3 -m unittest test_tabela_enquadramentos 2>&1 | tail -3`
Expected: `ModuleNotFoundError: No module named 'tabela_enquadramentos'`.

- [ ] **Step 4: Implement**

`pipeline/tabela_enquadramentos.py`:

```python
"""Tabela de códigos de enquadramento (Anexo IV da Portaria SENATRAN 354/2022),
gerada por enquadramentos/enquadramentos_parser.py (spec 2026-10-15).

Traduz o código impresso na notificação ("7455-0", "745-50", "74550") no
dispositivo do CTB. A leitura do código é a mesma de src/lib/enquadramentos.ts,
garantida por tests/compartilhados/codigos.json.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

# Ordem importa: "7455-0" antes de "745-50", e os dois antes dos cinco dígitos
# colados. As bordas (?<!\d)/(?!\d) impedem ler código dentro de data ou número
# maior ("2026-10-15", "123456").
_CODIGO = (
    re.compile(r"(?<!\d)(\d{4})\s?-\s?(\d)(?!\d)"),
    re.compile(r"(?<!\d)(\d{3})\s?-\s?(\d)(\d)(?!\d)"),
    re.compile(r"(?<!\d)(\d{4})(\d)(?!\d)"),
)


def ler_codigo(texto: str | None) -> str | None:
    """O primeiro código de enquadramento no texto, como "7455-0", ou None."""
    if not texto:
        return None
    for padrao in _CODIGO:
        m = padrao.search(str(texto))
        if m:
            g = m.groups()
            return f"{g[0]}{g[1]}-{g[2]}" if len(g) == 3 else f"{g[0]}-{g[1]}"
    return None


class TabelaIndisponivel(RuntimeError):
    """Sem a tabela, o pipeline não sobe (spec 2026-10-15, §6.1)."""


@dataclass(frozen=True)
class Tabela:
    por_codigo: dict[str, dict[str, Any]]
    ctb_sha256: str

    def dispositivo(self, codigo: str | None) -> str | None:
        """Dispositivo do CTB do código — só dos códigos que a lista oferece."""
        item = self.por_codigo.get(codigo or "")
        return item["dispositivo"] if item and item.get("na_lista") else None


@lru_cache(maxsize=4)
def carregar_tabela(caminho: str) -> Tabela:
    """Uma vez por processo. Exceção não entra no cache do lru_cache."""
    arquivo = Path(caminho)
    try:
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        itens = dados["enquadramentos"]
        ctb_sha256 = dados["meta"]["ctb_sha256"]
        por_codigo = {i["codigo"]: i for i in itens}
    except (OSError, ValueError, KeyError, TypeError) as e:
        raise TabelaIndisponivel(f"tabela de enquadramentos ausente ou inválida em {arquivo}: {e}") from e
    return Tabela(por_codigo=por_codigo, ctb_sha256=ctb_sha256)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd pipeline && python3 -m unittest test_tabela_enquadramentos -v 2>&1 | tail -3`
Expected: `Ran 6 tests … OK`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/tabela_enquadramentos.py pipeline/test_tabela_enquadramentos.py tests/compartilhados/codigos.json
git commit -q -F - <<'EOF'
feat(pipeline): leitura de código de enquadramento e carga da tabela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 3: O extrator da tabela da SENATRAN

**Files:**
- Create: `enquadramentos/Portaria3542022AnexoN4.pdf` (baixado, byte a byte; `*.pdf` já é `binary` no `.gitattributes`)
- Create: `enquadramentos/alteracoes.json`
- Create: `enquadramentos/enquadramentos_parser.py`
- Create: `enquadramentos/test_enquadramentos_parser.py`
- Create: `enquadramentos/README.md`
- Create (gerados): `enquadramentos/saida/enquadramentos.json`, `src/data/enquadramentos.json`
- Modify: `pipeline/base_legal.py` (`_tipifica_infracao` → `tipifica_infracao`, pública)
- Modify: `pipeline/test_tabela_enquadramentos.py` (testes contra a tabela real)

**Interfaces:**
- Consumes: `parse_ref` com "§ único" (Task 1); de `base_legal`: `Ctb`, `carregar_ctb`, `natureza`, `tipifica_infracao(numero: str) -> bool`.
- Produces: `enquadramentos/saida/enquadramentos.json` no formato da spec §3.4 (442 códigos, 427 na lista, 1 rejeitado: 6068-5); `src/data/enquadramentos.json`: lista de `{codigo, descricao, dispositivo, gravidade}` (427 itens); `projecao_do_site(tabela) -> list[dict]`.

- [ ] **Step 1: Baixar a fonte e conferir o sha256**

```bash
mkdir -p enquadramentos
curl -sSL -A "Mozilla/5.0" -o enquadramentos/Portaria3542022AnexoN4.pdf \
  "https://www.gov.br/transportes/pt-br/assuntos/transito/arquivos-senatran/portarias/2022/Portaria3542022AnexoN4.pdf"
sha256sum enquadramentos/Portaria3542022AnexoN4.pdf
python3 -c "import sys; sys.path.insert(0, '$HOME/.cache/amorecorrer-pdftext'); import pypdf; print(pypdf.__version__)" \
  || pip install --target "$HOME/.cache/amorecorrer-pdftext" pypdf==5.1.0
```
Expected: `81bceadbc1e48b84d7e5f21b1e8f1fbe79da14dbdb7b6768dc5ea99b13035946`; pypdf `5.1.0`. Outro sha → parar e avisar (a SENATRAN republicou o arquivo; os números deste plano não valem).

- [ ] **Step 2: Transcrever a Portaria 423/2024**

`enquadramentos/alteracoes.json`:

```json
{
 "conferido_em": "2026-10-15",
 "codigos": [
  {"codigo": "7790-0", "descricao": "Dirigir veículo sem realizar o exame toxicológico previsto no art. 148-A do CTB", "amparo": "165-B", "infrator": "Condutor", "gravidade": "gravíssima", "origem": "Portaria SENATRAN 423/2024"},
  {"codigo": "7803-0", "descricao": "Dirigir veículo sem realizar o exame toxicológico previsto § 2º do art. 148-A do CTB", "amparo": "165-B, § único", "infrator": "Condutor", "gravidade": "gravíssima", "origem": "Portaria SENATRAN 423/2024"},
  {"codigo": "7811-0", "descricao": "Dirigir veículo tendo obtido resultado positivo no exame toxicológico previsto no caput do art. 148-A do CTB", "amparo": "165-C", "infrator": "Condutor", "gravidade": "gravíssima", "origem": "Portaria SENATRAN 423/2024"},
  {"codigo": "7820-0", "descricao": "Deixar de realizar o exame toxicológico previsto no § 2º do art. 148-A do CTB, após trinta dias do vencimento do prazo estabelecido", "amparo": "165-D", "infrator": "Condutor", "gravidade": "gravíssima", "origem": "Portaria SENATRAN 423/2024"}
 ]
}
```

(Texto do anexo da Portaria 423/2024, DOU de 30/04/2024, p. 474, com os espaços que o PDF colou.)

- [ ] **Step 3: Tornar `tipifica_infracao` pública**

Em `pipeline/base_legal.py`, renomear `_tipifica_infracao` para `tipifica_infracao` (definição e a chamada em `_enquadramento`):

```bash
sed -i 's/_tipifica_infracao/tipifica_infracao/g' pipeline/base_legal.py
grep -n "tipifica_infracao" pipeline/base_legal.py
```
Expected: duas linhas (a chamada em `_enquadramento` e o `def tipifica_infracao`).

- [ ] **Step 4: Write the failing tests**

`enquadramentos/test_enquadramentos_parser.py`:

```python
"""Testes do extrator contra o PDF real. Rodar de dentro de enquadramentos/:

    PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import enquadramentos_parser as ep  # noqa: E402


@pytest.fixture(scope="module")
def ctb():
    return ep.carregar_ctb(str(ep.CTB_DIR))


@pytest.fixture(scope="module")
def texto():
    return ep.texto_do_anexo(ep.FONTE)


@pytest.fixture(scope="module")
def alteracoes():
    return json.loads(ep.ALTERACOES.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def tabela(ctb, texto, alteracoes):
    return ep.gerar(ctb, texto, alteracoes, hashlib.sha256(ep.FONTE.read_bytes()).hexdigest())


def por_codigo(tabela):
    return {i["codigo"]: i for i in tabela["enquadramentos"]}


def test_fonte_e_a_conferida():
    assert hashlib.sha256(ep.FONTE.read_bytes()).hexdigest() == (
        "81bceadbc1e48b84d7e5f21b1e8f1fbe79da14dbdb7b6768dc5ea99b13035946"
    )


def test_le_todas_as_linhas_do_anexo(texto):
    assert len(ep.linhas(texto)) == 439


def test_so_o_6068_5_e_rejeitado(tabela):
    # Nenhuma "linha ilegível": toda linha do PDF virou código ou rejeição com motivo.
    assert [(r["codigo"], r["motivo"]) for r in tabela["rejeitados"]] == [
        ("6068-5", "amparo com outra norma")
    ]


def test_totais(tabela):
    assert tabela["meta"]["total"] == 442
    assert tabela["meta"]["na_lista"] == 427


@pytest.mark.parametrize(
    "codigo,dispositivo,gravidade,na_lista",
    [
        ("7455-0", "art. 218, I", "média", True),
        ("7463-0", "art. 218, II", "grave", True),
        ("7471-0", "art. 218, III", "gravíssima", True),
        ("7633-1", "art. 252, parágrafo único", "gravíssima", True),  # "§ único"
        ("5070-1", "art. 163", "gravíssima", True),  # 163 c/c 162, II
        ("7056-2", "art. 244, III", "média", True),  # c/c § 1º, de ciclos
        ("7609-0", "art. 253-A, § 1º", "gravíssima", True),  # "1º" repetido no PDF
        ("7382-0", "art. 254, I", "leve", True),  # pedestre, "3 - Leve 50%"
        ("6785-1", 'art. 231, II, "a"', "gravíssima", True),  # alínea
        ("7803-0", "art. 165-B, parágrafo único", "gravíssima", True),  # Portaria 423/2024
        ("5002-0", "art. 257, § 8º", None, False),
        ("7480-1", "art. 93", None, False),
    ],
)
def test_linhas_conhecidas(tabela, codigo, dispositivo, gravidade, na_lista):
    item = por_codigo(tabela)[codigo]
    assert (item["dispositivo"], item["gravidade"], item["na_lista"]) == (dispositivo, gravidade, na_lista)


def test_descricao_sem_as_quebras_do_pdf(tabela):
    t = por_codigo(tabela)
    assert t["7455-0"]["descricao"] == "Transitar em velocidade superior à máxima permitida em até 20%"
    assert t["5169-2"]["descricao"] == (
        "Dirigir sob a influência de qquer substância psicoativa que deter. dependência"
    )


def test_desdobramentos(tabela):
    assert {"5100-1", "5100-2", "5100-3", "5100-4"} <= set(por_codigo(tabela))


def test_lista_so_nos_artigos_de_infracao(tabela):
    for item in tabela["enquadramentos"]:
        if item["na_lista"]:
            numero = int(re.match(r"art\. (\d+)", item["dispositivo"]).group(1))
            assert 162 <= numero <= 255, item["codigo"]
            assert item["gravidade"] in {"leve", "média", "grave", "gravíssima"}, item["codigo"]


def test_amparo_desconhecido_reprova(ctb):
    r = ep.conferir(ctb, "0000-0", "x", "999", "Condutor", None, "teste")
    assert r["motivo"] == "amparo não reconhecido no CTB"


def test_gravidade_divergente_reprova(ctb):
    r = ep.conferir(ctb, "0000-0", "x", "218, I", "Condutor", "leve", "teste")
    assert r["motivo"] == "gravidade leve na tabela, média no CTB"


def test_arquivos_gerados_estao_em_dia(tabela):
    assert json.loads(ep.SAIDA.read_text(encoding="utf-8")) == tabela
    assert json.loads(ep.SAIDA_SITE.read_text(encoding="utf-8")) == ep.projecao_do_site(tabela)
```

Em `pipeline/test_tabela_enquadramentos.py`, acrescentar antes do `if __name__`:

```python
TABELA = RAIZ / "enquadramentos" / "saida" / "enquadramentos.json"
SITE = RAIZ / "src" / "data" / "enquadramentos.json"
CTB_JSON = RAIZ / "CTB-compilado_files" / "saida" / "ctb.json"


class TestTabelaReal(unittest.TestCase):
    """A tabela versionada, a cópia do site e o CTB andam juntos (spec §7)."""

    def setUp(self):
        self.dados = json.loads(TABELA.read_text(encoding="utf-8"))

    def test_conferida_contra_este_ctb(self):
        ctb = json.loads(CTB_JSON.read_text(encoding="utf-8"))
        self.assertEqual(self.dados["meta"]["ctb_sha256"], ctb["meta"]["sha256"],
                         "CTB atualizado: rode enquadramentos/enquadramentos_parser.py de novo")

    def test_site_e_a_projecao_da_tabela(self):
        esperado = [
            {k: i[k] for k in ("codigo", "descricao", "dispositivo", "gravidade")}
            for i in self.dados["enquadramentos"] if i["na_lista"]
        ]
        self.assertEqual(json.loads(SITE.read_text(encoding="utf-8")), esperado)

    def test_carrega_a_tabela_real(self):
        t = carregar_tabela(str(TABELA))
        self.assertEqual(t.dispositivo("7455-0"), "art. 218, I")
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd enquadramentos && PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q 2>&1 | tail -3
```
Expected: erro de coleta `ModuleNotFoundError: No module named 'enquadramentos_parser'`.

- [ ] **Step 6: Implement the extractor**

`enquadramentos/enquadramentos_parser.py`:

```python
"""Extrai a Tabela de Códigos de Enquadramentos das Infrações (Anexo IV da
Portaria SENATRAN 354/2022, "Anexos Retificados") e confere cada linha contra o
CTB. Spec: docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md.

Rodar de dentro de enquadramentos/, com pypdf fora do venv:

    pip install --target "$HOME/.cache/amorecorrer-pdftext" pypdf==5.1.0
    PYTHONPATH="$HOME/.cache/amorecorrer-pdftext" python3 enquadramentos_parser.py

Gera saida/enquadramentos.json (tabela completa) e ../src/data/enquadramentos.json
(só o que a lista do site oferece). Nada é adivinhado: linha que não confere vai
para `rejeitados`, com o motivo.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "pipeline"))

from base_legal import Ctb, carregar_ctb, natureza, tipifica_infracao  # noqa: E402

FONTE = AQUI / "Portaria3542022AnexoN4.pdf"
ALTERACOES = AQUI / "alteracoes.json"
SAIDA = AQUI / "saida" / "enquadramentos.json"
SAIDA_SITE = RAIZ / "src" / "data" / "enquadramentos.json"
CTB_DIR = RAIZ / "CTB-compilado_files"
ORIGEM_ANEXO = "Portaria SENATRAN 354/2022, Anexo IV (retificado)"

# Defeitos de extração conhecidos, um por código, conferidos contra o PDF.
CORRECOES = {
    # A quebra de linha repete o "1º" do parágrafo: "253-A, § \n1º 1º".
    "7609-0": ("253-A, § 1º 1º", "253-A, § 1º"),
}

_ART = r"\d{2,3}(?:-[A-Z])?(?=[\s,]|$)"
_PARTE = r',\s?(?:§\s?(?:\d+º|único)|[IVXLC]+\b|"?[a-z]"?(?=[\s,]|$))'
_REF = _ART + "(?:" + _PARTE + ")*"
_CC = r"\s?c/c\s?(?:§\s?\d+º|" + _REF + r")(?:\s?da Lei [\d./]+)?"
_LINHA = re.compile(
    r"^(?P<desc>.*?)\s+"
    r"(?P<amparo>" + _REF + "(?:" + _CC + r")?)\s+"
    r"(?P<infrator>Condutor|Proprietário|PF ou PJ|Serv público|Emb/Transp|P Jurídica|Pedestre|PF|PJ)\s+"
    r"(?P<gravidade>(?:\d+|SDD)\s?[-–]\s?(?P<natureza>Leve|Média|Grave|Gravíss)(?:\s\d+[xX])?(?:\s\d+%)?|---)\s+"
    r"(?:MUNICIPAL/RODOV|ESTADUAL/RODOV|ESTAD/MUNIC/RODOV|ESTADUAL|RODOVIÁRIO)\b"
)
_COMECO = re.compile(r"(?m)^(\d{4}) (\d)(?= |$)")
_NATUREZAS = {"Leve": "leve", "Média": "média", "Grave": "grave", "Gravíss": "gravíssima"}
_PALAVRAS = frozenset(_NATUREZAS.values())


def texto_do_anexo(pdf: Path) -> str:
    """O texto do Anexo IV: do título "ANEXO IV" ao "ANEXO V", sem as quebras de página."""
    from pypdf import PdfReader

    texto = "\n".join(p.extract_text() or "" for p in PdfReader(str(pdf)).pages)
    inicio = re.search(r"(?m)^\s*ANEXO IV\s*$", texto)
    fim = re.search(r"(?m)^\s*ANEXO V\s*$", texto)
    if not inicio or not fim:
        raise ValueError("títulos ANEXO IV / ANEXO V não encontrados no PDF")
    return texto[inicio.end():fim.start()]


def linhas(texto: str) -> list[tuple[str, str]]:
    """[(código, corpo da linha com as quebras desfeitas)]."""
    partes = _COMECO.split(texto)[1:]
    saida = []
    for i in range(0, len(partes), 3):
        codigo = f"{partes[i]}-{partes[i + 1]}"
        corpo = re.sub(r"\s+", " ", partes[i + 2]).strip()
        if codigo in CORRECOES:
            corpo = corpo.replace(*CORRECOES[codigo])
        saida.append((codigo, corpo))
    return saida


def _dispositivo(c: Ctb, ref: str) -> tuple[dict, dict]:
    return c.ctb.dispositivo(c.consulta.parse_ref("art. " + ref))


def _natureza_do_ctb(c: Ctb, citacao: str) -> str | None:
    nat = natureza(c, citacao)
    return nat[0] if nat and nat[0] in _PALAVRAS else None


def conferir(c: Ctb, codigo: str, descricao: str, amparo: str, infrator: str,
             gravidade: str | None, origem: str) -> dict[str, Any]:
    """A linha conferida, ou {"codigo", "amparo", "motivo"} quando não confere."""
    rejeitar = lambda motivo: {"codigo": codigo, "amparo": amparo, "motivo": motivo}  # noqa: E731
    if re.search(r"\bLei\b", amparo):
        return rejeitar("amparo com outra norma")
    principal, *resto = re.split(r"\s?c/c\s?", amparo)
    try:
        artigo, disp = _dispositivo(c, principal)
    except (c.consulta.ReferenciaInvalida, KeyError, ValueError):
        return rejeitar("amparo não reconhecido no CTB")
    if disp.get("status") != "vigente" or artigo.get("status") != "vigente":
        return rejeitar("dispositivo não vigente")
    # "c/c" aponta o dispositivo mais específico ("244, III c/c § 1º", de ciclos;
    # "163 c/c 162, II", cuja sanção é "as mesmas do artigo anterior"): a
    # gravidade se confere contra ele quando ele tem uma.
    nat_ctb = None
    if resto:
        alvo = resto[0]
        if alvo.startswith("§"):
            alvo = f"{principal.split(',')[0]}, {alvo}"
        try:
            nat_ctb = _natureza_do_ctb(c, _dispositivo(c, alvo)[1]["citacao"])
        except (c.consulta.ReferenciaInvalida, KeyError, ValueError):
            return rejeitar("amparo não reconhecido no CTB")
    nat_ctb = nat_ctb or _natureza_do_ctb(c, disp["citacao"])
    if gravidade and nat_ctb and gravidade != nat_ctb:
        return rejeitar(f"gravidade {gravidade} na tabela, {nat_ctb} no CTB")
    return {
        "codigo": codigo,
        "descricao": descricao,
        "amparo": amparo,
        "dispositivo": disp["citacao"],
        "infrator": infrator,
        "gravidade": gravidade or nat_ctb,
        "origem": origem,
        "na_lista": tipifica_infracao(artigo["numero"]),
    }


def ler_linha(codigo: str, corpo: str) -> dict[str, str] | None:
    m = _LINHA.match(corpo)
    if not m:
        return None
    # "§1º" colado ("244, VIII c/c §1º") fica igual aos outros amparos.
    amparo = re.sub(r"§(?=\d)", "§ ", m.group("amparo"))
    return {
        "codigo": codigo,
        "descricao": m.group("desc").strip(),
        "amparo": amparo,
        "infrator": m.group("infrator"),
        "gravidade": _NATUREZAS.get(m.group("natureza") or ""),
    }


def gerar(c: Ctb, texto: str, alteracoes: dict[str, Any], fonte_sha256: str) -> dict[str, Any]:
    enquadramentos: list[dict[str, Any]] = []
    rejeitados: list[dict[str, Any]] = []
    for codigo, corpo in linhas(texto):
        lida = ler_linha(codigo, corpo)
        if lida is None:
            rejeitados.append({"codigo": codigo, "amparo": None, "motivo": "linha ilegível", "texto": corpo})
            continue
        item = conferir(c, origem=ORIGEM_ANEXO, **lida)
        (rejeitados if "motivo" in item else enquadramentos).append(item)
    for alt in alteracoes["codigos"]:
        item = conferir(c, alt["codigo"], alt["descricao"], alt["amparo"], alt["infrator"],
                        alt["gravidade"], alt["origem"])
        (rejeitados if "motivo" in item else enquadramentos).append(item)
    vistos = [i["codigo"] for i in enquadramentos]
    repetidos = sorted({x for x in vistos if vistos.count(x) > 1})
    if repetidos:
        raise ValueError(f"códigos repetidos: {repetidos}")
    enquadramentos.sort(key=lambda i: i["codigo"])
    return {
        "meta": {
            "fonte": FONTE.name,
            "fonte_sha256": fonte_sha256,
            "alteracoes_conferidas_em": alteracoes["conferido_em"],
            "ctb_sha256": c.ctb.meta["sha256"],
            "total": len(enquadramentos),
            "na_lista": sum(1 for i in enquadramentos if i["na_lista"]),
        },
        "enquadramentos": enquadramentos,
        "rejeitados": rejeitados,
    }


def projecao_do_site(tabela: dict[str, Any]) -> list[dict[str, str]]:
    """O que o site carrega: só a lista, só os quatro campos que ela mostra."""
    return [
        {k: i[k] for k in ("codigo", "descricao", "dispositivo", "gravidade")}
        for i in tabela["enquadramentos"]
        if i["na_lista"]
    ]


def main() -> None:
    c = carregar_ctb(str(CTB_DIR))
    alteracoes = json.loads(ALTERACOES.read_text(encoding="utf-8"))
    sha = hashlib.sha256(FONTE.read_bytes()).hexdigest()
    tabela = gerar(c, texto_do_anexo(FONTE), alteracoes, sha)
    SAIDA.parent.mkdir(exist_ok=True)
    SAIDA.write_text(json.dumps(tabela, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    SAIDA_SITE.parent.mkdir(exist_ok=True)
    SAIDA_SITE.write_text(json.dumps(projecao_do_site(tabela), ensure_ascii=False) + "\n", encoding="utf-8")
    m = tabela["meta"]
    print(f"{m['total']} códigos ({m['na_lista']} na lista), {len(tabela['rejeitados'])} rejeitados")
    for r in tabela["rejeitados"]:
        print(f"  rejeitado {r['codigo']} ({r['amparo']}): {r['motivo']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Gerar a tabela**

```bash
cd enquadramentos && PYTHONPATH="$HOME/.cache/amorecorrer-pdftext" python3 enquadramentos_parser.py
```
Expected:
```
442 códigos (427 na lista), 1 rejeitados
  rejeitado 6068-5 (209 c/c 17, § 5º da Lei 13.103/2015): amparo com outra norma
```
E `src/data/enquadramentos.json` com cerca de 69 KB (`ls -la ../src/data/`).

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd enquadramentos && PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q 2>&1 | tail -2
cd ../pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_verificacao test_diagnostico_paridade test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca test_tentativas test_tabela_enquadramentos 2>&1 | tail -3
```
Expected: pytest `22 passed`; unittest `Ran 258 tests … OK` (249 + 6 da Task 2 + 3 de `TestTabelaReal`).

- [ ] **Step 9: README da pasta**

`enquadramentos/README.md`:

```markdown
# enquadramentos/

Tabela de Códigos de Enquadramentos das Infrações — Anexo IV da Portaria SENATRAN
nº 354/2022 — conferida contra o CTB. Spec:
`docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md`.

| Arquivo | Papel |
|---|---|
| `Portaria3542022AnexoN4.pdf` | a fonte ("Anexos Retificados", site da SENATRAN), byte a byte |
| `alteracoes.json` | códigos de portarias posteriores ao anexo e a data da última busca por alterações |
| `enquadramentos_parser.py` | o extrator |
| `saida/enquadramentos.json` | a tabela completa, gerada (lida pelo pipeline) |
| `../src/data/enquadramentos.json` | a lista do site, gerada |

## Atualizar

1. Procure portarias da SENATRAN que alterem o Anexo IV depois de `conferido_em`
   (em `alteracoes.json`). Para cada uma, acrescente os códigos em `codigos`, com a
   portaria em `origem`. Se a SENATRAN republicar o anexo consolidado, troque o PDF
   e esvazie de `alteracoes.json` o que ele já trouxer.
2. Atualize `conferido_em`.
3. Rode o extrator e os testes:
   ```bash
   PYTHONPATH="$HOME/.cache/amorecorrer-pdftext" python3 enquadramentos_parser.py
   PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q
   ```
   Os totais e as rejeições fixados em `test_enquadramentos_parser.py` mudam junto:
   confira cada rejeição nova antes de atualizar o teste.
4. Depois de atualizar o CTB (`CTB-compilado_files/`), rode o extrator de novo: o
   `test_tabela_enquadramentos` do pipeline reprova tabela conferida contra outro CTB.
```

- [ ] **Step 10: Commit**

```bash
git add enquadramentos/Portaria3542022AnexoN4.pdf enquadramentos/alteracoes.json \
  enquadramentos/enquadramentos_parser.py enquadramentos/test_enquadramentos_parser.py \
  enquadramentos/README.md enquadramentos/saida/enquadramentos.json src/data/enquadramentos.json \
  pipeline/base_legal.py pipeline/test_tabela_enquadramentos.py
git commit -q -F - <<'EOF'
feat(enquadramentos): tabela de códigos da SENATRAN conferida contra o CTB

Anexo IV da Portaria SENATRAN 354/2022 (retificado, já com as portarias
1.230/2022, 1.477/2022 e 4/2023) mais a 423/2024: 442 códigos, 427 na lista
(arts. 162 a 255), 1 rejeitado (6068-5, amparo com outra lei).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 4: O pipeline traduz código e o põe no quadro da peça

**Files:**
- Modify: `pipeline/base_legal.py` (`BaseLegal.codigo`, `montar_base`)
- Modify: `pipeline/peca.py:423-430` (`campos`), `pipeline/peca.py:610-631` (`montar_peca`)
- Modify: `pipeline/prompt.py:156-175` (`CAMPOS_INTERNOS`)
- Modify: `pipeline/config.py` (`enquadramentos_json`)
- Modify: `pipeline/worker.py:23,257-265,309-311`
- Modify: `pipeline/main.py:15-21`
- Modify: `deploy/Dockerfile.pipeline:22-26`
- Test: `pipeline/test_base_legal.py`, `pipeline/test_peca.py`, `pipeline/test_prompt.py`, `pipeline/test_pdf_peca.py`

**Interfaces:**
- Consumes: `Tabela`, `carregar_tabela`, `ler_codigo` (Task 2); `enquadramentos/saida/enquadramentos.json` (Task 3).
- Produces:
  - `montar_base(c, amparo_legal, artigos_do_pedido=(), codigo_enquadramento: str | None = None, tabela: Tabela | None = None) -> BaseLegal`
  - `BaseLegal.codigo: str | None = None` — o código que aponta o mesmo dispositivo do enquadramento.
  - `campos(case, codigo: str | None = None)`; `montar_peca(..., codigo_da_infracao: str | None = None)`.
  - `settings.enquadramentos_json: str` (env `ENQUADRAMENTOS_JSON`).

- [ ] **Step 1: Write the failing tests**

Em `pipeline/test_base_legal.py`, acrescentar ao import: `from tabela_enquadramentos import carregar_tabela`; e, depois de `CTB_DIR = …`:

```python
TABELA = str(Path(__file__).resolve().parent.parent / "enquadramentos" / "saida" / "enquadramentos.json")
```

E uma classe nova no fim do arquivo (antes do `if __name__`, se houver):

```python
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
```

Em `pipeline/test_peca.py`, na classe `TestCampos`:

```python
    def test_codigo_da_infracao_no_fim_do_quadro(self):
        self.assertEqual(campos(DEFESA, "7455-0")[-1], ("Código da infração", "7455-0"))
        self.assertEqual(campos(RECURSO, "7455-0")[-1], ("Código da infração", "7455-0"))

    def test_sem_codigo_nao_ha_linha(self):
        self.assertEqual(campos(DEFESA, None), campos(DEFESA))
        self.assertNotIn("Código da infração", [r for r, _ in campos(DEFESA)])
```

E na classe `TestMontarPeca`:

```python
    def test_codigo_vai_ao_quadro(self):
        p = montar_peca(RASCUNHO_COM_TITULOS, DEFESA, codigo_da_infracao="7455-0")
        self.assertEqual(p.campos, campos(DEFESA, "7455-0"))
```

Em `pipeline/test_prompt.py`, acrescentar ao import de `prompt` o nome `build_case_context` (se ainda não estiver) e, numa classe que já teste `CAMPOS_INTERNOS` ou numa nova:

```python
class TestCodigoFicaForaDoContexto(unittest.TestCase):
    def test_codigo_nao_vai_cru_ao_modelo(self):
        contexto = build_case_context({"nome": "Ana", "codigo_enquadramento": "7455-0"}, False)
        self.assertNotIn("7455-0", contexto)
        self.assertIn("Ana", contexto)
```

Em `pipeline/test_pdf_peca.py`, na classe dos testes de PDF (a que tem `test_quadro_do_recurso_com_valores_longos`):

```python
    def test_quadro_do_recurso_com_codigo(self):
        caso = dict(CASO, especie_documento=RECURSO_JARI, notificacao_penalidade="P987654321")
        b = gerar_pdf(montar_peca(RASCUNHO, caso, codigo_da_infracao="7455-0"))
        self.assertTrue(b.startswith(b"%PDF-"))
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_base_legal test_peca test_prompt test_pdf_peca 2>&1 | tail -4
```
Expected: falhas e erros com `unexpected keyword argument 'codigo_enquadramento'`, `campos() takes 1 positional argument but 2 were given`, `unexpected keyword argument 'codigo_da_infracao'` e o `7455-0` presente no contexto.

- [ ] **Step 3: Implement `montar_base`**

Em `pipeline/base_legal.py`, acrescentar aos imports:

```python
from tabela_enquadramentos import Tabela, ler_codigo
```

Em `BaseLegal`, acrescentar o último campo:

```python
    # Código da tabela da SENATRAN que aponta o mesmo dispositivo do enquadramento
    # (vai ao quadro da peça); None sem código ou com código divergente.
    codigo: str | None = None
```

Antes de `montar_base`, a resolução:

```python
def _resolver(c: Ctb, amparo_legal: str | None, codigo: str | None,
              tabela: Tabela | None) -> tuple[tuple[str, str] | None, str | None]:
    """Spec 2026-10-15, §6.1: o amparo; sem ele, o código do caso; sem ele, um
    código escrito no amparo. A trava dos arts. 162–255 vale para os três."""
    enq = _enquadramento(c, amparo_legal)
    candidatos = [cod for cod in (codigo, ler_codigo(amparo_legal)) if cod] if tabela else []
    for cod in candidatos:
        if enq:
            break
        disp = tabela.dispositivo(cod)
        enq = _enquadramento(c, disp) if disp else None
    no_quadro = next((cod for cod in candidatos if enq and tabela.dispositivo(cod) == enq[0]), None)
    return enq, no_quadro
```

Em `montar_base`, trocar a assinatura e as duas primeiras linhas do enquadramento:

```python
def montar_base(c: Ctb, amparo_legal: str | None, artigos_do_pedido: tuple[str, ...] = (),
                codigo_enquadramento: str | None = None, tabela: Tabela | None = None) -> BaseLegal:
```

```python
    enq, codigo = _resolver(c, amparo_legal, codigo_enquadramento, tabela)
    citacao, proprio = enq if enq else (None, None)
```

(no lugar de `enq = _enquadramento(c, amparo_legal)` / `citacao, proprio = …`), e no `return BaseLegal(...)` acrescentar `codigo=codigo,`.

- [ ] **Step 4: Implement the peça and the prompt**

Em `pipeline/peca.py`, `campos`:

```python
def campos(case: dict[str, Any], codigo: str | None = None) -> tuple[tuple[str, str], ...]:
    auto = ("Auto de infração", _txt(case, "numero_auto") or LINHA_CURTA)
    placa = ("Placa", _txt(case, "placa").upper() or LINHA_CURTA)
    data = ("Data da infração", data_da_infracao(case.get("data_infracao")) or LINHA_CURTA)
    # O auto imprime o código; sem ele, a linha não aparece (spec 2026-10-15, §6.2).
    extra = (("Código da infração", codigo),) if codigo else ()
    if _estagio(case) == RECURSO_JARI:
        notificacao = ("Notificação de penalidade", _txt(case, "notificacao_penalidade") or LINHA_CURTA)
        return (auto, notificacao, placa, data) + extra
    return (auto, placa, data) + extra
```

Em `montar_peca`, acrescentar o parâmetro `codigo_da_infracao: str | None = None,` depois de `cabe_advertencia: bool = False,` e trocar `campos=campos(case),` por `campos=campos(case, codigo_da_infracao),`.

Em `pipeline/prompt.py`, em `CAMPOS_INTERNOS`, depois de `"data_limite_protocolo",`:

```python
        # Código da tabela da SENATRAN: vai ao quadro da peça pelo código; o modelo
        # recebe o enquadramento pela base (spec 2026-10-15, §6.2).
        "codigo_enquadramento",
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_base_legal test_peca test_prompt test_pdf_peca 2>&1 | tail -3
```
Expected: `OK`.

- [ ] **Step 6: Wire config, worker, startup and Dockerfile**

`pipeline/config.py`, depois de `ctb_dir: str = …`:

```python
    # Tabela de códigos de enquadramento (enquadramentos/enquadramentos_parser.py).
    # No contêiner, aponta para a cópia do Dockerfile.
    enquadramentos_json: str = str(REPO_ROOT / "enquadramentos" / "saida" / "enquadramentos.json")
```

`pipeline/worker.py`: acrescentar o import `from tabela_enquadramentos import carregar_tabela`; trocar o bloco da base:

```python
            ctb = carregar_ctb(settings.ctb_dir)
            tabela = carregar_tabela(settings.enquadramentos_json)
            codigo_do_caso = case.get("codigo_enquadramento")
            base = montar_base(ctb, case.get("amparo_legal"),
                               codigo_enquadramento=codigo_do_caso, tabela=tabela)
```

e a segunda chamada (com o 267):

```python
                base = montar_base(ctb, case.get("amparo_legal"), artigos_do_pedido=("267",),
                                   codigo_enquadramento=codigo_do_caso, tabela=tabela)
```

No `log.info("base legal …")`, acrescentar `codigo=%s` ao formato e `base.codigo or "nenhum"` aos argumentos. Na chamada de `montar_peca`:

```python
            peca = montar_peca(
                draft, case, bloco_vel.situacao if bloco_vel else None, inciso, advertencia,
                codigo_da_infracao=base.codigo,
            )
```

`pipeline/main.py`, depois de `registrar_fontes()`:

```python
# Sem a tabela de enquadramentos, código impresso na notificação não vira
# dispositivo: acusar ao subir (spec 2026-10-15, §6.1).
carregar_tabela(settings.enquadramentos_json)
```

com os imports `from config import settings` e `from tabela_enquadramentos import carregar_tabela`.

`deploy/Dockerfile.pipeline`, depois da linha `ENV CTB_DIR=/app/ctb`:

```dockerfile
# Tabela de códigos de enquadramento (enquadramentos/enquadramentos_parser.py).
COPY enquadramentos/saida/enquadramentos.json /app/enquadramentos.json
ENV ENQUADRAMENTOS_JSON=/app/enquadramentos.json
```

- [ ] **Step 7: Run the whole pipeline suite and the startup check**

```bash
cd pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_verificacao test_diagnostico_paridade test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca test_tentativas test_tabela_enquadramentos 2>&1 | tail -3
ENQUADRAMENTOS_JSON=/nao/existe.json PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -c "import main" 2>&1 | tail -1
```
Expected: `Ran 270 tests … OK` (258 + 7 de `TestCodigoDeEnquadramento` + 2 de `TestCampos` + 1 de `TestMontarPeca` + 1 do prompt + 1 do PDF); o segundo comando termina com `tabela_enquadramentos.TabelaIndisponivel: tabela de enquadramentos ausente ou inválida em /nao/existe.json: …`. Se o `import main` falhar antes, por dependência do FastAPI fora do venv, rode o mesmo de dentro do contêiner na Task 10 e registre.

- [ ] **Step 8: Commit**

```bash
git add pipeline/base_legal.py pipeline/peca.py pipeline/prompt.py pipeline/config.py pipeline/worker.py \
  pipeline/main.py deploy/Dockerfile.pipeline pipeline/test_base_legal.py pipeline/test_peca.py \
  pipeline/test_prompt.py pipeline/test_pdf_peca.py
git commit -q -F - <<'EOF'
feat(pipeline): código de enquadramento vira dispositivo e vai ao quadro da peça

Ordem: amparo, código do caso, código escrito no amparo — sempre sob a trava
dos arts. 162 a 255. Sem a tabela, o pipeline não sobe.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 5: Art. 163 traz o art. 162 para a base (só com aprovação do Klaus)

O art. 163 ("Entregar a direção do veículo a pessoa nas condições previstas no artigo anterior") não cita o 162 por número, então a base não o traz, e a conferência recusaria uma peça que citasse o 162 — que é o que dá sentido ao 163. Os códigos 5061-0 a 5100-4, 7773-1 e 7773-2 caem aqui. O comentário de `EXTRAS_POR_ARTIGO` diz: "só entra item novo com aprovação dele". **Executar esta task só se o Klaus aprovar na revisão do plano; senão, registrar no `PENDENCIAS.md` (Task 10) e pular.**

**Files:**
- Modify: `pipeline/base_legal.py:22-25`
- Test: `pipeline/test_base_legal.py`

- [ ] **Step 1: Write the failing test**

Na classe `TestMontarBase`:

```python
    # Aprovado pelo Klaus em 15/10/2026: o 163 remete ao "artigo anterior" sem número.
    def test_163_traz_o_162(self):
        self.assertIn("162", montar_base(self.c, "Art. 163").artigos)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && python3 -m unittest test_base_legal -k 163_traz 2>&1 | tail -2`
Expected: `FAILED (failures=1)`.

- [ ] **Step 3: Implement**

```python
EXTRAS_POR_ARTIGO: dict[str, tuple[str, ...]] = {
    "218": ("61",),  # multa de velocidade → limites de velocidade por tipo de via
    "163": ("162",),  # "nas condições previstas no artigo anterior", sem número
}
```

- [ ] **Step 4: Run the pipeline suite**

Run: o comando do Step 7 da Task 4.
Expected: `Ran 271 tests … OK`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/base_legal.py pipeline/test_base_legal.py
git commit -q -F - <<'EOF'
feat(pipeline): art. 163 traz o art. 162 para a base

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 6: A busca do site

**Files:**
- Create: `src/lib/enquadramentos.ts`
- Test: `src/lib/enquadramentos.test.ts` (o `npm run radar:test` já roda `src/lib/*.test.ts`)

**Interfaces:**
- Consumes: `src/data/enquadramentos.json` (Task 3), `tests/compartilhados/codigos.json` (Task 2).
- Produces: `type Enquadramento = { codigo: string; descricao: string; dispositivo: string; gravidade: string }`; `lerCodigo(texto: string): string | null`; `artigoDe(dispositivo: string): string`; `buscarEnquadramentos(termo: string, itens: readonly Enquadramento[]): Enquadramento[]`; `LIMITE_DE_RESULTADOS = 30`.

- [ ] **Step 1: Write the failing tests**

`src/lib/enquadramentos.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LIMITE_DE_RESULTADOS, artigoDe, buscarEnquadramentos, lerCodigo, type Enquadramento } from './enquadramentos.ts'

const CASOS: { texto: string; codigo: string | null }[] = JSON.parse(
  readFileSync(new URL('../../tests/compartilhados/codigos.json', import.meta.url), 'utf8'),
)
const ITENS: Enquadramento[] = JSON.parse(readFileSync(new URL('../data/enquadramentos.json', import.meta.url), 'utf8'))
const codigos = (termo: string) => buscarEnquadramentos(termo, ITENS).map((i) => i.codigo)

test('paridade com o pipeline na leitura de código', () => {
  for (const c of CASOS) assert.equal(lerCodigo(c.texto), c.codigo, c.texto)
})

test('código em qualquer formato impresso', () => {
  for (const t of ['7455-0', '745-50', '74550', '7455', ' 745-50 ']) assert.deepEqual(codigos(t), ['7455-0'], t)
})

test('artigo, com ou sem inciso', () => {
  assert.deepEqual(codigos('218'), ['7455-0', '7463-0', '7471-0'])
  assert.deepEqual(codigos('Art. 218, I'), ['7455-0'])
  assert.deepEqual(codigos('art 218 inciso II'), ['7463-0'])
  assert.deepEqual(codigos('Artigo 218, III, do CTB'), ['7471-0'])
  assert.deepEqual(codigos('181, I'), ['5380-0'])
  assert.deepEqual(codigos('181 i'), ['5380-0'])
})

test('artigo com letra', () => {
  assert.deepEqual(codigos('165-A'), ['7579-0'])
  assert.deepEqual(codigos('165a'), ['7579-0'])
})

test('palavras: sem acento, sem caixa, pelo começo', () => {
  assert.deepEqual(codigos('velocidade 20'), ['7455-0', '7463-0'])
  assert.deepEqual(codigos('VELOCIDADE 20'), ['7455-0', '7463-0'])
  assert.deepEqual(codigos('veloc 20'), ['7455-0', '7463-0'])
  assert.deepEqual(codigos('estacionar fila dupla'), ['5487-0'])
  assert.deepEqual(codigos('telefone celular'), ['7366-2', '7633-1', '7633-2'])
  assert.deepEqual(codigos('influencia alcool'), ['5169-1'])
})

test('nada a buscar', () => {
  for (const t of ['', '   ', '2026-10-15', 'xyzw']) assert.deepEqual(codigos(t), [], t)
})

test('no máximo 30 resultados, em ordem de código', () => {
  const r = codigos('a')
  assert.equal(r.length, LIMITE_DE_RESULTADOS)
  assert.deepEqual(r, [...r].sort())
})

test('artigo do dispositivo', () => {
  assert.equal(artigoDe('art. 165-A, § 1º'), '165-A')
  assert.equal(artigoDe('art. 252, parágrafo único'), '252')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/lib/enquadramentos.test.ts 2>&1 | grep -E "^# (pass|fail)|Cannot find"`
Expected: falha de import (`Cannot find module … enquadramentos.ts`).

- [ ] **Step 3: Implement**

`src/lib/enquadramentos.ts`:

```ts
/*
 * Lista de enquadramentos do campo de escolha (spec 2026-10-15, §4). Os itens vêm
 * de src/data/enquadramentos.json, gerado por enquadramentos/enquadramentos_parser.py
 * a partir do Anexo IV da Portaria SENATRAN 354/2022. A leitura de código é a mesma
 * de pipeline/tabela_enquadramentos.py, garantida por tests/compartilhados/codigos.json.
 */

export type Enquadramento = {
  codigo: string
  descricao: string
  dispositivo: string
  gravidade: string
}

// Ordem importa: "7455-0" antes de "745-50", e os dois antes dos cinco dígitos
// colados. As bordas impedem ler código dentro de data ou número maior.
const CODIGO = [
  /(?<!\d)(\d{4})\s?-\s?(\d)(?!\d)/,
  /(?<!\d)(\d{3})\s?-\s?(\d)(\d)(?!\d)/,
  /(?<!\d)(\d{4})(\d)(?!\d)/,
]

/** O primeiro código de enquadramento no texto, como "7455-0", ou null. */
export function lerCodigo(texto: string): string | null {
  for (const padrao of CODIGO) {
    const m = padrao.exec(texto)
    if (m) return m.length === 4 ? `${m[1]}${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`
  }
  return null
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const palavras = (s: string) => semAcento(s).split(/[^a-z0-9]+/).filter(Boolean)

/** "art. 165-A, § 1º" → "165-A". */
export const artigoDe = (dispositivo: string) => /^art\.\s*([\dA-Z-]+)/.exec(dispositivo)?.[1] ?? ''

// "218", "165-A", "165a", "art. 218, I", "Artigo 218 inciso II do CTB".
const REFERENCIA =
  /^(?:art(?:igo)?\.?\s*)?(\d{1,3})(?:-?([a-z])(?![a-z]))?(?:\s*,?\s*(?:inciso\s+|inc\.\s*)?([ivxlc]+))?(?:\s*,?\s*do\s+ctb)?\s*$/i
const SO_CODIGO = /^[\d\s.-]+$/

export const LIMITE_DE_RESULTADOS = 30

/** "art. 218, I" é do inciso I; "art. 218, II" não. */
function doInciso(dispositivo: string, artigo: string, inciso: string): boolean {
  const prefixo = `art. ${artigo}, ${inciso}`
  return dispositivo.startsWith(prefixo) && !/^[IVXLC]/.test(dispositivo.slice(prefixo.length))
}

/**
 * Busca por código ("7455-0", "745-50", "74550", "7455"), por artigo ("218", "165-A",
 * "art. 218, I") ou por palavras da descrição, sem acento ("velocidade 20"). Ordem
 * pelo código; no máximo LIMITE_DE_RESULTADOS.
 */
export function buscarEnquadramentos(termo: string, itens: readonly Enquadramento[]): Enquadramento[] {
  const t = termo.trim()
  if (!t) return []
  const digitos = t.replace(/\D/g, '')
  const ref = REFERENCIA.exec(t)
  let achados: Enquadramento[]
  if (ref) {
    const artigo = ref[1] + (ref[2] ? `-${ref[2].toUpperCase()}` : '')
    const inciso = ref[3]?.toUpperCase()
    achados = itens.filter(
      (i) => artigoDe(i.dispositivo) === artigo && (!inciso || doInciso(i.dispositivo, artigo, inciso)),
    )
  } else if (SO_CODIGO.test(t) && digitos.length === 5) {
    const codigo = lerCodigo(digitos)
    achados = itens.filter((i) => i.codigo === codigo)
  } else if (SO_CODIGO.test(t) && digitos.length === 4) {
    achados = itens.filter((i) => i.codigo.startsWith(`${digitos}-`))
  } else {
    const codigo = lerCodigo(t)
    const busca = palavras(t)
    achados = itens.filter((i) => {
      if (codigo && i.codigo === codigo) return true
      const desc = palavras(i.descricao)
      const artigo = artigoDe(i.dispositivo).toLowerCase()
      return busca.every((p) => p === artigo || desc.some((d) => d.startsWith(p)))
    })
  }
  return [...achados].sort((a, b) => a.codigo.localeCompare(b.codigo)).slice(0, LIMITE_DE_RESULTADOS)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/lib/enquadramentos.test.ts 2>&1 | grep -E "^# (pass|fail)"` e depois `npm run radar:test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 8` / `# fail 0`; depois `# pass 124` / `# fail 0` (116 + 8).

Se `influencia alcool` ou `telefone celular` trouxer códigos diferentes dos esperados, confira contra `src/data/enquadramentos.json` (`grep -i "celular" src/data/enquadramentos.json`) e corrija o **teste** só se a lista gerada estiver certa contra o PDF — nunca a busca para caber num teste errado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enquadramentos.ts src/lib/enquadramentos.test.ts
git commit -q -F - <<'EOF'
feat(front): busca de enquadramento por código, artigo ou descrição

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 7: O código nas respostas do questionário e no rascunho do formulário

**Files:**
- Modify: `src/lib/questionario.ts` (tipo, `RESPOSTAS_VAZIAS`, `valido`, `CamposDoQuestionarioNoFormulario`, `paraCamposDoFormulario`, `mesclarComRascunho`)
- Test: `src/lib/questionario.test.ts`

**Interfaces:**
- Produces: `RespostasQuestionario.codigo_enquadramento: string`; `CamposDoQuestionarioNoFormulario.codigoEnquadramento: string`; `mesclarComRascunho<T>(base: T, rascunho: Partial<T> | null, pares?: readonly (readonly [keyof T, keyof T])[]): T`.

- [ ] **Step 1: Write the failing tests**

No fim de `src/lib/questionario.test.ts`:

```ts
test('resposta nova traz o código do enquadramento, vazio', () => {
  assert.equal(RESPOSTAS_VAZIAS.codigo_enquadramento, '')
})

// Spec 2026-10-15, §4.4: rascunho de antes da lista abre no texto livre, sem quebrar.
test('rascunho antigo, sem o código, é lido com ele vazio', () => {
  const a = new Memoria()
  const { codigo_enquadramento: _, ...antigo } = { ...R, codigo_enquadramento: '' }
  a.setItem(CHAVE_ATUAL, JSON.stringify(antigo))
  assert.deepEqual(lerRespostas(a, CHAVE_ATUAL), { ...R, codigo_enquadramento: '' })
})

test('código que não é texto invalida a resposta', () => {
  const a = new Memoria()
  a.setItem(CHAVE_ATUAL, JSON.stringify({ ...R, codigo_enquadramento: 7455 }))
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
})

test('o código vai ao formulário', () => {
  const r = { ...R, amparo_legal: 'art. 218, I', codigo_enquadramento: '7455-0' }
  const f = paraCamposDoFormulario(r)
  assert.equal(f.amparoLegal, 'art. 218, I')
  assert.equal(f.codigoEnquadramento, '7455-0')
})

// Review Focus 1: amparo livre do rascunho com o código do questionário poria o
// código errado no quadro da peça.
test('amparo do rascunho leva o código do rascunho junto, mesmo vazio', () => {
  const base = { amparoLegal: 'art. 218, I', codigoEnquadramento: '7455-0', nome: '' }
  const rascunho = { amparoLegal: 'Art. 230', codigoEnquadramento: '', nome: 'Ana' }
  const pares = [['amparoLegal', 'codigoEnquadramento']] as const
  assert.deepEqual(mesclarComRascunho(base, rascunho, pares),
    { amparoLegal: 'Art. 230', codigoEnquadramento: '', nome: 'Ana' })
})

test('sem amparo no rascunho, o par do questionário fica', () => {
  const base = { amparoLegal: 'art. 218, I', codigoEnquadramento: '7455-0', nome: '' }
  const pares = [['amparoLegal', 'codigoEnquadramento']] as const
  assert.deepEqual(mesclarComRascunho(base, { nome: 'Ana' }, pares),
    { amparoLegal: 'art. 218, I', codigoEnquadramento: '7455-0', nome: 'Ana' })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test src/lib/questionario.test.ts 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: os 6 testes novos em `not ok`.

- [ ] **Step 3: Implement**

Em `src/lib/questionario.ts`:

No tipo `RespostasQuestionario`, depois de `amparo_legal: string`:
```ts
  /** "7455-0" quando o enquadramento veio da lista; '' no texto livre (spec 2026-10-15). */
  codigo_enquadramento: string
```

Em `RESPOSTAS_VAZIAS`, trocar `amparo_legal: '',` por `amparo_legal: '', codigo_enquadramento: '',`.

Em `valido`, dentro do `for`, antes de `if (typeof r[chave] !== 'string') return false`:
```ts
    // Rascunho de antes da lista (15/10/2026) não tem o código: lido como vazio.
    if (chave === 'codigo_enquadramento' && r[chave] === undefined) continue
```

Em `CamposDoQuestionarioNoFormulario`, trocar `amparoLegal: string` por `amparoLegal: string; codigoEnquadramento: string`; em `paraCamposDoFormulario`, depois de `amparoLegal: r.amparo_legal,`:
```ts
    codigoEnquadramento: r.codigo_enquadramento,
```

`mesclarComRascunho` inteira:
```ts
/** O rascunho do formulário é mais recente e prevalece — mas só campo preenchido:
 *  um rascunho de antes do questionário não apaga as respostas com ''. Num par
 *  ([amparo, código]), quem traz o primeiro traz o segundo, mesmo vazio: o amparo
 *  livre do rascunho não pode herdar o código do questionário (spec 2026-10-15). */
export function mesclarComRascunho<T extends object>(
  base: T,
  rascunho: Partial<T> | null,
  pares: readonly (readonly [keyof T, keyof T])[] = [],
): T {
  if (!rascunho) return base
  const saida = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(rascunho)) {
    if (typeof v === 'string' && v !== '') saida[k] = v
  }
  for (const [primeiro, segundo] of pares) {
    const valor = rascunho[primeiro]
    if (typeof valor === 'string' && valor !== '') {
      const par = rascunho[segundo]
      saida[segundo as string] = typeof par === 'string' ? par : ''
    }
  }
  return saida as T
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm run radar:test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 130` / `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/questionario.ts src/lib/questionario.test.ts
git commit -q -F - <<'EOF'
feat(front): código do enquadramento nas respostas e no rascunho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 8: O campo de escolha no questionário e no formulário

**Files:**
- Create: `src/components/CampoEnquadramento.tsx`
- Modify: `src/index.css` (bloco `.enq`)
- Modify: `src/pages/Questionario.tsx:139-142`
- Modify: `src/pages/Form.tsx` (`FormData`, `INITIAL_FORM`, import de `useCallback`, `mesclarComRascunho`, campo, payload)
- Modify: `tsconfig.app.json` (`resolveJsonModule`)

**Interfaces:**
- Consumes: `buscarEnquadramentos`, `Enquadramento` (Task 6); `codigo_enquadramento`, `codigoEnquadramento`, `mesclarComRascunho` com pares (Task 7); `src/data/enquadramentos.json` (Task 3).
- Produces: `<CampoEnquadramento id rotulo amparo codigo aoMudar={(amparo, codigo) => …} />`; payload do formulário com `codigo_enquadramento: string | null`.

Sem biblioteca de teste de componente no projeto: a verificação é `eslint`, `tsc` nos arquivos tocados e o navegador (Step 7).

- [ ] **Step 1: `resolveJsonModule`**

Em `tsconfig.app.json`, em `compilerOptions`, acrescentar `"resolveJsonModule": true,` (o `import()` do JSON).

- [ ] **Step 2: O componente**

`src/components/CampoEnquadramento.tsx`:

```tsx
/*
 * Campo do enquadramento (spec 2026-10-15, §4.2): busca na tabela da SENATRAN,
 * cartão do item escolhido, ou texto livre para quem não achar. A lista vem num
 * arquivo à parte, baixado só quando o campo aparece; sem ela, texto livre.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buscarEnquadramentos, type Enquadramento } from '../lib/enquadramentos';

let lista: Promise<Enquadramento[]> | null = null;

/** Uma vez por página; falha não fica guardada (o próximo campo tenta de novo). */
function carregarLista(): Promise<Enquadramento[]> {
  lista ??= import('../data/enquadramentos.json')
    .then((m) => m.default as Enquadramento[])
    .catch((e) => {
      lista = null;
      throw e;
    });
  return lista;
}

type Modo = 'busca' | 'escolhido' | 'livre';

const modoDe = (amparo: string, codigo: string, atual: Modo): Modo =>
  codigo ? 'escolhido' : amparo ? 'livre' : atual === 'escolhido' ? 'busca' : atual;

type Props = {
  /** id do controle principal: o foco do primeiro erro do formulário chega aqui. */
  id: string;
  rotulo: string;
  amparo: string;
  codigo: string;
  aoMudar: (amparo: string, codigo: string) => void;
};

const CampoEnquadramento = ({ id, rotulo, amparo, codigo, aoMudar }: Props) => {
  const [itens, setItens] = useState<Enquadramento[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [modo, setModo] = useState<Modo>(() => modoDe(amparo, codigo, 'busca'));
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const dicaId = useId();

  useEffect(() => {
    let vivo = true;
    carregarLista().then(
      (l) => vivo && setItens(l),
      () => vivo && setFalhou(true),
    );
    return () => {
      vivo = false;
    };
  }, []);

  // Valores trocados de fora (rascunho restaurado, "apagar rascunho") mudam o modo.
  useEffect(() => {
    setModo((m) => modoDe(amparo, codigo, m));
  }, [amparo, codigo]);

  const escolhido = useMemo(
    () => itens?.find((i) => i.codigo === codigo && i.dispositivo === amparo) ?? null,
    [itens, codigo, amparo],
  );

  // Código que não está na lista, ou que não bate com o amparo: sai o código, fica o texto.
  useEffect(() => {
    if (codigo && (falhou || (itens && !escolhido))) aoMudar(amparo, '');
  }, [codigo, falhou, itens, escolhido, amparo, aoMudar]);

  const resultados = useMemo(() => (itens ? buscarEnquadramentos(termo, itens) : []), [itens, termo]);
  const naoEncontroIdx = resultados.length;
  const mostrarLista = aberto && termo.trim() !== '';

  const focar = () => requestAnimationFrame(() => campoRef.current?.focus());
  const escolher = (i: Enquadramento) => {
    aoMudar(i.dispositivo, i.codigo);
    setModo('escolhido');
    setTermo('');
    setAberto(false);
  };
  const naoEncontro = () => {
    aoMudar(termo.trim(), '');
    setModo('livre');
    setAberto(false);
    focar();
  };
  const trocar = () => {
    aoMudar('', '');
    setModo('busca');
    setTermo('');
    focar();
  };
  const voltarALista = () => {
    setTermo(amparo);
    aoMudar('', '');
    setModo('busca');
    setAberto(true);
    focar();
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    const total = resultados.length + 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => (a + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => (a - 1 + total) % total);
    } else if (e.key === 'Enter' && mostrarLista) {
      e.preventDefault();
      if (ativo < resultados.length) escolher(resultados[ativo]);
      else naoEncontro();
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  };

  if (falhou || modo === 'livre') {
    return (
      <div>
        <label className="form-label" htmlFor={id}>{rotulo}</label>
        <input ref={campoRef} id={id} type="text" className="form-input" maxLength={120}
          placeholder="Art. 218, II, do CTB" value={amparo} aria-describedby={dicaId}
          onChange={(e) => aoMudar(e.target.value, '')} />
        <p className="form-hint" id={dicaId}>
          Copie como está na notificação, no campo do enquadramento ou do amparo legal.
        </p>
        {!falhou && (
          <button type="button" className="enq__acao" onClick={voltarALista}>Voltar à lista</button>
        )}
      </div>
    );
  }

  if (modo === 'escolhido') {
    return (
      <div>
        <span className="form-label">{rotulo}</span>
        <div className="enq__escolhido">
          <span className="enq__codigo">{codigo}</span>
          <span className="enq__descricao">{escolhido?.descricao ?? ''}</span>
          <span className="enq__dispositivo">
            {amparo}{escolhido ? ` · ${escolhido.gravidade}` : ''}
          </span>
        </div>
        <p className="form-hint">Confira se é a mesma descrição da sua notificação.</p>
        <button type="button" id={id} className="enq__acao" onClick={trocar}>Trocar</button>
      </div>
    );
  }

  return (
    <div className="enq">
      <label className="form-label" htmlFor={id}>{rotulo}</label>
      <input ref={campoRef} id={id} type="text" className="form-input" role="combobox"
        aria-expanded={mostrarLista} aria-controls={listaId} aria-autocomplete="list"
        aria-activedescendant={mostrarLista ? `${listaId}-${ativo}` : undefined}
        aria-describedby={dicaId} autoComplete="off" placeholder="745-50, 218 ou velocidade"
        value={termo} onKeyDown={teclas} onFocus={() => setAberto(true)} onBlur={() => setAberto(false)}
        onChange={(e) => {
          setTermo(e.target.value);
          setAtivo(0);
          setAberto(true);
        }} />
      {mostrarLista && (
        <ul className="enq__lista" id={listaId} role="listbox" aria-label={rotulo}>
          {!itens && <li className="enq__vazio" role="presentation">Carregando a lista…</li>}
          {resultados.map((i, n) => (
            <li key={i.codigo} id={`${listaId}-${n}`} role="option" aria-selected={n === ativo}
              className="enq__opcao" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(i)}>
              <span className="enq__codigo">{i.codigo}</span>
              <span className="enq__descricao">{i.descricao}</span>
              <span className="enq__dispositivo">{i.dispositivo} · {i.gravidade}</span>
            </li>
          ))}
          <li id={`${listaId}-${naoEncontroIdx}`} role="option" aria-selected={ativo === naoEncontroIdx}
            className="enq__opcao enq__opcao--livre" onMouseDown={(e) => e.preventDefault()}
            onClick={naoEncontro}>
            Não encontro na lista
          </li>
        </ul>
      )}
      <p className="form-hint" id={dicaId}>
        Digite o código, o artigo ou palavras da descrição, como estão na notificação.
      </p>
      <button type="button" className="enq__acao" onClick={naoEncontro}>Não encontro na lista</button>
    </div>
  );
};

export default CampoEnquadramento;
```

- [ ] **Step 3: Os estilos**

Em `src/index.css`, logo depois do bloco `.choice__desc { … }`:

```css
  /* ---- Campo do enquadramento (spec 2026-10-15, §4.2) ----------------------
     A lista e o cartão usam as superfícies do formulário: papel do cartão, creme
     da seleção, código em mono na cor da marca, como na notificação. */
  .enq {
    @apply relative;
  }

  .enq__lista {
    @apply absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded border border-input bg-card shadow-md;
  }

  .enq__opcao {
    @apply flex cursor-pointer flex-col gap-0.5 border-b border-rule px-4 py-3 last:border-b-0;
  }
  .enq__opcao[aria-selected='true'] {
    @apply bg-muted;
  }

  .enq__opcao--livre {
    @apply font-mono text-[11px] uppercase tracking-[0.14em] text-primary;
  }

  .enq__codigo {
    @apply font-mono text-xs tracking-wide text-primary;
  }

  .enq__descricao {
    @apply text-sm leading-snug text-foreground;
  }

  .enq__dispositivo {
    @apply font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground;
  }

  .enq__vazio {
    @apply px-4 py-3 text-sm text-muted-foreground;
  }

  .enq__escolhido {
    @apply flex flex-col gap-1 rounded border border-primary bg-muted p-4;
  }

  .enq__acao {
    @apply mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary underline underline-offset-4;
  }
```

- [ ] **Step 4: No questionário**

Em `src/pages/Questionario.tsx`: acrescentar `useCallback` ao import do React e `import CampoEnquadramento from '../components/CampoEnquadramento';`. Dentro de `Questionario`, depois de `mudar`:

```tsx
  const mudarEnquadramento = useCallback((amparo: string, codigo: string) => {
    setErro(null);
    setR((atual) => ({ ...atual, amparo_legal: amparo, codigo_enquadramento: codigo }));
  }, []);
```

Trocar as três linhas do campo (`<label … htmlFor="q-amparo">`, o `<input id="q-amparo" …>` e o `<p className="form-hint">Copie como está…</p>`) por:

```tsx
                  <div className="mt-5">
                    <CampoEnquadramento id="q-amparo" rotulo="Enquadramento (amparo legal)"
                      amparo={r.amparo_legal} codigo={r.codigo_enquadramento} aoMudar={mudarEnquadramento} />
                  </div>
```

- [ ] **Step 5: No formulário**

Em `src/pages/Form.tsx`:
- acrescentar `useCallback` ao import do React e `import CampoEnquadramento from '../components/CampoEnquadramento';`;
- no tipo `FormData`, depois de `amparoLegal: string;`: `codigoEnquadramento: string;`;
- em `INITIAL_FORM`, depois de `amparoLegal: '',`: `codigoEnquadramento: '',`;
- na restauração, trocar `...mesclarComRascunho(comQuestionario, rascunho),` por:
  ```tsx
        ...mesclarComRascunho(comQuestionario, rascunho, [['amparoLegal', 'codigoEnquadramento']]),
  ```
- dentro de `Form`, junto dos outros handlers:
  ```tsx
  const mudarEnquadramento = useCallback((amparo: string, codigo: string) => {
    setFormData((p) => ({ ...p, amparoLegal: amparo, codigoEnquadramento: codigo }));
  }, []);
  ```
- trocar o conteúdo do `<div className="form-field--wide">` do amparo (o `<label htmlFor="amparoLegal">` e o `<input id="amparoLegal" …/>`) por:
  ```tsx
                <CampoEnquadramento id="amparoLegal" rotulo="Amparo legal da autuação"
                  amparo={formData.amparoLegal} codigo={formData.codigoEnquadramento}
                  aoMudar={mudarEnquadramento} />
  ```
- no payload, depois de `amparo_legal: data.amparoLegal.trim() || null,`:
  ```tsx
      codigo_enquadramento: data.codigoEnquadramento || null,
  ```

- [ ] **Step 6: Lint, tipos e testes**

```bash
npx eslint src/components/CampoEnquadramento.tsx src/pages/Questionario.tsx src/pages/Form.tsx src/lib/enquadramentos.ts src/lib/questionario.ts
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "CampoEnquadramento|Questionario|Form\.tsx|enquadramentos|questionario" ; echo "erros nos arquivos tocados: $?"
npm run radar:test 2>&1 | grep -E "^# (pass|fail)"
```
Expected: eslint sem saída; o `grep` do tsc sem linhas (`erros nos arquivos tocados: 1`, isto é, nada achado) — os 46 erros de módulo ausente do `node_modules` do Windows são conhecidos e iguais com e sem a mudança; `# pass 130`, `# fail 0`.

- [ ] **Step 7: Contraste dos pares novos**

```bash
python3 - <<'EOF'
import colorsys, re
css = open('src/index.css', encoding='utf-8').read()
achados = re.findall(r'--([\w-]+):\s*([\d.]+) ([\d.]+)% ([\d.]+)%', css)
temas = [{}, {}]
for nome, h, s, l in achados:
    t = temas[0] if nome not in temas[0] else temas[1]
    t.setdefault(nome, (float(h), float(s), float(l)))
def lum(hsl):
    r, g, b = colorsys.hls_to_rgb(hsl[0] / 360, hsl[2] / 100, hsl[1] / 100)
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def razao(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)
pares = [('primary', 'card'), ('primary', 'muted'), ('foreground', 'card'), ('foreground', 'muted'),
         ('muted-foreground', 'card'), ('muted-foreground', 'muted')]
for nome, t in zip(('claro', 'escuro'), temas):
    for f, b in pares:
        r = razao(t[f], t[b])
        print(f'{nome:6} {f:17} sobre {b:6} {r:5.2f} {"ok" if r >= 4.5 else "REPROVA"}')
EOF
```
Expected: todas as 12 linhas `ok`. Alguma `REPROVA` → parar e trocar a cor do elemento por outro token da paleta que passe (nenhum matiz novo), e rodar de novo.

- [ ] **Step 8: No navegador**

Subir o Vite numa porta livre, em segundo plano: `npx vite --port 8091 --strictPort`. Com o Playwright:

1. `/questionario`: passo 1 (primeira opção), passo 2 (`2026-11-10`), passo 3 (`Sim`), passo 4. No campo do enquadramento, digitar `745-50` → a lista mostra `7455-0` e "Não encontro na lista"; Enter → cartão com `7455-0`, a descrição, `art. 218, I · média` e "Confira se é a mesma descrição da sua notificação".
2. "Trocar" → volta à busca, campo vazio e focado. Digitar `celular` → três opções (`7366-2`, `7633-1`, `7633-2`); setas para baixo e para cima mudam `aria-activedescendant`.
3. "Não encontro na lista" com `xyzw` digitado → texto livre com `xyzw`; "Voltar à lista" → busca com `xyzw` no campo.
4. Recarregar a página com o item escolhido → o cartão volta (o questionário guarda o par).
5. **Review Focus 2:** nova aba com `page.route('**/enquadramentos.json*', r => r.abort())`, ir ao passo 4 → aparece o campo de texto livre ("Copie como está na notificação…"), sem "Voltar à lista".
6. `/form?success=true&case_id=CASO_00000000-0000-0000-0000-000000000000`, com `localStorage['questionario_CASO_00000000-0000-0000-0000-000000000000']` = as respostas do passo 1 (incluindo `amparo_legal: 'art. 218, I'` e `codigo_enquadramento: '7455-0'`) → o campo "Amparo legal da autuação" abre no cartão com `7455-0`.
7. No mesmo formulário, um rascunho `localStorage['form_draft_<caso>']` (confira o prefixo em `RASCUNHO_PREFIXO`) com `amparoLegal: 'Art. 230'` e `codigoEnquadramento: ''` → recarregar: o campo abre no texto livre com `Art. 230` (Review Focus 1).

Parar o Vite. Expected: os sete itens como descritos; nenhuma chamada à `form-submit`.

- [ ] **Step 9: Commit**

```bash
git add src/components/CampoEnquadramento.tsx src/index.css src/pages/Questionario.tsx src/pages/Form.tsx tsconfig.app.json
git commit -q -F - <<'EOF'
feat(front): enquadramento escolhido numa lista com busca

No questionário e no formulário: busca por código, artigo ou descrição,
cartão para conferir com a notificação e texto livre para quem não achar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 9: A coluna nova e a `form-submit`

**Files:**
- Create: `supabase/migrations/20261016000000_codigo_enquadramento.sql`
- Modify: `supabase/functions/form-submit/campos.ts`, `supabase/functions/form-submit/index.ts:15,384`
- Modify: `src/integrations/supabase/types.ts` (bloco `form_submissions`: Row, Insert, Update)
- Test: `supabase/functions/form-submit/campos.test.ts`

**Interfaces:**
- Produces: `form_submissions.codigo_enquadramento text` (nulável); `codigoEnquadramento(valor: unknown): string | null`.

- [ ] **Step 1: Write the failing tests**

Em `supabase/functions/form-submit/campos.test.ts`, trocar o import por:

```ts
import { clienteConduzia, codigoEnquadramento, dataLimiteProtocolo } from './campos.ts'
```

e acrescentar no fim:

```ts
test('código de enquadramento no formato NNNN-N passa como está', () => {
  assert.equal(codigoEnquadramento('7455-0'), '7455-0')
  assert.equal(codigoEnquadramento('5169-1'), '5169-1')
})

// Review Focus 5: só o formato que o site manda; o resto vira null, sem recusar o envio.
test('código em outro formato ou de outro tipo vira null', () => {
  for (const valor of ['7455-00', '74550', '745-50', ' 7455-0', '7455-0 ', 'abcd-e', '', 74550, null, undefined, {}, []]) {
    assert.equal(codigoEnquadramento(valor), null, `valor: ${JSON.stringify(valor)}`)
  }
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test supabase/functions/form-submit/campos.test.ts 2>&1 | grep -E "^# (pass|fail)|SyntaxError"`
Expected: `SyntaxError: The requested module './campos.ts' does not provide an export named 'codigoEnquadramento'`.

- [ ] **Step 3: Implement**

No fim de `supabase/functions/form-submit/campos.ts`:

```ts
/**
 * `codigo_enquadramento` — o código da tabela da SENATRAN escolhido na lista
 * (spec docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md, §5).
 * Só 'NNNN-N' passa; o resto vira null, e o envio nunca é recusado por causa deste
 * campo. A Edge não confere o código contra a tabela: quem o traduz é o pipeline.
 */
export function codigoEnquadramento(valor: unknown): string | null {
  return typeof valor === "string" && /^\d{4}-\d$/.test(valor) ? valor : null;
}
```

Em `index.ts`, o import da linha 15:

```ts
import { clienteConduzia, codigoEnquadramento, dataLimiteProtocolo } from "./campos.ts";
```

e, logo depois de `data_limite_protocolo: dataLimiteProtocolo(norm.data_limite_protocolo, norm.data_infracao),`:

```ts
      // Também fora do dup_guard. Só o formato; quem traduz o código é o pipeline.
      codigo_enquadramento: codigoEnquadramento(norm.codigo_enquadramento),
```

A migration `supabase/migrations/20261016000000_codigo_enquadramento.sql`:

```sql
-- Código da Tabela de Enquadramentos (Anexo IV da Portaria SENATRAN 354/2022)
-- escolhido na lista do questionário ou do formulário: "7455-0". Spec
-- docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md, §5.
-- Nulável e sem default: texto livre e casos antigos ficam sem código. A tabela
-- já é fechada à chave anônima (20261012000000_rls_fechada); coluna nova não muda isso.
ALTER TABLE public.form_submissions ADD COLUMN codigo_enquadramento text;

COMMENT ON COLUMN public.form_submissions.codigo_enquadramento IS
  'Código da tabela de enquadramentos da SENATRAN escolhido na lista ("7455-0"); null no texto livre.';
```

Em `src/integrations/supabase/types.ts`, no bloco `form_submissions`, acrescentar em ordem alfabética (depois de `cliente_conduzia`): em `Row`, `codigo_enquadramento: string | null`; em `Insert` e `Update`, `codigo_enquadramento?: string | null`.

- [ ] **Step 4: Run to verify they pass**

```bash
node --test supabase/functions/form-submit/campos.test.ts 2>&1 | grep -E "^# (pass|fail)"
npm run radar:test 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# pass 9`, `# fail 0`; depois `# pass 132`, `# fail 0`.

- [ ] **Step 5: Aplicar a migration no banco local (se a stack estiver de pé)**

```bash
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1); echo "${DB:-stack local parada}"
[ -n "$DB" ] && docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261016000000_codigo_enquadramento.sql
[ -n "$DB" ] && docker exec -i "$DB" psql -U postgres -d postgres -Xqt -f - < supabase/tests/rls_test.sql | grep -cE '^ *ok'
```
Expected: `ALTER TABLE` e `COMMENT`; `53` (a RLS continua fechada). Stack parada → registrar no relatório que a migration só foi conferida por leitura, e seguir.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261016000000_codigo_enquadramento.sql supabase/functions/form-submit/campos.ts \
  supabase/functions/form-submit/campos.test.ts supabase/functions/form-submit/index.ts src/integrations/supabase/types.ts
git commit -q -F - <<'EOF'
feat(form-submit): grava o código de enquadramento escolhido na lista

Coluna nova form_submissions.codigo_enquadramento; só 'NNNN-N' passa, o
resto vira null sem recusar o envio.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 10: Documentação e verificação final

**Files:**
- Modify: `CLAUDE.md`, `PROGRESSO.md`, `PENDENCIAS.md`

- [ ] **Step 1: `CLAUDE.md`**

- **Testes:** acrescentar `test_tabela_enquadramentos` à lista dos testes Python do pipeline e o comando do extrator: `cd enquadramentos && PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q` (22 testes, contra o PDF real).
- **Fluxo ponta a ponta / modelo de dados:** `form_submissions.codigo_enquadramento` ("7455-0" quando escolhido da lista).
- **Schema:** "onze migrations" → "doze migrations", com "a do código de enquadramento (16/10/2026)" no fim da lista.
- **Invariante da base normativa:** acrescentar: o enquadramento sai do `amparo_legal`, senão do `codigo_enquadramento`, senão de um código escrito no `amparo_legal`, pela tabela de `enquadramentos/saida/enquadramentos.json` (`pipeline/tabela_enquadramentos.py`), sempre sob a trava dos arts. 162–255; sem a tabela, o pipeline não sobe; o código só vai ao quadro da peça quando aponta o mesmo dispositivo do enquadramento; `codigo_enquadramento` está em `CAMPOS_INTERNOS`.
- **Invariante do diagnóstico:** a lista do site (`src/data/enquadramentos.json`) é a projeção da tabela, e a leitura de código é a mesma nos dois lados (`tests/compartilhados/codigos.json`).
- **Armadilhas:** nova entrada "Atualizar a tabela de enquadramentos" (resumo de `enquadramentos/README.md`); na entrada "Atualizar o CTB", "depois, rode o extrator de enquadramentos de novo — o `test_tabela_enquadramentos` reprova tabela conferida contra outro CTB"; nota de que `parse_ref` lê "§ único" desde 15/10/2026 (antes caía no caput).
- **Variáveis de ambiente:** o pipeline lê também `ENQUADRAMENTOS_JSON`.

- [ ] **Step 2: `PROGRESSO.md`**

Entrada nova no topo das sessões (antes de "Sessão de 15/10/2026 — Achados dos casos de teste"), no formato das outras: "Sessão de 15–16/10/2026 — Enquadramento por lista, com a tabela da SENATRAN", com: a fonte (anexo retificado + 423/2024, sha256), os números (442 / 427 / 1 rejeitado), o bug do "§ único" corrigido, as três camadas (extrator, site, pipeline), a decisão sobre o art. 163 (Task 5 feita ou não), os testes de cada camada com os totais finais, o que ficou para o deploy e a lista de arquivos.

- [ ] **Step 3: `PENDENCIAS.md`**

- Remover "Enquadramento escolhido numa lista com busca" e "Tabela de códigos de enquadramento".
- Acrescentar em "Produção e lançamento": "**Deploy do enquadramento por lista** — na ordem: `npx supabase db push` (coluna `codigo_enquadramento`), `npx supabase functions deploy form-submit`, rebuild do contêiner do pipeline (com a tabela). O site só vai com o campo novo depois dos três. → Sessão de 15–16/10/2026".
- No item "O resumo do questionário não mostra a advertência", acrescentar: "a gravidade já é conhecida antes do pagamento quando o cliente escolhe da lista (`src/data/enquadramentos.json`)".
- Se a Task 5 não foi feita: "**Art. 163 sem o 162 na base** — o 163 remete ao 'artigo anterior' sem número; a peça que citar o 162 é recusada pela conferência. Proposta: `EXTRAS_POR_ARTIGO['163'] = ('162',)`. *Decisão do Klaus.* → Sessão de 15–16/10/2026".
- Acrescentar em "Repositório e testes": "*Menor:* o campo de enquadramento não tem teste de componente (o projeto não tem biblioteca para isso); a verificação foi no navegador. → Sessão de 15–16/10/2026".

- [ ] **Step 4: Verificação final**

```bash
cd pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_verificacao test_diagnostico_paridade test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca test_tentativas test_tabela_enquadramentos 2>&1 | tail -2
cd ../enquadramentos && PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q 2>&1 | tail -1
cd ../CTB-compilado_files && PYTHONPATH="$HOME/.cache/ctb-testdeps" python3 -m pytest -q tests/ 2>&1 | tail -1
cd .. && npm run radar:test 2>&1 | grep -E "^# (pass|fail)"
DOCKER_CONFIG=<pasta com config.json {}> COMPOSE_PROJECT_NAME=deploycheck docker compose --env-file .env -f deploy/docker-compose.yml -f deploy/docker-compose.ngrok.yml build pipeline 2>&1 | tail -2
```
Expected: pipeline `OK` (270, ou 271 com a Task 5); extrator `22 passed`; CTB todos passando; JS `# pass 132`, `# fail 0`; a imagem do pipeline constrói (prova de que o `COPY` da tabela funciona). Não recriar os contêineres do projeto `deploy` (ambiente vivo): o rebuild de verdade é do Klaus, depois do merge.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md PROGRESSO.md PENDENCIAS.md
git commit -q -F - <<'EOF'
docs: enquadramento por lista com a tabela da SENATRAN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```
