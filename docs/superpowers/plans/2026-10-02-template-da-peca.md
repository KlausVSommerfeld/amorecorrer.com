# Template da peça — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a peça em PDF passa a ser a peça final que o cliente imprime, assina e protocola: moldura escrita pelo código (endereçamento, título, quadro de campos, qualificação, pedido, fecho, numeração) no estilo "Notificação e Resposta", com o DeepSeek escrevendo só "Dos fatos" e "Dos fundamentos".

**Architecture:** `pipeline/peca.py` (puro, sem dependências) monta uma `Peca` a partir do rascunho do modelo e do caso; `pipeline/pdf_peca.py` (reportlab + pyphen) desenha a `Peca`. `velocidade.py` passa a informar o inciso da conta, `base_legal.py` decide quando cabe o pedido de advertência (art. 267) e o põe na base, e o `worker.py` junta tudo. O prompt pede as duas seções com títulos fixos; o código corta por eles e degrada para seção única sem derrubar o caso.

**Tech Stack:** Python 3 (stdlib `unittest`), reportlab 4.4.0, pyphen 0.18.1, Source Serif 4 e IBM Plex Mono (TTF, OFL).

**Spec:** `docs/superpowers/specs/2026-10-02-template-da-peca-design.md`

## Global Constraints

- Testes Python rodam **fora do venv**, de dentro de `pipeline/`: `python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade` (+ `test_pdf_peca`, que se pula sozinho sem reportlab/pyphen). **Nunca `unittest discover`** — `test_resend_smtp.py` manda e-mail real ao ser importado.
- **Nunca instalar nada em `pipeline/.venv`** a partir do WSL (é venv de Windows, Python 3.14, gerido por uv). Dependências para testar no WSL: `pip install --target "$HOME/.cache/amorecorrer-pdfdeps" reportlab==4.4.0 pyphen==0.18.1 openai==1.65.0` e `PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:."`.
- `peca.py` continua **sem dependências** (não importa reportlab).
- Dado ausente vira linha em branco (`LINHA_EM_BRANCO`, 22 `_`; no quadro de campos, `LINHA_CURTA`, 10 `_`), nunca `[marcador]`.
- Nada de marca, logo, `case_id` ou "rascunho" **dentro da peça**.
- O worker nunca derruba um caso pago por questão de forma; só rascunho vazio depois da limpeza vai a `failed`.
- Sem mudança no formulário, na Edge, no banco ou no Storage path.
- A chave do DeepSeek só como variável de processo, nunca impressa.
- Trabalho na branch `feat/template-da-peca`, a partir de `main`. Commits terminam com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
  ```
- Sem deploy (o pipeline não roda em produção, #11). Merge e push só com o Klaus.

## Review Focus

1. **Título de seção na mesma linha do texto** ("DOS FATOS: No dia 14/08…") — o corte precisa reconhecer o título e manter o texto. Teste em Task 5 (`test_titulo_na_mesma_linha_do_texto`).
2. **Dados do cliente com `&`, `<` ou `>`** (endereço "Rua A & B <fundos>") — o PDF mostra o texto literal, sem quebrar. Teste em Task 6 (`test_dados_do_caso_com_marcacao`).
3. **Valores longos no quadro de quatro colunas do recurso** (nº de notificação extenso, linhas em branco) — quebram dentro da célula, sem estourar a página. Teste em Task 6 (`test_quadro_do_recurso_com_valores_longos`).
4. **Infração leve fora do art. 218** (art. 181, II) — também recebe o pedido de advertência. Teste em Task 2 (`test_leve_fora_do_218_cabe`).
5. **`data_infracao` com sufixo de fuso** ("2026-08-14T07:52:00+00:00", se o read model mudar) — continua mostrando o relógio de parede do auto (07:52), sem conversão. Teste em Task 4 (`test_data_com_fuso_nao_converte`).

---

### Task 0: Branch

- [ ] **Step 1: Criar a branch**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b feat/template-da-peca
```

Expected: `Switched to a new branch 'feat/template-da-peca'`.

---

### Task 1: `velocidade.py` — inciso da conta e bloco que não pede

**Files:**
- Modify: `pipeline/velocidade.py` (dataclass `Bloco`, textos de `bloco_velocidade`)
- Test: `pipeline/test_velocidade.py`

**Interfaces:**
- Produces: `Bloco(texto: str, situacao: str, inciso_da_conta: str | None = None)` — `inciso_da_conta` é `"I"|"II"|"III"` em `desclassificacao` e `None` em `sem_infracao`.

- [ ] **Step 1: Atualizar os testes**

Em `pipeline/test_velocidade.py`, substituir `test_sem_infracao_pede_arquivamento` e `test_auto_mais_grave_pede_desclassificacao` por:

```python
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pipeline && python3 -m unittest test_velocidade -v 2>&1 | tail -5`
Expected: FAIL/ERROR — `AttributeError: 'Bloco' object has no attribute 'inciso_da_conta'` e "Sustente nos fundamentos" não encontrado.

- [ ] **Step 3: Implementar**

Em `pipeline/velocidade.py`, a dataclass:

```python
@dataclass(frozen=True)
class Bloco:
    texto: str
    situacao: str  # "sem_infracao" | "desclassificacao"
    inciso_da_conta: str | None = None  # o inciso que a conta mostra (só em desclassificacao)
```

No ramo `sem_infracao`, trocar a última linha da instrução:

```python
                "Instrução para a redação: Sustente nos fundamentos que o auto é inconsistente "
                "(art. 281, § 1º, I, do CTB), porque a velocidade considerada no próprio auto não "
                "supera a máxima permitida; o pedido é escrito à parte, não o escreva. "
                "Não calcule percentuais."
```

No ramo `desclassificacao`, o `return` passa a ser:

```python
        return Bloco(
            situacao="desclassificacao",
            inciso_da_conta=pela_conta,
            texto=(
                f"{cabecalho}\n"
                f"- Velocidade considerada de {considerada} km/h sobre a máxima de {permitida} km/h: "
                f"excesso de {pct}, que corresponde ao inciso {pela_conta} do art. 218.\n"
                f"- O auto enquadrou a conduta no inciso {do_auto} do art. 218.\n"
                f"Instrução para a redação: Sustente nos fundamentos que a conduta corresponde ao "
                f"inciso {pela_conta} do art. 218, e não ao inciso {do_auto} do auto, e que o auto é "
                "inconsistente (art. 281, § 1º, I); o pedido é escrito à parte, não o escreva. "
                "Não calcule outros percentuais."
            ),
        )
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pipeline && python3 -m unittest test_velocidade -v 2>&1 | tail -3`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/velocidade.py pipeline/test_velocidade.py
git commit -m "feat(velocidade): bloco informa o inciso da conta e não manda mais requerer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 2: `base_legal.py` — natureza, advertência e art. 267 na base

**Files:**
- Modify: `pipeline/base_legal.py` (novas `natureza`, `cabe_advertencia`; `montar_base` ganha `artigos_do_pedido`)
- Test: `pipeline/test_base_legal.py`

**Interfaces:**
- Produces:
  - `natureza(c: Ctb, dispositivo: str) -> tuple[str, str] | None` — (`infracao`, `penalidade`) do `ctb_infracoes.json`.
  - `cabe_advertencia(c: Ctb, enquadramento: str | None, inciso_da_conta: str | None) -> bool`.
  - `montar_base(c: Ctb, amparo_legal: str | None, artigos_do_pedido: tuple[str, ...] = ()) -> BaseLegal`.

- [ ] **Step 1: Escrever os testes**

Em `pipeline/test_base_legal.py`, ampliar o import:

```python
from base_legal import (
    BaseLegalIndisponivel,
    cabe_advertencia,
    carregar_ctb,
    montar_base,
    natureza,
    numero_vigente,
)
```

E acrescentar, antes de `if __name__ == "__main__":`:

```python
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pipeline && python3 -m unittest test_base_legal -v 2>&1 | tail -4`
Expected: ERROR — `ImportError: cannot import name 'cabe_advertencia'`.

- [ ] **Step 3: Implementar**

Em `pipeline/base_legal.py`, `montar_base` passa a ser:

```python
def montar_base(c: Ctb, amparo_legal: str | None, artigos_do_pedido: tuple[str, ...] = ()) -> BaseLegal:
    """`artigos_do_pedido`: artigos que o pedido escrito pelo código cita (hoje só o
    267, quando cabe advertência) — entram com remissões, para que nenhuma citação
    fora da base chegue ao PDF (spec 2026-10-02, §4.3)."""
    processuais = [n for n in c.consulta.PROCESSUAIS_PADRAO if numero_vigente(c, n)]
    enq = _enquadramento(c, amparo_legal)
    citacao, proprio = enq if enq else (None, None)
    tabela = [n for n in EXTRAS_POR_ARTIGO.get(proprio, ()) if numero_vigente(c, n)] if proprio else []
    do_pedido = [n for n in (numero_vigente(c, a) for a in artigos_do_pedido) if n]
    inicio = ([proprio] if proprio else []) + tabela + do_pedido + processuais
    # O que o rito e o enquadramento já trazem não se repete: o contexto_peticao
    # renderizaria o artigo duas vezes.
    extras = [n for n in _fecho(c, inicio) if n != proprio and n not in processuais]
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

E, depois de `montar_base`:

```python
def natureza(c: Ctb, dispositivo: str) -> tuple[str, str] | None:
    """(natureza, penalidade) do bloco de sanção do dispositivo, ou None."""
    if not dispositivo or not str(dispositivo).strip():
        return None
    try:
        inf = c.ctb.infracao(str(dispositivo))
    except (c.consulta.ReferenciaInvalida, KeyError, ValueError):
        return None
    if not inf or not inf.get("infracao"):
        return None
    return str(inf["infracao"]), str(inf.get("penalidade") or "")


# CTB, art. 267: "Deverá ser imposta a penalidade de advertência por escrito à
# infração de natureza leve ou média, passível de ser punida com multa…"
_NATUREZAS_COM_ADVERTENCIA = frozenset({"leve", "média"})


def cabe_advertencia(c: Ctb, enquadramento: str | None, inciso_da_conta: str | None) -> bool:
    """Spec 2026-10-02, §3.4. Com desclassificação, vale a natureza do inciso da
    conta; sem enquadramento reconhecido, nada é adivinhado."""
    if not enquadramento:
        return False
    alvo = f"art. 218, {inciso_da_conta}" if inciso_da_conta else enquadramento
    nat = natureza(c, alvo)
    return bool(nat) and nat[0] in _NATUREZAS_COM_ADVERTENCIA and "multa" in nat[1].lower()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pipeline && python3 -m unittest test_base_legal test_conferencia -v 2>&1 | tail -3`
Expected: `OK` (a conferência usa `montar_base` e não pode mudar de comportamento).

- [ ] **Step 5: Commit**

```bash
git add pipeline/base_legal.py pipeline/test_base_legal.py
git commit -m "feat(base-legal): natureza da infração, regra do art. 267 e artigos do pedido na base" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 3: `prompt.py` — duas seções com títulos fixos

**Files:**
- Modify: `pipeline/prompt.py` (`SYSTEM_PROMPT_BASE`, comentário acima dela, cabeçalho de `build_case_context`)
- Test: `pipeline/test_prompt.py`

**Interfaces:**
- Produces: `SYSTEM_PROMPT_BASE` manda escrever exatamente `DOS FATOS` e `DOS FUNDAMENTOS`; `build_case_context` abre com `"Dados do caso:\n"`.

- [ ] **Step 1: Atualizar os testes**

Em `pipeline/test_prompt.py`:

1. Em `CONTEXTO_ANTIGO`, trocar `"Dados do caso para o recurso:\n"` por `"Dados do caso:\n"`.
2. Em `test_bloco_logo_depois_do_cabecalho`, trocar `"Dados do caso para o recurso:\nVerificação metrológica"` por `"Dados do caso:\nVerificação metrológica"`.
3. Substituir `test_termina_no_pedido_sem_local_data_nem_assinatura`, `test_nao_escreve_enderecamento` e `test_mantem_o_nucleo_antigo` por:

```python
    # Spec 2026-10-02: o código escreve a moldura (peca.montar_peca); o modelo,
    # só as duas seções, com títulos que o código usa para cortar.
    def test_pede_as_duas_secoes_com_titulos_fixos(self):
        self.assertIn("DOS FATOS (1 a 2 parágrafos)", SYSTEM_PROMPT_BASE)
        self.assertIn("DOS FUNDAMENTOS (2 a 4 parágrafos)", SYSTEM_PROMPT_BASE)
        self.assertIn("cada uma aberta pelo título em linha própria", SYSTEM_PROMPT_BASE)

    def test_nao_escreve_a_moldura(self):
        for proibido in ("endereçamento", "vocativo", "qualificação", "pedido",
                         "\"pede deferimento\"", "local, data nem assinatura"):
            with self.subTest(proibido=proibido):
                self.assertIn(proibido, SYSTEM_PROMPT_BASE)
        self.assertIn("termine no último parágrafo dos fundamentos", SYSTEM_PROMPT_BASE)
        self.assertNotIn("Nestes termos, pede deferimento.", SYSTEM_PROMPT_BASE)

    # Diagnóstico de 02/10/2026: tudo dizia "recurso" e o modelo endereçou uma
    # defesa prévia à JARI.
    def test_nucleo_fala_em_defesas_e_recursos(self):
        self.assertTrue(SYSTEM_PROMPT_BASE.startswith(
            "Você é um assistente jurídico que redige defesas e recursos de multa de trânsito "
            "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
            "Não invente dados ausentes"))
        self.assertNotIn("Produza 2 a 4 parágrafos.", SYSTEM_PROMPT_BASE)
        self.assertTrue(build_case_context({"nome": "X"}).startswith("Dados do caso:\n"))
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pipeline && python3 -m unittest test_prompt -v 2>&1 | tail -4`
Expected: FAIL nos três testes novos e nos dois do cabeçalho.

- [ ] **Step 3: Implementar**

Em `pipeline/prompt.py`, substituir o comentário e a constante `SYSTEM_PROMPT_BASE` (linhas 14–28) por:

```python
# A forma da peça é do código (peca.montar_peca, spec 2026-10-02): endereçamento,
# título, quadro, qualificação, pedido e fecho. O modelo escreve só as duas
# seções, com títulos fixos que o código usa para cortar. Da rodada de
# 25/09/2026 ficaram o texto puro e a proibição de prefácio e notas; do
# diagnóstico de 02/10/2026, o núcleo em "defesas e recursos" (só "recurso"
# levou o modelo a endereçar uma defesa prévia à JARI).
SYSTEM_PROMPT_BASE = (
    "Você é um assistente jurídico que redige defesas e recursos de multa de trânsito "
    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
    "Não invente dados ausentes: quando um dado necessário não constar do formulário, "
    "deixe uma linha em branco para preenchimento (________), nunca um marcador entre "
    "colchetes. Escreva apenas duas seções, cada uma aberta pelo título em linha própria, "
    "exatamente assim: DOS FATOS (1 a 2 parágrafos) e DOS FUNDAMENTOS (2 a 4 parágrafos). "
    "Escreva em texto puro: sem markdown (nada de asteriscos, cerquilhas ou linhas de "
    "traços), sem introdução e sem observações ou notas dirigidas a quem pediu a peça. "
    "Não escreva endereçamento, vocativo, qualificação de quem apresenta a peça, pedido, "
    "\"pede deferimento\", local, data nem assinatura: tudo isso é acrescentado depois; "
    "termine no último parágrafo dos fundamentos."
)
```

Em `build_case_context`, trocar `cabecalho = "Dados do caso para o recurso:\n"` por `cabecalho = "Dados do caso:\n"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pipeline && python3 -m unittest test_prompt test_conferencia -v 2>&1 | tail -3`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/prompt.py pipeline/test_prompt.py
git commit -m "feat(prompt): o modelo escreve só DOS FATOS e DOS FUNDAMENTOS" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 4: `peca.py` — o texto que o código escreve

**Files:**
- Modify: `pipeline/peca.py` (constantes e funções novas; `fecho` passa a usar `_local`)
- Test: `pipeline/test_peca.py`

**Interfaces:**
- Consumes: `DEFESA_PREVIA`, `RECURSO_JARI`, `LINHA_EM_BRANCO`, `_cpf`, `fecho` (já existem em `peca.py`).
- Produces:
  - `LINHA_CURTA = "__________"`, `ABERTURA_PEDIDO = "Diante do exposto, requer:"`
  - `titulo(case) -> str | None` — `"DEFESA PRÉVIA"` / `"RECURSO À JARI"` / `None`
  - `data_da_infracao(valor) -> str`
  - `campos(case) -> tuple[tuple[str, str], ...]`
  - `qualificacao(case) -> str`
  - `pedido(case, situacao_velocidade: str | None, inciso_da_conta: str | None, cabe_advertencia: bool) -> tuple[str, ...]` — itens já com letra e pontuação
  - `nome_arquivo(case) -> str`, `titulo_documento(case) -> str`, `corpo_do_email(case_id: str) -> str`

- [ ] **Step 1: Escrever os testes**

Em `pipeline/test_peca.py`, ampliar o import de `peca` com `ABERTURA_PEDIDO, LINHA_CURTA, LINHA_EM_BRANCO, campos, corpo_do_email, data_da_infracao, nome_arquivo, pedido, qualificacao, titulo, titulo_documento` e acrescentar, antes de `class TestParagrafoParaPdf`:

```python
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pipeline && python3 -m unittest test_peca -v 2>&1 | tail -4`
Expected: ERROR — `ImportError: cannot import name 'ABERTURA_PEDIDO'`.

- [ ] **Step 3: Implementar**

Em `pipeline/peca.py`:

(a) Logo abaixo de `LINHA_EM_BRANCO = …`:

```python
LINHA_CURTA = "__________"  # no quadro de campos: a linha longa não cabe na célula
ABERTURA_PEDIDO = "Diante do exposto, requer:"
_ADVERTENCIA = (
    "subsidiariamente, não havendo outra infração cometida nos últimos 12 (doze) meses, a "
    "aplicação da penalidade de advertência por escrito em substituição à multa, nos termos "
    "do art. 267 do CTB"
)
```

(b) Depois das constantes `DEFESA_PREVIA`/`RECURSO_JARI`:

```python
# Título na peça, nome no metadado do PDF, prefixo do arquivo.
_NOMES = {
    DEFESA_PREVIA: ("DEFESA PRÉVIA", "Defesa prévia", "defesa-previa"),
    RECURSO_JARI: ("RECURSO À JARI", "Recurso à JARI", "recurso-jari"),
}
_DATA = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?")
```

(c) Substituir a função `fecho` por esta versão com `_local` extraído (mesma saída):

```python
def _local(case: dict[str, Any]) -> str:
    cidade = str(case.get("cidade") or "").strip()
    uf = str(case.get("estado") or "").strip().upper()
    return f"{cidade}/{uf}" if cidade and uf else (cidade or LINHA_EM_BRANCO)


def fecho(case: dict[str, Any]) -> str:
    nome = str(case.get("nome") or "").strip() or LINHA_EM_BRANCO
    return (
        f"{_local(case)}, ____ de ______________ de ________.\n\n"
        "______________________________\n"
        f"{nome}\n"
        f"CPF {_cpf(case.get('cpf'))}"
    )
```

(d) Acrescentar, depois de `fecho`:

```python
def _txt(case: dict[str, Any], chave: str) -> str:
    return str(case.get(chave) or "").strip()


def _estagio(case: dict[str, Any]) -> str | None:
    estagio = _txt(case, "especie_documento")
    return estagio if estagio in _NOMES else None


def titulo(case: dict[str, Any]) -> str | None:
    estagio = _estagio(case)
    return _NOMES[estagio][0] if estagio else None


def data_da_infracao(valor: Any) -> str:
    """O relógio de parede do auto (`timestamp` sem fuso): nunca se converte."""
    texto = str(valor or "").strip()
    m = _DATA.match(texto)
    if not m:
        return texto
    ano, mes, dia, hora, minuto = m.groups()
    return f"{dia}/{mes}/{ano}" + (f" {hora}:{minuto}" if hora else "")


def campos(case: dict[str, Any]) -> tuple[tuple[str, str], ...]:
    auto = ("Auto de infração", _txt(case, "numero_auto") or LINHA_CURTA)
    placa = ("Placa", _txt(case, "placa").upper() or LINHA_CURTA)
    data = ("Data da infração", data_da_infracao(case.get("data_infracao")) or LINHA_CURTA)
    if _estagio(case) == RECURSO_JARI:
        notificacao = ("Notificação de penalidade", _txt(case, "notificacao_penalidade") or LINHA_CURTA)
        return (auto, notificacao, placa, data)
    return (auto, placa, data)


def _cep(valor: Any) -> str:
    texto = str(valor or "").strip()
    digitos = re.sub(r"\D", "", texto)
    if len(digitos) == 8:
        return f"{digitos[:5]}-{digitos[5:]}"
    return texto or LINHA_CURTA


def qualificacao(case: dict[str, Any]) -> str:
    """Sem marca de gênero: o formulário não pergunta (spec 2026-10-02, §3.2)."""
    estagio = _estagio(case)
    auto = _txt(case, "numero_auto") or LINHA_EM_BRANCO
    partes = [
        _txt(case, "nome").upper() or LINHA_EM_BRANCO,
        f"CPF nº {_cpf(case.get('cpf'))}",
    ]
    cnh = _txt(case, "cnh")
    if cnh:  # quem recorre pode ser o proprietário que não dirigia
        partes.append(f"CNH nº {cnh}")
    partes.append(
        f"com endereço em {_txt(case, 'endereco') or LINHA_EM_BRANCO}, "
        f"CEP {_cep(case.get('cep'))}, {_local(case)}"
    )
    partes.append(f"e-mail {_txt(case, 'email') or LINHA_EM_BRANCO}")
    if estagio == RECURSO_JARI:
        notificacao = _txt(case, "notificacao_penalidade") or LINHA_EM_BRANCO
        ato = (
            f"interpor RECURSO contra a penalidade imposta na Notificação de Penalidade nº "
            f"{notificacao}, referente ao Auto de Infração nº {auto}"
        )
    else:
        peca = "DEFESA PRÉVIA" if estagio == DEFESA_PREVIA else LINHA_EM_BRANCO
        ato = f"apresentar {peca} em face do Auto de Infração nº {auto}"
    return ", ".join(partes) + f", vem, respeitosamente, {ato}, pelos fundamentos a seguir expostos."


def pedido(
    case: dict[str, Any],
    situacao_velocidade: str | None,
    inciso_da_conta: str | None,
    cabe_advertencia: bool,
) -> tuple[str, ...]:
    """O pedido é do código (spec 2026-10-02, §3.3): o modelo nunca formula um
    pedido contra o cliente nem esquece o principal. A ordem da desclassificação
    é a da spec de 30/09/2026."""
    recurso = _estagio(case) == RECURSO_JARI
    auto = _txt(case, "numero_auto") or LINHA_EM_BRANCO
    inconsistencia = (
        f"o arquivamento do Auto de Infração nº {auto} por inconsistência, nos termos do "
        "art. 281, § 1º, I, do CTB"
    )
    itens: list[str] = []
    if situacao_velocidade == "sem_infracao":
        motivo = "uma vez que a velocidade considerada no próprio auto não supera a máxima permitida"
        if recurso:
            itens.append(
                f"o provimento deste recurso, com o cancelamento da penalidade imposta e {inconsistencia}, {motivo}"
            )
        else:
            itens.append(f"{inconsistencia}, {motivo}")
    elif situacao_velocidade == "desclassificacao" and inciso_da_conta:
        alvo = (
            f"para o art. 218, {inciso_da_conta}, do CTB, compatível com a velocidade "
            "considerada no próprio auto"
        )
        if recurso:
            itens.append(
                f"o provimento deste recurso, para desclassificar a infração {alvo}, com a "
                "readequação da penalidade"
            )
        else:
            itens.append(f"a desclassificação da infração {alvo}")
        itens.append(f"subsidiariamente, {inconsistencia}")
    elif recurso:
        itens.append(
            "o conhecimento e o provimento deste recurso, com o cancelamento da penalidade "
            f"imposta e o arquivamento do Auto de Infração nº {auto}"
        )
    elif _estagio(case) == DEFESA_PREVIA:
        itens.append(
            f"o acolhimento desta defesa prévia, com o arquivamento do Auto de Infração nº {auto} "
            "e a declaração de insubsistência do seu registro"
        )
    else:
        itens.append(f"o acolhimento desta peça, com o arquivamento do Auto de Infração nº {auto}")
    if cabe_advertencia:
        itens.append(_ADVERTENCIA)
    ultimo = len(itens) - 1
    return tuple(
        f"{'abcdefgh'[i]}) {item}{'.' if i == ultimo else ';'}" for i, item in enumerate(itens)
    )


def nome_arquivo(case: dict[str, Any]) -> str:
    estagio = _estagio(case)
    auto = re.sub(r"[^A-Za-z0-9-]", "", _txt(case, "numero_auto"))
    if estagio and auto:
        return f"{_NOMES[estagio][2]}-{auto}.pdf"
    case_id = re.sub(r"[^A-Za-z0-9_-]", "", _txt(case, "case_id"))
    return f"peca-{case_id}.pdf" if case_id else "peca.pdf"


def titulo_documento(case: dict[str, Any]) -> str:
    estagio = _estagio(case)
    nome = _NOMES[estagio][1] if estagio else "Peça"
    auto = _txt(case, "numero_auto")
    return f"{nome} — Auto nº {auto}" if auto else nome


def corpo_do_email(case_id: str) -> str:
    """O aviso de revisão saiu da peça (o cliente protocola o PDF como está) e
    veio para cá, em passos (spec 2026-10-02, §4.7)."""
    return (
        "Olá,\n\n"
        "Sua peça está pronta, em anexo, para você imprimir e protocolar:\n\n"
        "1. Confira os dados e preencha à mão as linhas em branco.\n"
        "2. Assine no espaço indicado.\n"
        "3. Protocole no órgão de trânsito até o prazo que consta da sua notificação — no "
        "balcão, pelos Correios ou pelo site do órgão, conforme ele aceitar.\n\n"
        "Revise o texto antes de protocolar: ele foi redigido com apoio de inteligência "
        "artificial a partir das informações que você enviou.\n\n"
        f"Identificação do pedido: {case_id}\n\n"
        "Cordialmente,\nAmo Recorrer"
    )
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pipeline && python3 -m unittest test_peca -v 2>&1 | tail -3`
Expected: `OK` (os testes antigos de `fecho` continuam passando com `_local`).

- [ ] **Step 5: Commit**

```bash
git add pipeline/peca.py pipeline/test_peca.py
git commit -m "feat(peca): título, quadro, qualificação, pedido e e-mail escritos pelo código" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 5: `peca.py` — corte das seções e `montar_peca`

**Files:**
- Modify: `pipeline/peca.py` (`Peca`, `separar_secoes`, `remover_pedido`, `montar_peca`)
- Test: `pipeline/test_peca.py`

**Interfaces:**
- Consumes: tudo da Task 4; `limpar_markdown`, `remover_prefacio`, `remover_enderecamento`, `cortar_depois_do_pedido`, `enderecamento` (já existem); `RespostaDoModeloInvalida` de `prompt.py`.
- Produces:
  - `remover_pedido(paragrafos: list[str]) -> tuple[list[str], bool]`
  - `separar_secoes(rascunho: str, nome_cliente: str = "") -> tuple[tuple[tuple[str, tuple[str, ...]], ...], bool]` — seções **sem** numeração (`"DOS FATOS"`, `"DOS FUNDAMENTOS"` ou `"DOS FATOS E DOS FUNDAMENTOS"`) e se houve pedido do modelo removido. Levanta `RespostaDoModeloInvalida` se nada sobrar.
  - `@dataclass(frozen=True) Peca` com: `enderecamento: str`, `titulo: str | None`, `campos: tuple[tuple[str, str], ...]`, `qualificacao: str`, `secoes: tuple[tuple[str, tuple[str, ...]], ...]` (títulos numerados, "I – DOS FATOS"), `titulo_pedido: str`, `abertura_pedido: str`, `pedido: tuple[str, ...]`, `fecho: str`, `nome_arquivo: str`, `titulo_documento: str`, `pedido_do_modelo_removido: bool`.
  - `montar_peca(rascunho: str, case: dict, situacao_velocidade: str | None = None, inciso_da_conta: str | None = None, cabe_advertencia: bool = False) -> Peca`

- [ ] **Step 1: Escrever os testes**

Em `pipeline/test_peca.py`, ampliar o import de `peca` com `Peca, montar_peca, remover_pedido, separar_secoes`, acrescentar `from prompt import RespostaDoModeloInvalida` e, antes de `class TestParagrafoParaPdf`:

```python
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pipeline && python3 -m unittest test_peca -v 2>&1 | tail -4`
Expected: ERROR — `ImportError: cannot import name 'Peca'`.

- [ ] **Step 3: Implementar**

Em `pipeline/peca.py`:

(a) Imports: acrescentar `from dataclasses import dataclass` e, depois de `from typing import Any`, `from prompt import RespostaDoModeloInvalida`.

(b) Junto das outras regex do topo:

```python
# Título de seção (spec 2026-10-02, §4.1): numeração opcional ("I –", "1.", "I)"),
# caixa qualquer, dois pontos; e o texto pode vir na mesma linha depois de ":" ou "–".
_TITULO_SECAO = re.compile(
    r"^\s*(?:(?:[IVX]+|\d+)\s*[-–—.)]\s*)?"
    r"(?P<nome>(?:d[oa]s?\s+)?fatos\s+e\s+(?:d[oa]s?\s+)?fundamentos(?:\s+jur[ií]dicos)?"
    r"|d[oa]s?\s+fatos"
    r"|d[oa]s?\s+fundamentos(?:\s+jur[ií]dicos)?"
    r"|d[oa]\s+direito"
    r"|d[oa]s?\s+pedidos?"
    r"|d[oa]s?\s+requerimentos?)"
    r"\s*(?:$|[:–—-]\s*(?P<resto>.*)$)",
    re.IGNORECASE,
)
# Fecho de pedido que o modelo escreve no fim, apesar do prompt.
_PEDIDO_FINAL = re.compile(
    r"^(?:diante do exposto|ante o exposto|pelo exposto|por todo o exposto|ante todo o exposto|"
    r"isto posto|posto isso|assim sendo|nestes termos|termos em que)\b",
    re.IGNORECASE,
)
_PEDE_DEFERIMENTO_NO_FIM = re.compile(
    r"\s*(?:nestes termos|termos em que),?\s*(?:pede|espera|aguarda|requer)\s+deferimento\.?\s*$",
    re.IGNORECASE,
)
_VEM = re.compile(r"\bvem\b,?\s", re.IGNORECASE)
_CAMPO_SOLTO = re.compile(r"^[^:\n]{2,40}:\s*\S.{0,80}$")
_ROMANOS = ("I", "II", "III", "IV")
```

(c) Depois de `cortar_depois_do_pedido`:

```python
def remover_pedido(paragrafos: list[str]) -> tuple[list[str], bool]:
    """Tira do fim o pedido e o "pede deferimento" que o modelo escrever: o pedido
    é do código. Fundamento que começa por "Ante o exposto" sem requerer nada fica."""
    pars = list(paragrafos)
    removido = False
    while pars and _PEDIDO_FINAL.match(pars[-1]) and re.search(r"requer|deferimento", pars[-1], re.I):
        pars.pop()
        removido = True
    if pars:
        sem_fecho = _PEDE_DEFERIMENTO_NO_FIM.sub("", pars[-1]).strip()
        if sem_fecho != pars[-1]:
            removido = True
            if sem_fecho:
                pars[-1] = sem_fecho
            else:
                pars.pop()
    return pars, removido


def _tipo_de_secao(nome: str) -> str:
    n = nome.lower()
    if "pedido" in n or "requerimento" in n:
        return "pedido"
    if "fatos" in n and "fundamentos" in n:
        return "ambos"
    return "fatos" if "fatos" in n else "fundamentos"


def _blocos(linhas: list[str]) -> list[str]:
    return [b for b in re.split(r"\n[ \t]*\n", "\n".join(linhas)) if b.strip()]


def _juntar(bloco: str) -> str:
    # Linhas quebradas pelo modelo dentro de um parágrafo: no PDF justificado,
    # cada "\n" viraria quebra forçada.
    return " ".join(linha.strip() for linha in bloco.split("\n") if linha.strip())


def _cabecalho_solto(bloco: str) -> bool:
    """"DEFESA PRÉVIA", "Auto de Infração nº: E123" — o que o modelo antigo punha no topo."""
    linhas = [l.strip() for l in bloco.split("\n") if l.strip()]
    # Frase terminada em ponto é texto, não cabeçalho ("[Modo sem IA: …] Rascunho indisponível.").
    return all(
        len(l) <= 80 and not l.endswith(".")
        and (not re.search(r"[a-zà-ÿ]", l) or _CAMPO_SOLTO.match(l))
        for l in linhas
    )


def _e_qualificacao(paragrafo: str, nome_cliente: str) -> bool:
    inicio = paragrafo[:700]
    pelo_nome = bool(nome_cliente) and paragrafo.lower().startswith(nome_cliente.lower())
    return bool(_VEM.search(inicio)) and (pelo_nome or "CPF" in inicio)


def separar_secoes(
    rascunho: str, nome_cliente: str = ""
) -> tuple[tuple[tuple[str, tuple[str, ...]], ...], bool]:
    """Corta o rascunho em DOS FATOS / DOS FUNDAMENTOS; sem os títulos, seção única.
    Devolve (seções sem numeração, houve pedido do modelo removido)."""
    t = remover_prefacio(limpar_markdown(rascunho))
    t = cortar_depois_do_pedido(remover_enderecamento(t))
    linhas: dict[str, list[str]] = {"antes": [], "fatos": [], "fundamentos": [], "ambos": []}
    atual, titulos, removido = "antes", set(), False
    for linha in t.split("\n"):
        m = _TITULO_SECAO.match(linha)
        if m:
            tipo = _tipo_de_secao(m.group("nome"))
            if tipo == "pedido":
                removido = True
                break
            atual = tipo
            titulos.add(tipo)
            if (m.group("resto") or "").strip():
                linhas[atual].append(m.group("resto").strip())
            continue
        linhas[atual].append(linha)

    antes = _blocos(linhas["antes"])
    while antes and _cabecalho_solto(antes[0]):
        antes.pop(0)
    antes = [_juntar(b) for b in antes]
    if antes and _e_qualificacao(antes[0], nome_cliente):
        antes.pop(0)

    def pars(chave: str) -> list[str]:
        return [_juntar(b) for b in _blocos(linhas[chave])]

    if titulos & {"fatos", "fundamentos"}:
        secoes = [
            ("DOS FATOS", pars("fatos") if "fatos" in titulos else antes),
            ("DOS FUNDAMENTOS", pars("fundamentos") + pars("ambos")),
        ]
    else:
        secoes = [("DOS FATOS E DOS FUNDAMENTOS", pars("ambos") if "ambos" in titulos else antes)]

    secoes = [(nome, p) for nome, p in secoes if p]
    if secoes:
        nome, ultimos = secoes[-1]
        ultimos, r = remover_pedido(ultimos)
        removido = removido or r
        secoes[-1] = (nome, ultimos)
        secoes = [(nome, p) for nome, p in secoes if p]
    if not secoes:
        raise RespostaDoModeloInvalida("peça sem fatos nem fundamentos depois da limpeza")
    return tuple((nome, tuple(p)) for nome, p in secoes), removido
```

(d) A dataclass e a montagem, no fim do módulo (antes de `paragrafo_para_pdf`):

```python
@dataclass(frozen=True)
class Peca:
    """Tudo o que o PDF desenha, já em texto (pdf_peca.gerar_pdf só desenha)."""

    enderecamento: str
    titulo: str | None
    campos: tuple[tuple[str, str], ...]
    qualificacao: str
    secoes: tuple[tuple[str, tuple[str, ...]], ...]
    titulo_pedido: str
    abertura_pedido: str
    pedido: tuple[str, ...]
    fecho: str
    nome_arquivo: str
    titulo_documento: str
    pedido_do_modelo_removido: bool


def montar_peca(
    rascunho: str,
    case: dict[str, Any],
    situacao_velocidade: str | None = None,
    inciso_da_conta: str | None = None,
    cabe_advertencia: bool = False,
) -> Peca:
    secoes, removido = separar_secoes(rascunho, _txt(case, "nome"))
    return Peca(
        enderecamento=enderecamento(case),
        titulo=titulo(case),
        campos=campos(case),
        qualificacao=qualificacao(case),
        secoes=tuple((f"{_ROMANOS[i]} – {nome}", p) for i, (nome, p) in enumerate(secoes)),
        titulo_pedido=f"{_ROMANOS[len(secoes)]} – DO PEDIDO",
        abertura_pedido=ABERTURA_PEDIDO,
        pedido=pedido(case, situacao_velocidade, inciso_da_conta, cabe_advertencia),
        fecho=fecho(case),
        nome_arquivo=nome_arquivo(case),
        titulo_documento=titulo_documento(case),
        pedido_do_modelo_removido=removido,
    )
```

`texto_da_peca` **fica** por enquanto (o worker ainda o usa; sai na Task 7).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pipeline && python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade 2>&1 | tail -3`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/peca.py pipeline/test_peca.py
git commit -m "feat(peca): corte em fatos e fundamentos, pedido do modelo removido e montar_peca" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 6: `pdf_peca.py` — a página, as fontes e o pyphen

**Files:**
- Create: `pipeline/fontes/SourceSerif4-Regular.ttf`, `SourceSerif4-Semibold.ttf`, `SourceSerif4-Bold.ttf`, `SourceSerif4-It.ttf`, `IBMPlexMono-Regular.ttf`, `IBMPlexMono-Medium.ttf`, `OFL-SourceSerif4.md`, `OFL-IBMPlexMono.txt`
- Create: `pipeline/pdf_peca.py`, `pipeline/test_pdf_peca.py`
- Modify: `pipeline/requirements.txt` (+ `pyphen==0.18.1`), `pipeline/main.py` (fontes no startup)

**Interfaces:**
- Consumes: `Peca`, `montar_peca`, `paragrafo_para_pdf` de `peca.py`.
- Produces: `gerar_pdf(peca: Peca) -> bytes`; `registrar_fontes() -> None`; `FonteAusente(RuntimeError)`; `_CanvasNumerado` (desenha "página/total" com `drawRightString`).

- [ ] **Step 1: Baixar as fontes e as licenças**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && mkdir -p fontes
TMP=$(mktemp -d)
curl -sL -o "$TMP/ss4.zip" https://github.com/adobe-fonts/source-serif/releases/download/4.005R/source-serif-4.005_Desktop.zip
python3 - "$TMP/ss4.zip" <<'EOF'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
raiz = "source-serif-4.005_Desktop/"
for n in ("Regular", "Semibold", "Bold", "It"):
    open(f"fontes/SourceSerif4-{n}.ttf", "wb").write(z.read(f"{raiz}TTF/SourceSerif4-{n}.ttf"))
open("fontes/OFL-SourceSerif4.md", "wb").write(z.read(f"{raiz}LICENSE.md"))
EOF
for f in IBMPlexMono-Regular.ttf IBMPlexMono-Medium.ttf; do
  curl -sL -o "fontes/$f" "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/$f"
done
curl -sL -o fontes/OFL-IBMPlexMono.txt https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt
sha256sum fontes/*.ttf
```

Expected (conferidos em 02/10/2026; se diferirem, parar e avisar o Klaus):
```
a9b4c49bb299e05b5f6c481e7fb5e78943d2793249a0c8874ab574a2d1ea6755  fontes/IBMPlexMono-Medium.ttf
6a3412f058c7d8dfd9170c41e85ade48e5156ecb89356110ca57a0a27734af46  fontes/IBMPlexMono-Regular.ttf
7cf4f4e1ad74f45058d5bc61716b82560442fbdcd9d3654d2dea96bf6c683d86  fontes/SourceSerif4-Bold.ttf
9d2950a8f1da66e21502c35d646a1d2148e79f9ea43fd2158cf02f5232e7f430  fontes/SourceSerif4-It.ttf
e5a4ee6a3d87bb9024796be390c6771e2a0eb1883dae25effaf57ca01668e24b  fontes/SourceSerif4-Regular.ttf
36db62940cb5728b12b1802476dc7fcf4c6c519a7bdd476ba23a4e555fc4655f  fontes/SourceSerif4-Semibold.ttf
```

E `head -3 fontes/OFL-SourceSerif4.md fontes/OFL-IBMPlexMono.txt` mostra "SIL Open Font License" nas duas.

- [ ] **Step 2: Dependências de teste fora do venv**

```bash
pip install -q --target "$HOME/.cache/amorecorrer-pdfdeps" reportlab==4.4.0 pyphen==0.18.1 openai==1.65.0
```

Expected: sem erro. (Nunca em `pipeline/.venv`.)

- [ ] **Step 3: Escrever os testes**

Criar `pipeline/test_pdf_peca.py`:

```python
"""Testes de pdf_peca.py. Precisam de reportlab e pyphen; sem eles, pulam.
Fora do venv, de dentro de pipeline/:

    PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_pdf_peca -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from peca import DEFESA_PREVIA, RECURSO_JARI, montar_peca

TEM_DEPS = all(importlib.util.find_spec(m) for m in ("reportlab", "pyphen"))
if TEM_DEPS:
    import pdf_peca
    from pdf_peca import FonteAusente, gerar_pdf

CASO = {
    "case_id": "CASO_abc", "nome": "Mariana Souza Lima", "cpf": "52998224725",
    "cnh": "04512345678", "endereco": "Rua das Laranjeiras, 120, apto 302", "cep": "22240003",
    "cidade": "Rio de Janeiro", "estado": "RJ", "email": "mariana@example.com",
    "orgao_autuador": "CET-RIO", "numero_auto": "E123456789", "placa": "RIO2A19",
    "data_infracao": "2026-08-14T07:52:00", "especie_documento": DEFESA_PREVIA,
}
RASCUNHO = (
    "DOS FATOS\n\nNo dia 14/08/2026, às 07h52, o veículo foi autuado na Av. Brasil, altura do "
    "nº 5000, com velocidade considerada de 90 km/h em via de 80 km/h.\n\n"
    "DOS FUNDAMENTOS\n\nO art. 90 do CTB afasta a sanção quando a sinalização é insuficiente, "
    "e não havia placa de velocidade no trecho."
)


def peca(rascunho=RASCUNHO, caso=CASO):
    return montar_peca(rascunho, caso, "desclassificacao", "I", True)


@unittest.skipUnless(TEM_DEPS, "precisa de reportlab e pyphen (venv ou PYTHONPATH)")
class TestGerarPdf(unittest.TestCase):
    def test_pdf_valido_com_as_fontes_embutidas(self):
        b = gerar_pdf(peca())
        self.assertTrue(b.startswith(b"%PDF-"))
        for fonte in (b"SourceSerif4-Regular", b"SourceSerif4-Semibold", b"SourceSerif4-Bold",
                      b"IBMPlexMono-Regular", b"IBMPlexMono-Medium"):
            with self.subTest(fonte=fonte):
                self.assertIn(fonte, b)
        self.assertNotIn(b"/BaseFont /Helvetica", b)

    def test_numeracao_em_toda_pagina(self):
        longo = "Parágrafo com texto suficiente para ocupar várias linhas da página impressa. " * 6
        rascunho = ("DOS FATOS\n\n" + "\n\n".join([longo] * 5)
                    + "\n\nDOS FUNDAMENTOS\n\n" + "\n\n".join([longo] * 8))
        with mock.patch.object(pdf_peca._CanvasNumerado, "drawRightString") as desenho:
            gerar_pdf(peca(rascunho))
        numeros = [chamada.args[2] for chamada in desenho.call_args_list]
        self.assertGreaterEqual(len(numeros), 2)
        self.assertEqual(numeros, [f"{i}/{len(numeros)}" for i in range(1, len(numeros) + 1)])

    def test_texto_do_modelo_com_marcacao(self):
        b = gerar_pdf(peca("DOS FATOS\n\nValor <b>x</b> & <script>.\n\nDOS FUNDAMENTOS\n\nArt. 90 & <i>."))
        self.assertTrue(b.startswith(b"%PDF-"))

    def test_dados_do_caso_com_marcacao(self):
        caso = dict(CASO, nome="Ana <b>& Cia", endereco="Rua A & B <fundos>", orgao_autuador="DER & <X>")
        self.assertTrue(gerar_pdf(peca(caso=caso)).startswith(b"%PDF-"))

    def test_quadro_do_recurso_com_valores_longos(self):
        caso = dict(CASO, especie_documento=RECURSO_JARI,
                    notificacao_penalidade="P" + "9" * 40, numero_auto="", placa="")
        self.assertTrue(gerar_pdf(montar_peca(RASCUNHO, caso)).startswith(b"%PDF-"))

    def test_fonte_ausente_acusa(self):
        with tempfile.TemporaryDirectory() as vazio, \
                mock.patch.object(pdf_peca, "FONTES_DIR", Path(vazio)), \
                mock.patch.object(pdf_peca, "_registradas", False):
            with self.assertRaises(FonteAusente):
                pdf_peca.registrar_fontes()


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_pdf_peca -v 2>&1 | tail -4`
Expected: ERROR — `ModuleNotFoundError: No module named 'pdf_peca'`.

- [ ] **Step 5: Implementar `pipeline/pdf_peca.py`**

```python
"""A página da peça (spec 2026-10-02, §4.2): da `Peca` ao PDF, no estilo
"Notificação e Resposta" — forma forense com o quadro de campos do auto.

Precisa de reportlab e pyphen (venv). O texto vem pronto de peca.py; aqui só
se desenha.
"""

from __future__ import annotations

import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from peca import Peca, paragrafo_para_pdf

FONTES_DIR = Path(__file__).resolve().parent / "fontes"
FONTES = {
    "Serif": "SourceSerif4-Regular.ttf",
    "Serif-Semibold": "SourceSerif4-Semibold.ttf",
    "Serif-Bold": "SourceSerif4-Bold.ttf",
    "Serif-Italic": "SourceSerif4-It.ttf",
    "Mono": "IBMPlexMono-Regular.ttf",
    "Mono-Medium": "IBMPlexMono-Medium.ttf",
}
# Só preto e um cinza nos rótulos: a peça é impressa em casa.
CINZA = colors.HexColor("#555555")
_registradas = False


class FonteAusente(RuntimeError):
    """Sem as fontes não há peça: o pipeline acusa ao subir (main.py)."""


def registrar_fontes() -> None:
    global _registradas
    if _registradas:
        return
    faltando = [a for a in FONTES.values() if not (FONTES_DIR / a).is_file()]
    if faltando:
        raise FonteAusente(f"fontes ausentes em {FONTES_DIR}: {', '.join(faltando)}")
    for nome, arquivo in FONTES.items():
        pdfmetrics.registerFont(TTFont(nome, str(FONTES_DIR / arquivo)))
    pdfmetrics.registerFontFamily(
        "Serif", normal="Serif", bold="Serif-Bold", italic="Serif-Italic", boldItalic="Serif-Bold"
    )
    _registradas = True


def _estilos() -> dict[str, ParagraphStyle]:
    # Hifenização em português: sem ela, o justificado abre rios entre as palavras.
    corpo = ParagraphStyle(
        "corpo", fontName="Serif", fontSize=12, leading=18, alignment=TA_JUSTIFY,
        firstLineIndent=1.25 * cm, spaceAfter=6, hyphenationLang="pt_BR",
    )
    return {
        "corpo": corpo,
        "enderecamento": ParagraphStyle(
            "enderecamento", parent=corpo, fontName="Serif-Semibold", alignment=TA_LEFT,
            firstLineIndent=0, spaceAfter=0, hyphenationLang="",
        ),
        "titulo": ParagraphStyle(
            "titulo", fontName="Serif-Bold", fontSize=14, leading=18, alignment=TA_LEFT,
            spaceBefore=4, spaceAfter=8,
        ),
        "secao": ParagraphStyle(
            "secao", fontName="Serif-Bold", fontSize=12, leading=16, alignment=TA_LEFT,
            spaceBefore=10, spaceAfter=0, keepWithNext=1,
        ),
        "item": ParagraphStyle(
            "item", parent=corpo, firstLineIndent=-0.75 * cm, leftIndent=0.75 * cm,
        ),
        "rotulo": ParagraphStyle("rotulo", fontName="Mono", fontSize=6.5, leading=8, textColor=CINZA),
        "valor": ParagraphStyle("valor", fontName="Mono-Medium", fontSize=9.5, leading=12),
        "fecho": ParagraphStyle(
            "fecho", parent=corpo, alignment=TA_LEFT, hyphenationLang="",
        ),
        "assinatura": ParagraphStyle(
            "assinatura", parent=corpo, alignment=TA_CENTER, firstLineIndent=0, spaceAfter=0,
            hyphenationLang="",
        ),
    }


def _p(texto: str, estilo: ParagraphStyle) -> Paragraph:
    return Paragraph(paragrafo_para_pdf(texto), estilo)


def _titulo_espacado(titulo: str) -> str:
    """Caixa alta espaçada: letras separadas por espaço, palavras por espaço largo."""
    palavras = paragrafo_para_pdf(titulo.upper()).split(" ")
    return "&nbsp;&nbsp;".join(" ".join(p) for p in palavras)


def _quadro(campos: tuple[tuple[str, str], ...], e: dict[str, ParagraphStyle]) -> Table:
    sem_respiro = [(k, (0, 0), (-1, -1), 0) for k in ("LEFTPADDING", "RIGHTPADDING", "TOPPADDING")]
    celulas = [
        Table([[_p(rotulo.upper(), e["rotulo"])], [_p(valor, e["valor"])]],
              style=sem_respiro + [("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("FONTNAME", (0, 0), (-1, -1), "Mono")])
        for rotulo, valor in campos
    ]
    t = Table([celulas], colWidths=[None] * len(campos))
    t.setStyle(TableStyle([
        # Sem FONTNAME (aqui e na célula), a tabela declara Helvetica no PDF à toa.
        ("FONTNAME", (0, 0), (-1, -1), "Mono"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


class _CanvasNumerado(rl_canvas.Canvas):
    """Numera "página/total": o total só se sabe no fim, então as páginas são
    guardadas e desenhadas no save()."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._paginas: list[dict] = []

    def showPage(self):
        self._paginas.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._paginas)
        for estado in self._paginas:
            self.__dict__.update(estado)
            self.setFont("Serif", 9)
            self.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"{self._pageNumber}/{total}")
            super().showPage()
        super().save()


def gerar_pdf(peca: Peca) -> bytes:
    registrar_fontes()
    e = _estilos()
    story: list = [
        _p(peca.enderecamento, e["enderecamento"]),
        HRFlowable(width="100%", thickness=0.5, color=colors.black, spaceBefore=6, spaceAfter=12),
    ]
    if peca.titulo:
        story.append(Paragraph(_titulo_espacado(peca.titulo), e["titulo"]))
    story += [_quadro(peca.campos, e), Spacer(1, 14), _p(peca.qualificacao, e["corpo"])]

    def secao(titulo: str) -> list:
        return [
            _p(titulo, e["secao"]),
            HRFlowable(width="100%", thickness=0.4, color=colors.black, spaceBefore=2, spaceAfter=8),
        ]

    for titulo, paragrafos in peca.secoes:
        story += secao(titulo) + [_p(par, e["corpo"]) for par in paragrafos]
    story += secao(peca.titulo_pedido) + [_p(peca.abertura_pedido, e["corpo"])]
    story += [_p(item, e["item"]) for item in peca.pedido]
    story.append(_p("Nestes termos, pede deferimento.", e["fecho"]))
    local, _, assinatura = peca.fecho.partition("\n\n")
    # O fecho não se parte entre páginas.
    story.append(KeepTogether([
        Spacer(1, 6), _p(local, e["fecho"]), Spacer(1, 28), _p(assinatura, e["assinatura"]),
    ]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=3 * cm, rightMargin=2 * cm, topMargin=2.5 * cm,
        bottomMargin=2 * cm, title=peca.titulo_documento, author="", creator="", subject="",
        initialFontName="Serif",  # sem Helvetica declarada à toa no PDF
    )
    doc.build(story, canvasmaker=_CanvasNumerado)
    return buf.getvalue()
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd pipeline && PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_pdf_peca -v 2>&1 | tail -4`
Expected: `Ran 6 tests … OK`.

Run (sem as dependências, como o comando padrão): `cd pipeline && python3 -m unittest test_pdf_peca -v 2>&1 | tail -3`
Expected: `OK (skipped=6)`.

- [ ] **Step 7: Dependência e startup**

Em `pipeline/requirements.txt`, logo depois de `reportlab==4.4.0`, acrescentar a linha `pyphen==0.18.1`.

Em `pipeline/main.py`, depois de `from worker import run_dispatch_pipeline, verify_incoming_hmac`:

```python
from pdf_peca import registrar_fontes
```

e depois de `app = FastAPI(...)`:

```python
# Sem as fontes não há peça: acusar ao subir, não no meio de um caso pago.
registrar_fontes()
```

Run: `cd pipeline && python3 -m py_compile main.py pdf_peca.py && echo compila`
Expected: `compila`.

- [ ] **Step 8: Commit**

```bash
git add pipeline/fontes pipeline/pdf_peca.py pipeline/test_pdf_peca.py pipeline/requirements.txt pipeline/main.py
git commit -m "feat(pdf): a página da peça — Source Serif 4, quadro em Plex Mono, hifenização e numeração" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 7: `worker.py` — tudo junto, e o e-mail novo

**Files:**
- Modify: `pipeline/worker.py` (imports, `send_email_pdf`, remove `build_pdf_bytes`, trecho da base/velocidade, trecho do PDF e do e-mail)
- Modify: `pipeline/peca.py` (remove `texto_da_peca`)
- Modify: `pipeline/test_peca.py` (remove `TestTextoDaPeca` e o import de `texto_da_peca`)

**Interfaces:**
- Consumes: `montar_peca`, `corpo_do_email` (peca), `gerar_pdf` (pdf_peca), `cabe_advertencia`, `montar_base(..., artigos_do_pedido=)` (base_legal), `Bloco.inciso_da_conta` (velocidade).
- Produces: `send_email_pdf(to_email, pdf_bytes, case_id, dispatch_key, corpo, nome_arquivo) -> str | None`.

- [ ] **Step 1: Imports**

Em `pipeline/worker.py`:
- remover `import io`;
- trocar `from peca import paragrafo_para_pdf, texto_da_peca` por `from peca import corpo_do_email, montar_peca`;
- trocar `from base_legal import carregar_ctb, montar_base` por `from base_legal import cabe_advertencia, carregar_ctb, montar_base`;
- acrescentar `from pdf_peca import gerar_pdf`.

- [ ] **Step 2: `send_email_pdf` e `build_pdf_bytes`**

Apagar a função `build_pdf_bytes` inteira. Em `send_email_pdf`, a assinatura passa a ser:

```python
async def send_email_pdf(
    to_email: str,
    pdf_bytes: bytes,
    case_id: str,
    dispatch_key: str,
    corpo: str,
    nome_arquivo: str,
) -> str | None:
```

e, no corpo da função, `msg.set_content(...)` e `msg.add_attachment(...)` passam a ser:

```python
    msg.set_content(corpo)
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=nome_arquivo,
    )
```

- [ ] **Step 3: Base, velocidade e advertência**

Substituir o trecho que vai de `# Base normativa do CTB: sem ela não há peça` até a linha `usuario = "\n\n".join(partes)` por:

```python
            # Base normativa do CTB: sem ela não há peça (BaseLegalIndisponivel → failed).
            ctb = carregar_ctb(settings.ctb_dir)
            base = montar_base(ctb, case.get("amparo_legal"))
            # Enquadramento da velocidade decidido em código (sobre a considerada);
            # sem bloco nos casos neutros — a REGRA_ENQUADRAMENTO protege.
            bloco_vel = bloco_velocidade(case, base.enquadramento)
            inciso = bloco_vel.inciso_da_conta if bloco_vel else None
            advertencia = cabe_advertencia(ctb, base.enquadramento, inciso)
            if advertencia:
                # O pedido cita o art. 267: ele entra na base (spec 2026-10-02, §4.3).
                base = montar_base(ctb, case.get("amparo_legal"), artigos_do_pedido=("267",))
            log.info(
                "base legal case_id=%s ctb_sha256=%s obtido_em=%s enquadramento=%s artigos=%s",
                payload.case_id, base.sha256[:12], base.obtido_em,
                base.enquadramento or "não reconhecido", sorted(base.artigos),
            )
            log.info(
                "velocidade case_id=%s situacao=%s",
                payload.case_id, bloco_vel.situacao if bloco_vel else "nenhuma",
            )
            partes = [context] + ([bloco_vel.texto] if bloco_vel else []) + [base.texto]
            usuario = "\n\n".join(partes)
```

- [ ] **Step 4: PDF e e-mail**

Substituir o trecho de `pdf_title = f"Recurso — {payload.case_id}"` até `pdf_bytes = build_pdf_bytes(pdf_title, pdf_body)` por:

```python
            # A moldura é do código; o modelo escreveu só fatos e fundamentos (spec 2026-10-02).
            peca = montar_peca(
                draft, case, bloco_vel.situacao if bloco_vel else None, inciso, advertencia
            )
            log.info(
                "peca case_id=%s secoes=%d pedido_itens=%d advertencia=%s pedido_do_modelo_removido=%s",
                payload.case_id, len(peca.secoes), len(peca.pedido),
                "sim" if advertencia else "nao", "sim" if peca.pedido_do_modelo_removido else "nao",
            )
            pdf_bytes = gerar_pdf(peca)
```

Substituir o bloco `intro = ( "Olá,\n\n" … "Cordialmente,\nAmo Recorrer" )` por:

```python
            intro = corpo_do_email(payload.case_id)
```

e a chamada `send_email_pdf(official_email, pdf_bytes, payload.case_id, dk, intro)` por:

```python
                msg_id = await send_email_pdf(
                    official_email, pdf_bytes, payload.case_id, dk, intro, peca.nome_arquivo
                )
```

- [ ] **Step 5: Tirar `texto_da_peca`**

Em `pipeline/peca.py`, apagar a função `texto_da_peca`. Em `pipeline/test_peca.py`, apagar a classe `TestTextoDaPeca` inteira e `texto_da_peca` do import (os casos dela estão cobertos por `TestMontarPeca`).

- [ ] **Step 6: Verificar**

Run:
```bash
cd pipeline && grep -n "texto_da_peca\|build_pdf_bytes\|paragrafo_para_pdf\|Rascunho gerado" worker.py peca.py test_peca.py
python3 -m py_compile worker.py main.py && echo compila
python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca 2>&1 | tail -3
PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_pdf_peca 2>&1 | tail -2
```
Expected: o `grep` só acha `paragrafo_para_pdf` em `peca.py` (definição) e nada mais; `compila`; `OK (skipped=6)`; `OK`.

- [ ] **Step 7: Commit**

```bash
git add pipeline/worker.py pipeline/peca.py pipeline/test_peca.py
git commit -m "feat(worker): peça montada pelo código, PDF novo e e-mail com os passos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 8: Rodada real, PDFs de exemplo para o Klaus e documentação

**Files:**
- Create (fora do git): `recursos testes/exemplo-defesa-desclassificacao.pdf`, `recursos testes/exemplo-recurso-comum.pdf` (pasta já ignorada)
- Modify: `CLAUDE.md`, `PENDENCIAS.md`, `PROGRESSO.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–7.

- [ ] **Step 1: Sonda com o DeepSeek (montagem igual à do worker)**

Criar o script fora do repositório (`$HOME/.cache/amorecorrer-sonda-template.py`):

```python
import asyncio, os
from openai import AsyncOpenAI
from base_legal import cabe_advertencia, carregar_ctb, montar_base
from pdf_peca import gerar_pdf
from peca import DEFESA_PREVIA, RECURSO_JARI, montar_peca
from prompt import argumentos_da_chamada, build_case_context, system_prompt, texto_da_resposta
from velocidade import bloco_velocidade

BASE = {  # fictício
    "case_id": "CASO_exemplo", "nome": "Mariana Souza Lima", "email": "mariana@example.com",
    "cpf": "52998224725", "cnh": "04512345678", "endereco": "Rua das Laranjeiras, 120, apto 302",
    "cep": "22240003", "cidade": "Rio de Janeiro", "estado": "RJ", "placa": "RIO2A19",
    "data_infracao": "2026-08-14T07:52:00", "numero_auto": "E123456789",
    "local_infracao": "Av. Brasil, altura do nº 5000, sentido Centro", "orgao_autuador": "CET-RIO",
    "velocidade_permitida": 80, "velocidade_aferida": 97, "velocidade_considerada": 90,
    "marca_modelo_especie": "FIAT/ARGO DRIVE 1.0 - Passageiro/Automóvel", "expedida_em": "20/08/2026",
    "justificativa": "Eu estava levando minha filha ao hospital porque ela teve uma crise de asma. Não vi placa de velocidade no trecho.",
}
CASOS = {
    # auto no II (grave), conta no I → desclassificação + advertência
    "defesa-desclassificacao": dict(BASE, especie_documento=DEFESA_PREVIA,
        descricao_infracao="Transitar em velocidade superior à máxima permitida em mais de 20% até 50%",
        amparo_legal="Art. 218, II, do CTB"),
    # auto no I (média), conta bate → caso comum + advertência
    "recurso-comum": dict(BASE, especie_documento=RECURSO_JARI, notificacao_penalidade="P987654321",
        descricao_infracao="Transitar em velocidade superior à máxima permitida em até 20%",
        amparo_legal="Art. 218, I, do CTB"),
}
N = 3

async def main():
    ctb = carregar_ctb("../CTB-compilado_files")
    cli = AsyncOpenAI(api_key=os.environ["DEEPSEEK_API_KEY"], base_url="https://api.deepseek.com")
    for nome, case in CASOS.items():
        base = montar_base(ctb, case["amparo_legal"])
        bv = bloco_velocidade(case, base.enquadramento)
        inciso = bv.inciso_da_conta if bv else None
        adv = cabe_advertencia(ctb, base.enquadramento, inciso)
        if adv:
            base = montar_base(ctb, case["amparo_legal"], artigos_do_pedido=("267",))
        usuario = "\n\n".join([build_case_context(case)] + ([bv.texto] if bv else []) + [base.texto])
        sistema = system_prompt(False, None, sem_enquadramento=base.enquadramento is None)
        async def um():
            r = await cli.chat.completions.create(**argumentos_da_chamada("deepseek-flash", sistema, usuario))
            return texto_da_resposta(r.choices[0].message.content, r.choices[0].finish_reason)
        rascunhos = await asyncio.gather(*[um() for _ in range(N)])
        for i, rascunho in enumerate(rascunhos):
            p = montar_peca(rascunho, case, bv.situacao if bv else None, inciso, adv)
            print(f"{nome} {i+1}: secoes={len(p.secoes)} pedido_removido={p.pedido_do_modelo_removido} "
                  f"advertencia={adv} itens={len(p.pedido)}")
            if i == 0:
                open(f"../recursos testes/exemplo-{nome}.pdf", "wb").write(gerar_pdf(p))

asyncio.run(main())
```

Run (de `pipeline/`, chave só como variável de processo):
```bash
DEEPSEEK_API_KEY="$(grep -E '^DEEPSEEK_API_KEY=' ../.env | head -1 | cut -d= -f2- | tr -d '\r"')" \
PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." timeout 280 python3 "$HOME/.cache/amorecorrer-sonda-template.py"
```
Expected: 6 linhas; `defesa-desclassificacao` com `advertencia=True itens=3`, `recurso-comum` com `advertencia=True itens=2`; registrar quantas têm `secoes=2` e quantas `pedido_removido=True` (vão para o `PROGRESSO.md`). Nenhuma exceção.

- [ ] **Step 2: Conferir os PDFs**

Abrir os dois PDFs (ferramenta Read no caminho absoluto) e conferir: endereçamento certo por estágio, título espaçado, quadro com 3 (defesa) e 4 (recurso) campos, qualificação sem gênero, seções numeradas, pedido com as letras e o ponto final no último item, "Nestes termos, pede deferimento.", fecho inteiro numa página, "1/N" no rodapé, nenhuma marca nossa.

- [ ] **Step 3: GATE — aprovação do Klaus**

Parar e pedir ao Klaus que abra `C:\Users\klaus\Coding\Atlas\amorecorrer.com\recursos testes\exemplo-defesa-desclassificacao.pdf` e `exemplo-recurso-comum.pdf`. **Só seguir com a aprovação dele.** Ajustes visuais pedidos voltam à Task 6 (com teste quando couber) antes de seguir.

- [ ] **Step 4: Documentação**

`CLAUDE.md`:
- Na invariante "**A forma da peça é garantida por código, não pelo modelo.**", substituir o trecho que começa em "O prompt manda texto puro e parar no \"pede deferimento\"" até "o reportlab junta linhas." por:
  > O modelo escreve só `DOS FATOS` e `DOS FUNDAMENTOS`; `pipeline/peca.py` (`montar_peca`) corta pelos títulos — sem eles, seção única "DOS FATOS E DOS FUNDAMENTOS", nunca `failed` —, limpa o markdown, tira o que o modelo escrever de qualificação, pedido ou "pede deferimento", e o código escreve o resto: título, quadro de campos do auto, qualificação (sem marca de gênero; CNH só se houver), **pedido** (principal por estágio; desclassificação e arquivamento por inconsistência quando o `velocidade.py` decide; advertência do art. 267 como último subsidiário quando a infração é leve ou média, e então o 267 entra na base) e o fecho — cidade do cliente, **data sempre em branco** (é o dia do protocolo, que o sistema não sabe), nome e CPF. Dado ausente vira linha em branco (`________`), nunca `[marcador]`. `pipeline/pdf_peca.py` desenha a peça (Source Serif 4 e IBM Plex Mono de `pipeline/fontes/`, hifenização `pyphen`, numeração "1/N"); sem as fontes, o pipeline não sobe. Nada de marca nossa na peça: o aviso de revisão vai no corpo do e-mail (`corpo_do_email`).
- Na linha dos testes Python, acrescentar `test_pdf_peca` à lista e a frase: "O `test_pdf_peca` precisa de `reportlab` e `pyphen` e se pula sem eles; para rodá-lo fora do venv: `pip install --target \"$HOME/.cache/amorecorrer-pdfdeps\" reportlab==4.4.0 pyphen==0.18.1` e `PYTHONPATH=\"$HOME/.cache/amorecorrer-pdfdeps:.\"`."

`PENDENCIAS.md`: apagar o item "**Template da peça**".

`PROGRESSO.md`: nova sessão "## Sessão de 02/10/2026 — O template da peça" (ou a data do dia da execução), com: o que mudou (moldura em código, opção B, pedido do código, advertência do art. 267, prompt em duas seções, e-mail novo, nome do arquivo); a verificação (contagem de testes; resultado da sonda: `secoes=2` em X de 6, pedido removido em Y de 6; PDFs aprovados pelo Klaus); os `sha256` das seis fontes (Step 1 da Task 6) e as origens (adobe-fonts/source-serif 4.005R; google/fonts ofl/ibmplexmono); **o que o Klaus precisa fazer antes do próximo teste ponta a ponta:** instalar o `pyphen` no `.venv` de Windows, de `pipeline/` no PowerShell — `uv pip install -r requirements.txt` (o venv é gerido por uv) ou `.venv\Scripts\python -m pip install -r requirements.txt`; e "Sem deploy: o pipeline não roda em produção (#11)".

- [ ] **Step 5: Suíte final e commit**

Run:
```bash
cd pipeline && python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca 2>&1 | tail -2
PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_pdf_peca 2>&1 | tail -2
```
Expected: `OK (skipped=6)` e `OK`.

```bash
cd .. && git add CLAUDE.md PENDENCIAS.md PROGRESSO.md
git commit -m "docs: template da peça — invariante, testes do PDF e sessão no PROGRESSO" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

Depois: revisão final da branch e merge **só com o Klaus** (superpowers:finishing-a-development-branch).
