# Questionário de triagem — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um questionário antes do pagamento (estágio, data-limite, quem dirigia, radar/enquadramento/velocidades, versão) com diagnóstico calculado pelo código, tela de resumo e de prazo vencido; formulário pós-pagamento enxuto e preenchido a partir das respostas; data-limite gravada e citada no e-mail; e a peça pedindo sempre o arquivamento primeiro.

**Architecture:** As respostas vivem no navegador (`localStorage`), copiadas para uma chave por `case_id` no checkout. O diagnóstico é uma cópia em TypeScript da decisão do `velocidade.py` e do `parse_ref`, presa ao pipeline por um arquivo de casos que roda nos dois lados. Do lado do servidor, só uma coluna nova (`data_limite_protocolo`), um campo na Edge e duas mudanças de texto no `peca.py`.

**Tech Stack:** React 18 + Vite + Tailwind/shadcn (front), testes `node --test` em TypeScript (Node 22) via `npm run radar:test`; Deno (Edge); Python 3 `unittest` (pipeline); Postgres/Supabase (migration).

**Spec:** `docs/superpowers/specs/2026-10-07-questionario-de-triagem-design.md`

## Global Constraints

- Testes Python rodam de dentro de `pipeline/`: `python3 -m unittest <módulo> -v`. **Nunca `unittest discover`** (`test_resend_smtp.py` manda e-mail real ao ser importado). O `test_pdf_peca` precisa de `PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:."`.
- Testes do front e da Edge: `npm run radar:test`, da raiz. Módulos testados por ele usam **imports relativos com extensão `.ts`** (o `node --test` não resolve o alias `@/`).
- `npm run lint` pode ter avisos antigos fora dos arquivos tocados; o critério é `npx eslint <arquivos tocados>` limpo e `npm run build` concluído.
- Baseline de migrations congelada: a mudança de schema entra como `supabase/migrations/20261007000000_data_limite_protocolo.sql`.
- A Edge nunca recusa um envio por causa de `data_limite_protocolo`: valor inválido vira `null`. O campo fica **fora do `dup_guard`**.
- `ESTAGIOS` tem de bater, byte a byte, com `DEFESA_PREVIA` e `RECURSO_JARI` de `pipeline/peca.py`.
- Todos os textos visíveis vêm palavra por palavra da spec §4 (questionário, resumo, prazo vencido, "?") e §6.5 (e-mail). Não reescrever.
- Nota fixa do resumo: **"O resultado depende da análise do órgão; nenhuma defesa tem resultado garantido."**
- Datas: `data_limite` é `'AAAA-MM-DD'`; "hoje" é a data local do navegador, sem hora; o próprio dia da data-limite ainda vale.
- No WSL, o Vite pode não ver edições em `/mnt/c`: confira com `curl -s localhost:8080/src/<arquivo> | grep -c <termo>` e reinicie o `npm run dev`. O Docker pode estar indisponível.
- Commits terminam com as duas linhas:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
  ```
- `git add` só com caminhos explícitos.

## Review Focus

1. **Data-limite no fuso:** "hoje" calculado com `toISOString()` (UTC) vira o dia seguinte depois das 21h em Brasília e declara vencido um prazo que vence hoje. Esperado: data local. Pinado na Task 4 (teste às 23h30 locais).
2. **Rascunho antigo do formulário sem os campos novos** (`data_limite`, `versao`): ele não pode apagar as respostas do questionário nem travar a validação. Esperado: campo ausente no rascunho não sobrescreve a resposta. Pinado na Task 4 (`mesclarComRascunho`).
3. **Duas abas / duas compras:** o questionário da compra B não pode preencher o formulário da compra A. Esperado: cada `case_id` lê só a sua cópia. Pinado na Task 4.
4. **Enquadramento digitado em caixa alta, com "do CTB", com alínea ou parágrafo:** o diagnóstico tem de concordar com o pipeline, inclusive em dizer "não sei". Pinado na Task 3 (casos compartilhados gerados pelo próprio pipeline).
5. **Voltar do Stripe sem pagar** (botão "voltar" do navegador ou `/cancel`): as respostas continuam em `questionario_atual`, e o cliente retoma o questionário onde estava. Pinado na Task 4 (`vincularAoCaso` copia, não move) e conferido no navegador na Task 6.

---

### Task 1: A peça pede o arquivamento primeiro, o e-mail cita a data-limite

**Files:**
- Modify: `pipeline/peca.py` (função `pedido`, ramo `desclassificacao`; função `corpo_do_email`)
- Modify: `pipeline/prompt.py` (`CAMPOS_INTERNOS`)
- Test: `pipeline/test_peca.py`, `pipeline/test_prompt.py`

**Interfaces:**
- Consumes: nada.
- Produces: `corpo_do_email(case)` lê `case.get("data_limite_protocolo")` (`'AAAA-MM-DD'` ou `None`); `pedido(...)` com a nova ordem.

- [ ] **Step 1: Atualizar os testes da ordem do pedido e escrever os do e-mail (devem falhar)**

Em `pipeline/test_peca.py`, substituir o corpo de `test_desclassificacao` por:

```python
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
```

Em `TestCorpoDoEmail`, acrescentar:

```python
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
```

Em `pipeline/test_prompt.py`, dentro de `TestRelatoNoContexto.test_resposta_sobre_o_condutor_nunca_vai_crua`, acrescentar ao fim:

```python
        self.assertIn("data_limite_protocolo", CAMPOS_INTERNOS)
        self.assertNotIn("data_limite_protocolo",
                         build_case_context({"nome": "Fulana", "data_limite_protocolo": "2026-10-30"}))
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `pipeline/`): `python3 -m unittest test_peca test_prompt 2>&1 | tail -3`
Expected: `FAILED (failures=…)` — `test_desclassificacao`, `test_passo_3_com_a_data_limite` e o de `CAMPOS_INTERNOS`.

- [ ] **Step 3: Implementar**

Em `pipeline/peca.py`, no ramo `elif situacao_velocidade == "desclassificacao" and inciso_da_conta:` de `pedido`, trocar o bloco `if recurso: … else: … itens.append(f"subsidiariamente, {inconsistencia}")` por:

```python
        # 07/10/2026, decisão do Klaus: o arquivamento primeiro, a desclassificação
        # como subsidiária (reverte a ordem da spec de 30/09/2026).
        if recurso:
            itens.append(
                f"o provimento deste recurso, com o cancelamento da penalidade imposta e {inconsistencia}"
            )
            itens.append(
                f"subsidiariamente, a desclassificação da infração {alvo}, com a readequação da penalidade"
            )
        else:
            itens.append(inconsistencia)
            itens.append(f"subsidiariamente, a desclassificação da infração {alvo}")
```

Logo antes de `def corpo_do_email`, acrescentar:

```python
def _data_br(valor: Any) -> str | None:
    """'2026-10-30' → '30/10/2026'; qualquer outra coisa → None (data impossível também)."""
    if not isinstance(valor, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valor):
        return None
    ano, mes, dia = (int(p) for p in valor.split("-"))
    try:
        date(ano, mes, dia)
    except ValueError:
        return None
    return f"{dia:02d}/{mes:02d}/{ano}"
```

e `from datetime import date` nos imports do topo (depois de `import re`). Em `corpo_do_email`, trocar a linha do passo 3:

```python
    prazo = _data_br(case.get("data_limite_protocolo"))
    passo_3 = (
        f"3. Protocole no órgão de trânsito até {prazo}, a data-limite que consta da sua "
        "notificação — no balcão, pelos Correios ou pelo site do órgão, conforme ele aceitar.\n\n"
        if prazo
        else "3. Protocole no órgão de trânsito até o prazo que consta da sua notificação — no "
        "balcão, pelos Correios ou pelo site do órgão, conforme ele aceitar.\n\n"
    )
```

(definida logo antes do `return`) e, no `return`, substituir as duas linhas literais do passo 3 por `f"{passo_3}"`.

Em `pipeline/prompt.py`, em `CAMPOS_INTERNOS`, depois de `"cliente_conduzia",`:

```python
        # Prazo de protocolo: vai ao e-mail, não à redação, e competiria com a data
        # da infração (spec 2026-10-07, §6.5).
        "data_limite_protocolo",
```

- [ ] **Step 4: Rodar e ver passar, com a suíte inteira**

Run (de `pipeline/`): `PYTHONPATH="$HOME/.cache/amorecorrer-pdfdeps:." python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca 2>&1 | tail -1`
Expected: `OK`. Se algum outro teste que fixava a ordem antiga falhar (por exemplo `test_peca_completa`, que só compara com `pedido(...)`), confira que ele compara com a função, não com o texto antigo; se compara com o texto antigo, atualize para a ordem nova.

- [ ] **Step 5: Commit**

```bash
git add pipeline/peca.py pipeline/prompt.py pipeline/test_peca.py pipeline/test_prompt.py
git commit -m "feat(peca): arquivamento primeiro no pedido e data-limite no e-mail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 2: A data-limite chega ao banco

**Files:**
- Create: `supabase/migrations/20261007000000_data_limite_protocolo.sql`
- Modify: `supabase/functions/form-submit/campos.ts`, `supabase/functions/form-submit/index.ts` (import e `updateFields`)
- Test: `supabase/functions/form-submit/campos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `form_submissions.data_limite_protocolo date`; a Edge grava `'AAAA-MM-DD'` ou `null` a partir do campo `data_limite_protocolo` do POST.

- [ ] **Step 1: Teste da normalização (deve falhar)**

Acrescentar a `supabase/functions/form-submit/campos.test.ts`:

```ts
import { dataLimiteProtocolo } from './campos.ts'

test('data-limite válida passa como está', () => {
  assert.equal(dataLimiteProtocolo('2026-10-30'), '2026-10-30')
  assert.equal(dataLimiteProtocolo('2028-02-29'), '2028-02-29')
})

test('data-limite impossível, em outro formato ou de outro tipo vira null', () => {
  for (const valor of ['2026-02-30', '2027-02-29', '30/10/2026', '2026-10-30T00:00', '', ' ', 20261030, null, undefined, {}]) {
    assert.equal(dataLimiteProtocolo(valor), null, `valor: ${JSON.stringify(valor)}`)
  }
})
```

(o `import { clienteConduzia }` existente fica; junte os dois nomes num import só se preferir.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run radar:test 2>&1 | grep -E "^# (pass|fail)|does not provide|SyntaxError" | head -3`
Expected: falha de import (`does not provide an export named 'dataLimiteProtocolo'`).

- [ ] **Step 3: Implementar**

Em `supabase/functions/form-submit/campos.ts`, acrescentar:

```ts
/**
 * `data_limite_protocolo` — a data-limite impressa na notificação (spec
 * docs/superpowers/specs/2026-10-07-questionario-de-triagem-design.md, §6.4).
 * Só 'AAAA-MM-DD' que seja data de calendário válida passa; o resto vira null,
 * e o envio nunca é recusado por causa deste campo.
 */
export function dataLimiteProtocolo(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
    ? valor
    : null;
}
```

Em `supabase/functions/form-submit/index.ts`, trocar `import { clienteConduzia } from "./campos.ts";` por `import { clienteConduzia, dataLimiteProtocolo } from "./campos.ts";` e, no `updateFields`, logo depois da linha `cliente_conduzia: clienteConduzia(norm.cliente_conduzia),`:

```ts
      // Também fora do dup_guard, pela mesma regra.
      data_limite_protocolo: dataLimiteProtocolo(norm.data_limite_protocolo),
```

Criar `supabase/migrations/20261007000000_data_limite_protocolo.sql`:

```sql
-- Data-limite de protocolo — spec docs/superpowers/specs/2026-10-07-questionario-de-triagem-design.md
--
-- O cliente informa, no questionário ou no formulário, a data-limite impressa na
-- notificação (defesa prévia ou recurso). O e-mail passa a dizer "protocole até
-- dd/mm/aaaa". `date`, e não `timestamptz`: é uma data de calendário impressa no
-- papel, não um instante (mesmo raciocínio de data_infracao).
--
-- Deploy: sobe ANTES da Edge que grava a coluna.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS data_limite_protocolo date;

COMMENT ON COLUMN public.form_submissions.data_limite_protocolo IS
  'Data-limite impressa na notificação (defesa prévia ou recurso), informada pelo cliente no questionário ou no formulário. Usada no e-mail ("protocole até dd/mm/aaaa"). NULL em casos anteriores ao campo e quando a Edge recebe valor inválido.';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run radar:test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Aplicar no banco local, se houver Docker**

Run: `docker ps --format '{{.Names}}' | grep supabase_db_`
Se aparecer o container: `docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261007000000_data_limite_protocolo.sql` (Expected: `ALTER TABLE` e `COMMENT`) e conferir `select data_type, is_nullable from information_schema.columns where table_name='form_submissions' and column_name='data_limite_protocolo'` (Expected: `date | YES`). Sem Docker, anotar que a conferência vai ser pelo conector, depois do `db push`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007000000_data_limite_protocolo.sql supabase/functions/form-submit/campos.ts supabase/functions/form-submit/campos.test.ts supabase/functions/form-submit/index.ts
git commit -m "feat(form-submit): coluna data_limite_protocolo e normalização na Edge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 3: O diagnóstico, preso ao pipeline por casos compartilhados

**Files:**
- Create: `tests/compartilhados/velocidade.json`
- Create: `src/lib/diagnostico.ts`
- Create: `src/lib/diagnostico.test.ts`
- Create: `pipeline/test_diagnostico_paridade.py`

**Interfaces:**
- Consumes: nada.
- Produces (usados pelas Tasks 6 e 7):
  - `type Inciso = 'I' | 'II' | 'III'`
  - `enquadramento218(amparo: string): string | null` → `'art. 218'`, `'art. 218, I'`, `'art. 218, II'`, `'art. 218, III'` ou `null`
  - `situacaoDaVelocidade(e: EntradaVelocidade): { situacao: 'sem_infracao' | 'desclassificacao' | null; inciso_do_auto: Inciso | null; inciso_da_conta: Inciso | null }`
  - `type EntradaVelocidade = { amparo_legal: string; velocidade_permitida: string | number | null; velocidade_aferida: string | number | null; velocidade_considerada: string | number | null }`
  - `diagnostico(e: EntradaVelocidade & { cliente_conduzia: '' | 'sim' | 'nao' }): Diagnostico`
  - `type Diagnostico = { tipo: 'arquivamento' | 'desclassificacao' | 'neutro_advertencia' | 'neutro'; texto: string; destaque: string | null; complemento: string | null }`

- [ ] **Step 1: O arquivo de casos (gerado pelo pipeline em 08/10/2026)**

Criar `tests/compartilhados/velocidade.json` com exatamente este conteúdo (os valores esperados saíram de `montar_base` + `bloco_velocidade`; não editar à mão — se o pipeline mudar, regenere e confira):

```json
[
  {"amparo_legal": "Art 218, II, CTB", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": "art. 218, II", "situacao": "desclassificacao", "inciso_da_conta": "I"},
  {"amparo_legal": "art. 218, inciso I", "velocidade_permitida": 80, "velocidade_aferida": 95, "velocidade_considerada": 90, "enquadramento_218": "art. 218, I", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "218 III", "velocidade_permitida": 80, "velocidade_aferida": 130, "velocidade_considerada": 125, "enquadramento_218": "art. 218, III", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218 do CTB", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": "art. 218", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218 do CTB", "velocidade_permitida": 80, "velocidade_aferida": 80, "velocidade_considerada": 78, "enquadramento_218": "art. 218", "situacao": "sem_infracao", "inciso_da_conta": null},
  {"amparo_legal": "art. 218, II, a", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": null, "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "218, § 1º", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": null, "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 230, V", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": null, "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "7455-0", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": null, "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "excesso de velocidade", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": null, "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": null, "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218, II", "velocidade_permitida": 80, "velocidade_aferida": 100, "velocidade_considerada": 96, "enquadramento_218": "art. 218, II", "situacao": "desclassificacao", "inciso_da_conta": "I"},
  {"amparo_legal": "Art. 218, II", "velocidade_permitida": 80, "velocidade_aferida": 101, "velocidade_considerada": 97, "enquadramento_218": "art. 218, II", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218, III", "velocidade_permitida": 80, "velocidade_aferida": 125, "velocidade_considerada": 120, "enquadramento_218": "art. 218, III", "situacao": "desclassificacao", "inciso_da_conta": "II"},
  {"amparo_legal": "Art. 218, III", "velocidade_permitida": 80, "velocidade_aferida": 126, "velocidade_considerada": 121, "enquadramento_218": "art. 218, III", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218, I", "velocidade_permitida": 80, "velocidade_aferida": 85, "velocidade_considerada": 80, "enquadramento_218": "art. 218, I", "situacao": "sem_infracao", "inciso_da_conta": null},
  {"amparo_legal": "Art. 218, II", "velocidade_permitida": 80, "velocidade_aferida": 85, "velocidade_considerada": 90, "enquadramento_218": "art. 218, II", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218, I", "velocidade_permitida": 80, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": "art. 218, I", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218, III", "velocidade_permitida": 60, "velocidade_aferida": 70, "velocidade_considerada": 66, "enquadramento_218": "art. 218, III", "situacao": "desclassificacao", "inciso_da_conta": "I"},
  {"amparo_legal": "ART. 218, II, DO CTB", "velocidade_permitida": 70, "velocidade_aferida": 81, "velocidade_considerada": 76, "enquadramento_218": "art. 218, II", "situacao": "desclassificacao", "inciso_da_conta": "I"},
  {"amparo_legal": "Art. 218, II", "velocidade_permitida": null, "velocidade_aferida": 91, "velocidade_considerada": 84, "enquadramento_218": "art. 218, II", "situacao": null, "inciso_da_conta": null},
  {"amparo_legal": "Art. 218, II", "velocidade_permitida": 80, "velocidade_aferida": null, "velocidade_considerada": 84, "enquadramento_218": "art. 218, II", "situacao": "desclassificacao", "inciso_da_conta": "I"}
]
```

- [ ] **Step 2: O teste de paridade do lado Python (deve passar já — ele fixa o pipeline como verdade)**

Criar `pipeline/test_diagnostico_paridade.py`:

```python
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
```

Run (de `pipeline/`): `python3 -m unittest test_diagnostico_paridade -v 2>&1 | tail -3`
Expected: `OK` (2 testes). Se falhar, o arquivo de casos foi copiado errado: corrija o arquivo, nunca o pipeline.

- [ ] **Step 3: O teste do front (deve falhar)**

Criar `src/lib/diagnostico.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { diagnostico, enquadramento218, situacaoDaVelocidade } from './diagnostico.ts'

type Caso = {
  amparo_legal: string
  velocidade_permitida: number | null
  velocidade_aferida: number | null
  velocidade_considerada: number | null
  enquadramento_218: string | null
  situacao: 'sem_infracao' | 'desclassificacao' | null
  inciso_da_conta: string | null
}

const CASOS: Caso[] = JSON.parse(
  readFileSync(new URL('../../tests/compartilhados/velocidade.json', import.meta.url), 'utf8')
)

test('paridade com o pipeline: enquadramento, situação e inciso da conta', () => {
  for (const c of CASOS) {
    const rotulo = `${c.amparo_legal} ${c.velocidade_permitida}/${c.velocidade_considerada}`
    assert.equal(enquadramento218(c.amparo_legal), c.enquadramento_218, rotulo)
    const r = situacaoDaVelocidade(c)
    assert.equal(r.situacao, c.situacao, rotulo)
    assert.equal(r.inciso_da_conta, c.inciso_da_conta, rotulo)
  }
})

test('velocidades como texto do formulário valem o mesmo que números', () => {
  const r = situacaoDaVelocidade({ amparo_legal: 'Art 218, II, CTB', velocidade_permitida: '80', velocidade_aferida: '91', velocidade_considerada: '84' })
  assert.deepEqual(r, { situacao: 'desclassificacao', inciso_do_auto: 'II', inciso_da_conta: 'I' })
  assert.equal(situacaoDaVelocidade({ amparo_legal: 'Art 218, II', velocidade_permitida: '', velocidade_aferida: '', velocidade_considerada: '84' }).situacao, null)
})

const base = { velocidade_aferida: '', cliente_conduzia: 'sim' as const }

test('arquivamento: destaca o arquivamento', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art. 218, I', velocidade_permitida: '80', velocidade_considerada: '80' })
  assert.equal(d.tipo, 'arquivamento')
  assert.equal(d.texto, 'A defesa pede o arquivamento do auto: a velocidade considerada no próprio auto não passa da permitida.')
  assert.equal(d.destaque, 'Pelos números do seu auto, este é o pedido com mais chance de ser aceito.')
  assert.equal(d.complemento, null)
})

test('desclassificação para o I: três pedidos, destaque e complemento da advertência', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art 218, II, CTB', velocidade_permitida: '80', velocidade_considerada: '84' })
  assert.equal(d.tipo, 'desclassificacao')
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) se ele for negado, a desclassificação para o inciso I do art. 218; (c) a advertência no lugar da multa.')
  assert.equal(d.destaque, 'Pelos números do seu auto, o pedido com mais chance de ser aceito é a desclassificação — os outros continuam no pedido e podem ser acolhidos.')
  assert.equal(d.complemento, 'Se você não teve outra infração nos últimos 12 meses, depois da desclassificação cabe ainda a advertência (art. 267).')
})

test('desclassificação para o II: sem advertência', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art. 218, III', velocidade_permitida: '80', velocidade_considerada: '120' })
  assert.equal(d.tipo, 'desclassificacao')
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) se ele for negado, a desclassificação para o inciso II do art. 218.')
  assert.equal(d.complemento, null)
})

test('neutro no inciso I: a advertência é o destaque', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art. 218, I', velocidade_permitida: '80', velocidade_considerada: '84' })
  assert.equal(d.tipo, 'neutro_advertencia')
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) a advertência no lugar da multa.')
  assert.equal(d.destaque, 'Se você não teve outra infração nos últimos 12 meses, a advertência é o pedido com mais chance de ser aceito — a lei diz que ela deverá ser aplicada nesse caso (art. 267) —, e o arquivamento continua no pedido.')
})

test('neutro sem destaque: grave, fora do 218 ou sem enquadramento', () => {
  for (const amparo_legal of ['Art. 218, II', 'Art. 230, V', '', 'Art. 218 do CTB']) {
    const d = diagnostico({ ...base, amparo_legal, velocidade_permitida: '80', velocidade_considerada: '97' })
    assert.equal(d.tipo, 'neutro', amparo_legal)
    assert.equal(d.texto, 'A defesa pede o arquivamento do auto, com base na consistência do auto e nos requisitos que a lei exige dele.')
    assert.equal(d.destaque, null)
  }
})

test('com outra pessoa dirigindo, a advertência vem condicionada', () => {
  const d = diagnostico({ ...base, cliente_conduzia: 'nao', amparo_legal: 'Art. 218, I', velocidade_permitida: '80', velocidade_considerada: '84' })
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) a advertência no lugar da multa, caso você venha a ser considerado responsável.')
})
```

Run: `npm run radar:test 2>&1 | grep -E "^# (pass|fail)|Cannot find module" | head -3`
Expected: falha (`Cannot find module …/diagnostico.ts`).

- [ ] **Step 4: Implementar `src/lib/diagnostico.ts`**

```ts
/*
 * Diagnóstico do questionário (spec 2026-10-07, §7): o espelho, em TypeScript, da
 * decisão que o pipeline toma sobre a velocidade — `parse_ref`
 * (CTB-compilado_files/consulta.py) para ler o enquadramento e
 * `velocidade.bloco_velocidade` (pipeline/velocidade.py) para a situação. A
 * paridade é garantida por tests/compartilhados/velocidade.json, rodado aqui e em
 * pipeline/test_diagnostico_paridade.py: quem mudar um lado muda o outro.
 */

export type Inciso = 'I' | 'II' | 'III'
export type SituacaoVelocidade = 'sem_infracao' | 'desclassificacao' | null

export type EntradaVelocidade = {
  amparo_legal: string
  velocidade_permitida: string | number | null
  velocidade_aferida: string | number | null
  velocidade_considerada: string | number | null
}

export type Diagnostico = {
  tipo: 'arquivamento' | 'desclassificacao' | 'neutro_advertencia' | 'neutro'
  texto: string
  destaque: string | null
  complemento: string | null
}

const GRAVIDADE: Record<Inciso, number> = { I: 1, II: 2, III: 3 }

// Mesma gramática de parse_ref: o inciso é romano em maiúsculas (sem /i), a alínea
// é uma letra minúscula solta; parágrafo, alínea ou item no art. 218 não existem.
const REF_RE = /^\s*(?:art(?:igo)?\.?\s*)?(\d+)\s*[ºo°]?\s*(?:-\s*([A-Z]))?\s*[.,;]?\s*(.*)$/i
const PARAGRAFO = /par[áa]grafo\s+[úu]nico|p\.\s*[úu]nico|(?:§|par[áa]grafo)\s*\d+/i
const INCISO = /(?:inciso\s+)?\b([IVXLC]+)\b(?:-([A-Z])\b)?/
const ALINEA = /(?:al[íi]nea\s+)?["'“]?\b([a-z])\b["'”)]?/
const ITEM = /item\s+\d+/i

export function enquadramento218(amparo: string): string | null {
  const m = REF_RE.exec(amparo ?? '')
  if (!m || m[1] !== '218' || m[2]) return null
  let resto = m[3]
  if (PARAGRAFO.test(resto)) return null
  let inciso: string | null = null
  const im = INCISO.exec(resto)
  if (im) {
    if (im[2]) return null
    inciso = im[1]
    resto = resto.slice(im.index + im[0].length)
  }
  if (ALINEA.test(resto) || ITEM.test(resto)) return null
  if (inciso === null) return 'art. 218'
  return inciso === 'I' || inciso === 'II' || inciso === 'III' ? `art. 218, ${inciso}` : null
}

function inteiro(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) {
    const n = parseInt(v, 10)
    return n > 0 ? n : null
  }
  return null
}

/** Limites do art. 218, em aritmética exata: I até 20%; II acima de 20% até 50%; III acima de 50%. */
function incisoPelaVelocidade(permitida: number, considerada: number): Inciso | null {
  const d = 100 * (considerada - permitida)
  if (d <= 0) return null
  if (d <= 20 * permitida) return 'I'
  if (d <= 50 * permitida) return 'II'
  return 'III'
}

export function situacaoDaVelocidade(e: EntradaVelocidade): {
  situacao: SituacaoVelocidade
  inciso_do_auto: Inciso | null
  inciso_da_conta: Inciso | null
} {
  const enq = enquadramento218(e.amparo_legal)
  const doAuto = enq && enq !== 'art. 218' ? (enq.slice('art. 218, '.length) as Inciso) : null
  const nada = { situacao: null, inciso_do_auto: doAuto, inciso_da_conta: null }
  if (!enq) return nada
  const permitida = inteiro(e.velocidade_permitida)
  const considerada = inteiro(e.velocidade_considerada)
  if (permitida === null || considerada === null) return nada
  const aferida = inteiro(e.velocidade_aferida)
  if (aferida !== null && considerada > aferida) return nada
  const daConta = incisoPelaVelocidade(permitida, considerada)
  if (daConta === null) return { situacao: 'sem_infracao', inciso_do_auto: doAuto, inciso_da_conta: null }
  if (doAuto && GRAVIDADE[doAuto] > GRAVIDADE[daConta]) {
    return { situacao: 'desclassificacao', inciso_do_auto: doAuto, inciso_da_conta: daConta }
  }
  return nada
}

export function diagnostico(e: EntradaVelocidade & { cliente_conduzia: '' | 'sim' | 'nao' }): Diagnostico {
  const s = situacaoDaVelocidade(e)
  const advertencia =
    e.cliente_conduzia === 'nao'
      ? 'a advertência no lugar da multa, caso você venha a ser considerado responsável'
      : 'a advertência no lugar da multa'

  if (s.situacao === 'sem_infracao') {
    return {
      tipo: 'arquivamento',
      texto: 'A defesa pede o arquivamento do auto: a velocidade considerada no próprio auto não passa da permitida.',
      destaque: 'Pelos números do seu auto, este é o pedido com mais chance de ser aceito.',
      complemento: null,
    }
  }
  if (s.situacao === 'desclassificacao' && s.inciso_da_conta) {
    const comAdvertencia = s.inciso_da_conta === 'I'
    return {
      tipo: 'desclassificacao',
      texto:
        'A defesa pede, em ordem: (a) o arquivamento do auto; (b) se ele for negado, a desclassificação ' +
        `para o inciso ${s.inciso_da_conta} do art. 218${comAdvertencia ? `; (c) ${advertencia}` : ''}.`,
      destaque:
        'Pelos números do seu auto, o pedido com mais chance de ser aceito é a desclassificação — os outros ' +
        'continuam no pedido e podem ser acolhidos.',
      complemento: comAdvertencia
        ? 'Se você não teve outra infração nos últimos 12 meses, depois da desclassificação cabe ainda a advertência (art. 267).'
        : null,
    }
  }
  if (s.inciso_do_auto === 'I') {
    return {
      tipo: 'neutro_advertencia',
      texto: `A defesa pede, em ordem: (a) o arquivamento do auto; (b) ${advertencia}.`,
      destaque:
        'Se você não teve outra infração nos últimos 12 meses, a advertência é o pedido com mais chance de ser ' +
        'aceito — a lei diz que ela deverá ser aplicada nesse caso (art. 267) —, e o arquivamento continua no pedido.',
      complemento: null,
    }
  }
  return {
    tipo: 'neutro',
    texto: 'A defesa pede o arquivamento do auto, com base na consistência do auto e nos requisitos que a lei exige dele.',
    destaque: null,
    complemento: null,
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run radar:test 2>&1 | grep -E "^# (pass|fail)"` e (de `pipeline/`) `python3 -m unittest test_diagnostico_paridade 2>&1 | tail -1`
Expected: `# fail 0` e `OK`.

- [ ] **Step 6: Commit**

```bash
git add tests/compartilhados/velocidade.json src/lib/diagnostico.ts src/lib/diagnostico.test.ts pipeline/test_diagnostico_paridade.py
git commit -m "feat(diagnostico): espelho em TypeScript da decisão da velocidade, com paridade testada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 4: As respostas no navegador e os estágios compartilhados

**Files:**
- Create: `src/lib/estagios.ts`, `src/lib/estagios.test.ts`
- Create: `src/lib/questionario.ts`, `src/lib/questionario.test.ts`
- Modify: `src/pages/Form.tsx` (remove a constante `ESTAGIOS` local e importa de `../lib/estagios`)

**Interfaces:**
- Consumes: `consideradaMaiorQueAferida(aferida: string, considerada: string): boolean` de `src/lib/velocidade.ts` (já existe).
- Produces (usados pelas Tasks 5, 6 e 7):
  - `ESTAGIOS`, `DEFESA_PREVIA`, `RECURSO_JARI` (de `estagios.ts`)
  - `type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`
  - `type RespostasQuestionario` (spec §6.1) e `RESPOSTAS_VAZIAS`
  - `CHAVE_ATUAL = 'questionario_atual'`, `chaveDoCaso(caseId: string): string`
  - `armazenamentoDoNavegador(): Armazenamento | null`
  - `lerRespostas(arm: Armazenamento | null, chave: string): RespostasQuestionario | null`
  - `gravarRespostas(arm: Armazenamento | null, chave: string, r: RespostasQuestionario): boolean`
  - `vincularAoCaso(arm: Armazenamento | null, caseId: string): boolean` (copia `CHAVE_ATUAL` → `chaveDoCaso`)
  - `apagarRespostas(arm: Armazenamento | null, caseId: string): void`
  - `hojeLocal(agora: Date): string` (`'AAAA-MM-DD'` local)
  - `diasAteDataLimite(dataLimite: string, agora: Date): number | null`
  - `erroDoPasso(passo: 1 | 2 | 3 | 4 | 5, r: RespostasQuestionario): string | null`
  - `type CamposDoQuestionarioNoFormulario = { estagio: string; data_limite: string; cliente_conduzia: string; amparoLegal: string; velocidade_permitida: string; velocidade_aferida: string; velocidade_considerada: string; versao: string; justificativa: string }`
  - `paraCamposDoFormulario(r: RespostasQuestionario): CamposDoQuestionarioNoFormulario`
  - `mesclarComRascunho<T extends object>(base: T, rascunho: Partial<T> | null): T` — campo do rascunho só sobrescreve se vier string não vazia

- [ ] **Step 1: Os testes (devem falhar)**

`src/lib/estagios.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFESA_PREVIA, ESTAGIOS, RECURSO_JARI } from './estagios.ts'

// CLAUDE.md: mudar este texto sem mudar peca.py faz toda peça sair sem destinatário.
test('os rótulos batem byte a byte com DEFESA_PREVIA e RECURSO_JARI do peca.py', () => {
  const peca = readFileSync(new URL('../../pipeline/peca.py', import.meta.url), 'utf8')
  assert.ok(peca.includes(`DEFESA_PREVIA = "${DEFESA_PREVIA}"`))
  assert.ok(peca.includes(`RECURSO_JARI = "${RECURSO_JARI}"`))
  assert.deepEqual(ESTAGIOS.map((e) => e.valor), [DEFESA_PREVIA, RECURSO_JARI])
})
```

`src/lib/questionario.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAVE_ATUAL, RESPOSTAS_VAZIAS, apagarRespostas, chaveDoCaso, diasAteDataLimite, erroDoPasso,
  gravarRespostas, hojeLocal, lerRespostas, mesclarComRascunho, paraCamposDoFormulario, vincularAoCaso,
  type Armazenamento, type RespostasQuestionario,
} from './questionario.ts'
import { DEFESA_PREVIA } from './estagios.ts'

class Memoria implements Armazenamento {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}
class Quebrado implements Armazenamento {
  getItem(): string | null { throw new Error('bloqueado') }
  setItem(): void { throw new Error('bloqueado') }
  removeItem(): void { throw new Error('bloqueado') }
}

const R: RespostasQuestionario = {
  ...RESPOSTAS_VAZIAS, estagio: DEFESA_PREVIA, data_limite: '2026-10-30', cliente_conduzia: 'sim',
  multa_de_radar: 'sim', amparo_legal: 'Art. 218, II', velocidade_permitida: '80',
  velocidade_aferida: '91', velocidade_considerada: '84', versao: 'propria', justificativa: 'Não vi a placa.',
}

test('gravar e ler a resposta atual', () => {
  const a = new Memoria()
  assert.equal(gravarRespostas(a, CHAVE_ATUAL, R), true)
  assert.deepEqual(lerRespostas(a, CHAVE_ATUAL), R)
})

test('vincular copia para a chave do caso e mantém a atual (voltar do Stripe sem pagar)', () => {
  const a = new Memoria()
  gravarRespostas(a, CHAVE_ATUAL, R)
  assert.equal(vincularAoCaso(a, 'CASO_1'), true)
  assert.deepEqual(lerRespostas(a, chaveDoCaso('CASO_1')), R)
  assert.deepEqual(lerRespostas(a, CHAVE_ATUAL), R)
})

test('duas compras seguidas não misturam respostas', () => {
  const a = new Memoria()
  gravarRespostas(a, CHAVE_ATUAL, R)
  vincularAoCaso(a, 'CASO_A')
  gravarRespostas(a, CHAVE_ATUAL, { ...R, justificativa: 'Outra história.' })
  vincularAoCaso(a, 'CASO_B')
  assert.equal(lerRespostas(a, chaveDoCaso('CASO_A'))!.justificativa, 'Não vi a placa.')
  assert.equal(lerRespostas(a, chaveDoCaso('CASO_B'))!.justificativa, 'Outra história.')
})

test('apagar remove a do caso e a atual', () => {
  const a = new Memoria()
  gravarRespostas(a, CHAVE_ATUAL, R)
  vincularAoCaso(a, 'CASO_1')
  apagarRespostas(a, 'CASO_1')
  assert.equal(lerRespostas(a, chaveDoCaso('CASO_1')), null)
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
})

test('armazenamento bloqueado ou ausente nunca lança', () => {
  for (const a of [new Quebrado(), null]) {
    assert.equal(gravarRespostas(a, CHAVE_ATUAL, R), false)
    assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
    assert.equal(vincularAoCaso(a, 'CASO_1'), false)
    assert.doesNotThrow(() => apagarRespostas(a, 'CASO_1'))
  }
})

test('objeto de outra versão ou malformado é descartado', () => {
  const a = new Memoria()
  a.setItem(CHAVE_ATUAL, JSON.stringify({ ...R, versao_formato: 2 }))
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
  a.setItem(CHAVE_ATUAL, '{quebrado')
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
  a.setItem(CHAVE_ATUAL, JSON.stringify({ ...R, cliente_conduzia: 'talvez' }))
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
})

test('hoje é a data local, não a UTC (23h30 em Brasília ainda é o mesmo dia)', () => {
  const noite = new Date(2026, 9, 30, 23, 30)
  assert.equal(hojeLocal(noite), '2026-10-30')
  assert.equal(diasAteDataLimite('2026-10-30', noite), 0)
})

test('dias até a data-limite: hoje vale, ontem venceu, inválida é null', () => {
  const agora = new Date(2026, 9, 8, 10, 0)
  assert.equal(diasAteDataLimite('2026-10-30', agora), 22)
  assert.equal(diasAteDataLimite('2026-10-08', agora), 0)
  assert.equal(diasAteDataLimite('2026-10-07', agora), -1)
  assert.equal(diasAteDataLimite('2026-02-30', agora), null)
  assert.equal(diasAteDataLimite('', agora), null)
})

test('erros de cada passo, com os textos da spec', () => {
  const v = RESPOSTAS_VAZIAS
  assert.equal(erroDoPasso(1, v), 'Escolha o estágio do seu caso.')
  assert.equal(erroDoPasso(2, v), 'Informe a data que está impressa na notificação.')
  assert.equal(erroDoPasso(2, { ...v, data_limite: '2026-02-30' }), 'Informe a data que está impressa na notificação.')
  assert.equal(erroDoPasso(3, v), 'Marque uma das opções.')
  assert.equal(erroDoPasso(4, v), 'Marque uma das opções.')
  assert.equal(erroDoPasso(4, { ...v, multa_de_radar: 'sim', velocidade_aferida: '80', velocidade_considerada: '90' }),
    'A velocidade considerada não pode ser maior que a aferida. Confira os números no auto.')
  assert.equal(erroDoPasso(5, v), 'Escolha uma das opções.')
  assert.equal(erroDoPasso(5, { ...v, versao: 'propria', justificativa: '  ' }),
    'Conte o que aconteceu ou escolha a defesa pelos dados do auto.')
  for (const p of [1, 2, 3, 4, 5] as const) assert.equal(erroDoPasso(p, R), null)
  assert.equal(erroDoPasso(5, { ...v, versao: 'sem_versao' }), null)
})

test('campos do formulário a partir das respostas', () => {
  assert.deepEqual(paraCamposDoFormulario(R), {
    estagio: DEFESA_PREVIA, data_limite: '2026-10-30', cliente_conduzia: 'sim', amparoLegal: 'Art. 218, II',
    velocidade_permitida: '80', velocidade_aferida: '91', velocidade_considerada: '84',
    versao: 'propria', justificativa: 'Não vi a placa.',
  })
  // Sem versão: o relato que tenha sobrado no rascunho do questionário não vai.
  assert.equal(paraCamposDoFormulario({ ...R, versao: 'sem_versao' }).justificativa, '')
})

test('rascunho antigo, sem os campos novos, não apaga as respostas', () => {
  const base = { estagio: DEFESA_PREVIA, data_limite: '2026-10-30', nome: '' }
  const rascunho = { nome: 'Fulana', data_limite: '' } as Partial<typeof base>
  assert.deepEqual(mesclarComRascunho(base, rascunho), { estagio: DEFESA_PREVIA, data_limite: '2026-10-30', nome: 'Fulana' })
  assert.deepEqual(mesclarComRascunho(base, null), base)
})
```

Run: `npm run radar:test 2>&1 | grep -E "^# (pass|fail)|Cannot find module" | head -3`
Expected: falha (`Cannot find module …/estagios.ts` ou `…/questionario.ts`).

- [ ] **Step 2: `src/lib/estagios.ts`**

Mover a constante `ESTAGIOS` de `src/pages/Form.tsx` (bloco que começa em `const ESTAGIOS = [`, com o comentário acima dela) para:

```ts
/** As duas peças que o produto redige. O `valor` vai para `especie_documento` e
 *  tem de bater byte a byte com DEFESA_PREVIA e RECURSO_JARI de pipeline/peca.py
 *  (`estagios.test.ts` confere): é por ele que a peça escolhe o destinatário. */
export const DEFESA_PREVIA = 'Notificação de autuação — defesa prévia'
export const RECURSO_JARI = 'Notificação de penalidade — recurso à JARI'

export const ESTAGIOS = [
  {
    valor: DEFESA_PREVIA,
    nome: 'Defesa da autuação',
    descricao:
      'O papel diz "notificação de autuação". A multa ainda não foi aplicada e a peça vai para o próprio órgão autuador.'
  },
  {
    valor: RECURSO_JARI,
    nome: 'Recurso à JARI',
    descricao:
      'O papel diz "notificação de penalidade" e traz o valor a pagar. A peça vai para a Junta Administrativa de Recursos de Infrações.'
  }
] as const
```

Em `src/pages/Form.tsx`, apagar a constante local e acrescentar aos imports `import { ESTAGIOS } from '../lib/estagios';`.

- [ ] **Step 3: `src/lib/questionario.ts`**

```ts
/*
 * Respostas do questionário de triagem (spec 2026-10-07, §6.1). Vivem no
 * navegador: `questionario_atual` enquanto o cliente responde, copiadas para
 * `questionario_<case_id>` no clique para pagar (duas compras seguidas nunca
 * trocam respostas) e apagadas depois do envio do formulário. Toda função recebe
 * o armazenamento por parâmetro: bloqueado ou cheio, nada lança, e o fluxo segue.
 */
import { consideradaMaiorQueAferida } from './velocidade.ts'

export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type RespostasQuestionario = {
  versao_formato: 1
  estagio: string
  data_limite: string
  cliente_conduzia: '' | 'sim' | 'nao'
  multa_de_radar: '' | 'sim' | 'nao'
  amparo_legal: string
  velocidade_permitida: string
  velocidade_aferida: string
  velocidade_considerada: string
  versao: '' | 'propria' | 'sem_versao'
  justificativa: string
}

export const RESPOSTAS_VAZIAS: RespostasQuestionario = {
  versao_formato: 1, estagio: '', data_limite: '', cliente_conduzia: '', multa_de_radar: '',
  amparo_legal: '', velocidade_permitida: '', velocidade_aferida: '', velocidade_considerada: '',
  versao: '', justificativa: '',
}

export const CHAVE_ATUAL = 'questionario_atual'
export const chaveDoCaso = (caseId: string) => `questionario_${caseId}`

export function armazenamentoDoNavegador(): Armazenamento | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const OPCOES: Partial<Record<keyof RespostasQuestionario, readonly string[]>> = {
  cliente_conduzia: ['', 'sim', 'nao'],
  multa_de_radar: ['', 'sim', 'nao'],
  versao: ['', 'propria', 'sem_versao'],
}

function valido(o: unknown): o is RespostasQuestionario {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  if (r.versao_formato !== 1) return false
  for (const chave of Object.keys(RESPOSTAS_VAZIAS) as (keyof RespostasQuestionario)[]) {
    if (chave === 'versao_formato') continue
    if (typeof r[chave] !== 'string') return false
    const opcoes = OPCOES[chave]
    if (opcoes && !opcoes.includes(r[chave] as string)) return false
  }
  return true
}

export function lerRespostas(arm: Armazenamento | null, chave: string): RespostasQuestionario | null {
  if (!arm) return null
  try {
    const cru = arm.getItem(chave)
    if (!cru) return null
    const o = JSON.parse(cru)
    return valido(o) ? { ...RESPOSTAS_VAZIAS, ...o } : null
  } catch {
    return null
  }
}

export function gravarRespostas(arm: Armazenamento | null, chave: string, r: RespostasQuestionario): boolean {
  if (!arm) return false
  try {
    arm.setItem(chave, JSON.stringify(r))
    return true
  } catch {
    return false
  }
}

export function vincularAoCaso(arm: Armazenamento | null, caseId: string): boolean {
  const atual = lerRespostas(arm, CHAVE_ATUAL)
  return atual ? gravarRespostas(arm, chaveDoCaso(caseId), atual) : false
}

export function apagarRespostas(arm: Armazenamento | null, caseId: string): void {
  if (!arm) return
  for (const chave of [chaveDoCaso(caseId), CHAVE_ATUAL]) {
    try {
      arm.removeItem(chave)
    } catch {
      /* bloqueado: nada a apagar */
    }
  }
}

const dois = (n: number) => String(n).padStart(2, '0')

/** A data de hoje no relógio local — nunca `toISOString()`, que é UTC. */
export function hojeLocal(agora: Date): string {
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`
}

function diaUtc(data: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const [a, m, d] = data.split('-').map(Number)
  const t = Date.UTC(a, m - 1, d)
  const dt = new Date(t)
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : null
}

/** Dias de hoje até a data-limite: 0 é hoje (ainda vale), negativo é vencido, null é inválida. */
export function diasAteDataLimite(dataLimite: string, agora: Date): number | null {
  const limite = diaUtc(dataLimite)
  const hoje = diaUtc(hojeLocal(agora))
  if (limite === null || hoje === null) return null
  return Math.round((limite - hoje) / 86_400_000)
}

export function erroDoPasso(passo: 1 | 2 | 3 | 4 | 5, r: RespostasQuestionario): string | null {
  switch (passo) {
    case 1:
      return r.estagio ? null : 'Escolha o estágio do seu caso.'
    case 2:
      return diaUtc(r.data_limite) !== null ? null : 'Informe a data que está impressa na notificação.'
    case 3:
      return r.cliente_conduzia ? null : 'Marque uma das opções.'
    case 4:
      if (!r.multa_de_radar) return 'Marque uma das opções.'
      if (r.multa_de_radar === 'sim' && consideradaMaiorQueAferida(r.velocidade_aferida, r.velocidade_considerada)) {
        return 'A velocidade considerada não pode ser maior que a aferida. Confira os números no auto.'
      }
      return null
    case 5:
      if (!r.versao) return 'Escolha uma das opções.'
      if (r.versao === 'propria' && !r.justificativa.trim()) {
        return 'Conte o que aconteceu ou escolha a defesa pelos dados do auto.'
      }
      return null
  }
}

export type CamposDoQuestionarioNoFormulario = {
  estagio: string; data_limite: string; cliente_conduzia: string; amparoLegal: string
  velocidade_permitida: string; velocidade_aferida: string; velocidade_considerada: string
  versao: string; justificativa: string
}

/** Os nomes são os do `FormData` de `Form.tsx`. */
export function paraCamposDoFormulario(r: RespostasQuestionario): CamposDoQuestionarioNoFormulario {
  return {
    estagio: r.estagio,
    data_limite: r.data_limite,
    cliente_conduzia: r.cliente_conduzia,
    amparoLegal: r.amparo_legal,
    velocidade_permitida: r.velocidade_permitida,
    velocidade_aferida: r.velocidade_aferida,
    velocidade_considerada: r.velocidade_considerada,
    versao: r.versao,
    justificativa: r.versao === 'propria' ? r.justificativa : '',
  }
}

/** O rascunho do formulário é mais recente e prevalece — mas só campo preenchido:
 *  um rascunho de antes do questionário não apaga as respostas com ''. */
export function mesclarComRascunho<T extends object>(base: T, rascunho: Partial<T> | null): T {
  if (!rascunho) return base
  const saida = { ...base }
  for (const [k, v] of Object.entries(rascunho)) {
    if (typeof v === 'string' && v !== '') (saida as Record<string, unknown>)[k] = v
  }
  return saida
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run radar:test 2>&1 | grep -E "^# (pass|fail)"` e `npx eslint src/lib/estagios.ts src/lib/questionario.ts src/pages/Form.tsx && echo eslint-ok` e `npm run build 2>&1 | tail -1`
Expected: `# fail 0`, `eslint-ok`, `✓ built in …`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/estagios.ts src/lib/estagios.test.ts src/lib/questionario.ts src/lib/questionario.test.ts src/pages/Form.tsx
git commit -m "feat(questionario): respostas no navegador, prazo local e estágios compartilhados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 5: O checkout sai da página inicial

**Files:**
- Modify: `src/lib/checkout.ts` (opção `aoCriarCaso` em `CreateCheckoutOptions`)
- Create: `src/hooks/use-checkout.ts`
- Create: `src/components/FalhaCheckout.tsx`
- Modify: `src/pages/Home.tsx`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces (usado pela Task 6):
  - `createCheckout(pricing, { signal?, aoCriarCaso?: (caseId: string) => void })` — `aoCriarCaso` roda depois de guardar o `case_id` e **antes** do redirecionamento ao Stripe.
  - `useCheckout(aoCriarCaso?: (caseId: string) => void): { estado: EstadoCheckout; enviando: boolean; iniciar: () => void }`, com `type EstadoCheckout = { fase: 'ocioso' } | { fase: 'enviando' } | { fase: 'erro'; mensagem: string; tentativas: number }`.
  - `<FalhaCheckout mensagem tentativas aoTentarDeNovo />` (default export).

- [ ] **Step 1: `aoCriarCaso` no `createCheckout`**

Em `src/lib/checkout.ts`, em `CreateCheckoutOptions`, acrescentar:

```ts
  /**
   * Roda com o `case_id` recém-criado, antes de o navegador sair para o Stripe.
   * O questionário usa isto para copiar as respostas para a chave do caso.
   */
  aoCriarCaso?: (caseId: string) => void;
```

e, logo depois do bloco `if (caseId) { try { localStorage.setItem('case_id', caseId); } … }`:

```ts
    if (caseId && options.aoCriarCaso) {
      try {
        options.aoCriarCaso(caseId);
      } catch (err) {
        // Nunca impede o pagamento: o formulário tem o caminho sem questionário.
        console.warn('aoCriarCaso falhou:', err);
      }
    }
```

- [ ] **Step 2: `src/components/FalhaCheckout.tsx`**

Mover para este arquivo, sem mudar o JSX, o componente `FalhaCheckout` de `Home.tsx` (o bloco `const FalhaCheckout = ({ mensagem, tentativas, aoTentarDeNovo }) => (…)`), junto com a constante `SUPORTE_URL` que ele usa:

```tsx
const SUPORTE_URL = import.meta.env.VITE_WHATSAPP_URL as string | undefined;

/** A falha ao abrir o pagamento, com "tentar de novo" e, da segunda vez, o suporte. */
const FalhaCheckout = ({
  mensagem,
  tentativas,
  aoTentarDeNovo
}: {
  mensagem: string;
  tentativas: number;
  aoTentarDeNovo: () => void;
}) => (
  /* o mesmo JSX de hoje, copiado de Home.tsx */
);

export default FalhaCheckout;
```

(copie o JSX literal de `Home.tsx` no lugar do comentário — não reescreva.)

- [ ] **Step 3: `src/hooks/use-checkout.ts`**

Mover de `Home.tsx` para o hook: `TIMEOUT_CHECKOUT_MS`, `MENSAGEM_POR_CAUSA`, `mensagemDaFalha` e a lógica de `iniciarCheckout` (trava `emVooRef`, `AbortController`, corrida com o relógio, `tentativasRef`, limpeza na desmontagem), sem a noção de "origem" (só há um botão no resumo):

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { createCheckout, CheckoutError, type CheckoutErrorCode } from '../lib/checkout';
import { usePromoExpirada } from './use-promo';

const TIMEOUT_CHECKOUT_MS = 15000;

/* MENSAGEM_POR_CAUSA e mensagemDaFalha: copiados de Home.tsx, literais. */

export type EstadoCheckout =
  | { fase: 'ocioso' }
  | { fase: 'enviando' }
  | { fase: 'erro'; mensagem: string; tentativas: number };

export function useCheckout(aoCriarCaso?: (caseId: string) => void) {
  const isPromoExpired = usePromoExpirada();
  const [estado, setEstado] = useState<EstadoCheckout>({ fase: 'ocioso' });
  const emVooRef = useRef(false);
  const tentativasRef = useRef(0);
  const montadoRef = useRef(true);
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const iniciar = useCallback(async () => {
    if (emVooRef.current) return;
    emVooRef.current = true;
    setEstado({ fase: 'enviando' });
    const controller = new AbortController();
    abortRef.current = controller;
    const expirou = new Promise<never>((_, reject) => {
      timeoutRef.current = window.setTimeout(() => {
        controller.abort(new DOMException('Tempo esgotado', 'TimeoutError'));
        reject(new DOMException('Tempo esgotado', 'TimeoutError'));
      }, TIMEOUT_CHECKOUT_MS);
    });
    try {
      await Promise.race([
        createCheckout(isPromoExpired ? 'full' : 'promo', { signal: controller.signal, aoCriarCaso }),
        expirou
      ]);
      tentativasRef.current = 0;
    } catch (erro) {
      emVooRef.current = false;
      if (!montadoRef.current) return;
      if (erro instanceof DOMException && erro.name === 'AbortError') return;
      tentativasRef.current += 1;
      setEstado({ fase: 'erro', mensagem: mensagemDaFalha(erro), tentativas: tentativasRef.current });
    } finally {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      abortRef.current = null;
    }
  }, [isPromoExpired, aoCriarCaso]);

  return { estado, enviando: estado.fase === 'enviando', iniciar };
}
```

Leve junto os comentários que explicam cada trava (estão em `Home.tsx`, dentro de `iniciarCheckout`): eles documentam bugs reais.

- [ ] **Step 4: A página inicial leva ao questionário**

Em `src/pages/Home.tsx`:
1. Remover `iniciarCheckout`, `checkout`/`setCheckout`, os refs `emVooRef`, `tentativasRef`, `montadoRef`, `timeoutRef`, `abortRef`, o `useEffect` de desmontagem do checkout, `CheckoutOrigem`, `CheckoutEstado`, `MENSAGEM_POR_CAUSA`, `mensagemDaFalha`, `TIMEOUT_CHECKOUT_MS`, `FalhaCheckout`, `SUPORTE_URL` (se não sobrar uso) e os imports de `createCheckout`/`CheckoutError` que ficarem sem uso.
2. Os três botões de compra (topo, fechamento e barra fixa) viram `Link` para `/questionario`, com as mesmas classes de hoje no estado ocioso:
   - topo: `<Link to="/questionario" className="btn btn--solid px-8 py-4 text-lg">Gerar meu recurso</Link>`
   - fechamento: `<Link to="/questionario" className="btn btn--inverse px-8 py-4 text-lg">Gerar meu recurso</Link>`
   - barra: `<Link to="/questionario" className="btn btn--solid whitespace-nowrap">Gerar meu recurso</Link>`; na barra, o bloco do erro some e fica só o preço.
3. Remover os blocos `{erroHero && …}`, `{erroCloser && …}` e o ramo `erroBarra` da barra.
4. Em `AvisoDeCompra`, trocar a frase "Depois você preenche o formulário e o PDF chega no e-mail que informar ali." por **"Antes, cinco perguntas rápidas mostram o que a sua defesa vai pedir; depois do pagamento, você completa os dados e o PDF chega no e-mail que informar."**; e, no fechamento, trocar o parágrafo "Depois do pagamento você cai direto no formulário." por **"Antes do pagamento, cinco perguntas rápidas sobre o seu caso."** (sem o `Link` para `/form`).

- [ ] **Step 5: Lint e build**

Run: `npx eslint src/lib/checkout.ts src/hooks/use-checkout.ts src/components/FalhaCheckout.tsx src/pages/Home.tsx && echo eslint-ok` e `npm run build 2>&1 | tail -1`
Expected: `eslint-ok` e `✓ built in …`. (A rota `/questionario` ainda não existe: o `Link` cai no 404 até a Task 6. Não há teste de navegador nesta task.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/checkout.ts src/hooks/use-checkout.ts src/components/FalhaCheckout.tsx src/pages/Home.tsx
git commit -m "refactor(checkout): hook compartilhado; a página inicial leva ao questionário

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 6: A página do questionário

**Files:**
- Create: `src/pages/Questionario.tsx`
- Create: `src/components/questionario/AjudaSemVersao.tsx`
- Create: `src/components/questionario/Resumo.tsx`
- Create: `src/components/questionario/PrazoVencido.tsx`
- Modify: `src/App.tsx` (rota lazy `/questionario`), `vite.config.ts` (prefetch do chunk do questionário)

**Interfaces:**
- Consumes: `ESTAGIOS`, `DEFESA_PREVIA`, `RECURSO_JARI` (Task 4); `RespostasQuestionario`, `RESPOSTAS_VAZIAS`, `CHAVE_ATUAL`, `armazenamentoDoNavegador`, `lerRespostas`, `gravarRespostas`, `vincularAoCaso`, `diasAteDataLimite`, `erroDoPasso` (Task 4); `diagnostico` (Task 3); `useCheckout`, `FalhaCheckout` (Task 5); `usePromoExpirada`, `precoVigente`, `PRECO_CHEIO`, `Countdown`, `PageShell` (existentes); `Popover`, `PopoverTrigger`, `PopoverContent` de `@/components/ui/popover`.
- Produces: rota `/questionario`.

- [ ] **Step 1: `AjudaSemVersao.tsx`**

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** O "?" da opção sem versão (spec 2026-10-07, §4.5): popover, que abre com toque e teclado. */
const AjudaSemVersao = () => (
  <Popover>
    <PopoverTrigger
      type="button"
      aria-label="O que muda se eu escolher a defesa pelos dados do auto?"
      className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border font-mono text-xs"
    >
      ?
    </PopoverTrigger>
    <PopoverContent className="max-w-sm text-sm leading-snug">
      Sem uma versão própria, a defesa se apoia só nos dados do auto: o enquadramento, os números, a
      consistência do auto e os requisitos que a lei exige dele. Quando você não sabe dizer o que levou
      à autuação, essa costuma ser a escolha mais segura: um relato vago ou incerto não ajuda e pode
      enfraquecer a defesa.
    </PopoverContent>
  </Popover>
);

export default AjudaSemVersao;
```

- [ ] **Step 2: `PrazoVencido.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { RECURSO_JARI } from '../../lib/estagios';

/** Spec 2026-10-07, §4.7: não vende a peça de um estágio cujo prazo passou. */
const PrazoVencido = ({ estagio, aoCorrigir }: { estagio: string; aoCorrigir: () => void }) => (
  <div className="max-w-[62ch]" role="alert">
    {estagio === RECURSO_JARI ? (
      <>
        <h2 className="page__title">O prazo para recorrer à JARI passou.</h2>
        <p className="mt-3">
          Um recurso apresentado fora do prazo não suspende a multa e é arquivado (art. 285, §§ 1º e
          5º), então não vamos cobrar por uma peça que não teria efeito. Confira a data com atenção: se
          você digitou errado, volte e corrija.
        </p>
      </>
    ) : (
      <>
        <h2 className="page__title">O prazo da defesa prévia passou, mas o processo não acabou.</h2>
        <p className="mt-3">
          Quando a multa for aplicada, você vai receber a notificação de penalidade, com um prazo novo
          — de pelo menos 30 dias — para recorrer à JARI (art. 282, § 4º). Volte aqui quando ela
          chegar: o recurso apresentado dentro do prazo suspende a penalidade até ser julgado.
        </p>
      </>
    )}
    <div className="mt-6 flex flex-wrap gap-4">
      <button type="button" className="btn btn--solid" onClick={aoCorrigir}>Corrigir a data</button>
      <Link to="/" className="btn btn--ghost">Voltar ao início</Link>
    </div>
  </div>
);

export default PrazoVencido;
```

- [ ] **Step 3: `Resumo.tsx`**

```tsx
import Countdown from '../Countdown';
import FalhaCheckout from '../FalhaCheckout';
import { useCheckout } from '../../hooks/use-checkout';
import { usePromoExpirada } from '../../hooks/use-promo';
import { diagnostico } from '../../lib/diagnostico';
import { DEFESA_PREVIA, ESTAGIOS, RECURSO_JARI } from '../../lib/estagios';
import { PRECO_CHEIO, precoVigente } from '../../lib/preco';
import { armazenamentoDoNavegador, diasAteDataLimite, vincularAoCaso, type RespostasQuestionario } from '../../lib/questionario';

const GARANTIAS_COMUNS = [
  'Os pontos só vão para a sua CNH se a decisão final for contra você (art. 290).',
  'O licenciamento e a transferência do veículo não ficam bloqueados por ela enquanto o processo corre (art. 284, § 3º).',
];
const GARANTIAS: Record<string, string[]> = {
  [DEFESA_PREVIA]: ['A multa ainda não foi aplicada: ela só pode ser depois que a defesa for julgada (art. 282).', ...GARANTIAS_COMUNS],
  [RECURSO_JARI]: [
    'O recurso suspende a penalidade até ser julgado (art. 285).',
    ...GARANTIAS_COMUNS,
    'Você pode pagar a multa com 20% de desconto até o vencimento e recorrer mesmo assim; se o recurso for aceito, o valor volta corrigido (arts. 284, § 2º, e 286, § 2º).',
  ],
};

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

const Resumo = ({ r, aoRevisar }: { r: RespostasQuestionario; aoRevisar: () => void }) => {
  const expirado = usePromoExpirada();
  const { estado, enviando, iniciar } = useCheckout((caseId) => vincularAoCaso(armazenamentoDoNavegador(), caseId));
  const dias = diasAteDataLimite(r.data_limite, new Date()) ?? 0;
  const d = diagnostico(r);
  const nomeEstagio = ESTAGIOS.find((e) => e.valor === r.estagio)?.nome ?? '';

  return (
    <div className="max-w-[62ch]">
      <section className="field mb-6">
        <span className="field__label">Seu caso</span>
        <span className="field__value">
          {nomeEstagio} · {dias === 0 ? 'a data-limite é hoje' : `faltam ${dias} dias para a data-limite (${dataBr(r.data_limite)})`}
        </span>
      </section>

      <section className="mb-6" aria-labelledby="resumo-pedidos">
        <h2 id="resumo-pedidos" className="fieldset__name">O que a defesa vai pedir</h2>
        <p className="mt-2">{d.texto}</p>
        {d.destaque && <p className="mt-2 font-semibold">{d.destaque}</p>}
        {d.complemento && <p className="mt-2">{d.complemento}</p>}
      </section>

      <section className="mb-6" aria-labelledby="resumo-garantias">
        <h2 id="resumo-garantias" className="fieldset__name">O que a lei garante a quem recorre dentro do prazo</h2>
        <ul className="mt-2 list-disc pl-5">
          {(GARANTIAS[r.estagio] ?? GARANTIAS_COMUNS).map((g) => <li key={g}>{g}</li>)}
        </ul>
      </section>

      <section className="offer mb-4">
        <div className="offer__cell">
          <span className="eyebrow block">{expirado ? 'Preço' : 'Preço promocional'}</span>
          <span className="price mt-1 block">
            {!expirado && <s className="price__from">{PRECO_CHEIO}</s>}
            {precoVigente(expirado)}
          </span>
        </div>
        {!expirado && (
          <div className="offer__cell">
            <span className="eyebrow block">Prazo da promoção</span>
            <span className="mt-1 block"><Countdown /></span>
          </div>
        )}
      </section>

      <div className="flex flex-col items-start gap-3">
        <button type="button" onClick={iniciar} disabled={enviando} aria-busy={enviando}
          className={`btn ${enviando ? 'btn--disabled' : 'btn--solid'} px-8 py-4 text-lg`}>
          {enviando ? 'Abrindo pagamento…' : 'Ir para o pagamento'}
        </button>
        <button type="button" className="text-sm underline underline-offset-2" onClick={aoRevisar}>Revisar respostas</button>
        {estado.fase === 'erro' && (
          <FalhaCheckout mensagem={estado.mensagem} tentativas={estado.tentativas} aoTentarDeNovo={iniciar} />
        )}
        <p className="form-hint">O resultado depende da análise do órgão; nenhuma defesa tem resultado garantido.</p>
      </div>
    </div>
  );
};

export default Resumo;
```

Se as classes `.offer`/`.offer__cell`/`.price` não renderizarem bem fora da home, conserve-as (são do design system) e ajuste só espaçamento com utilitários de layout — nunca de cor sobre `.btn--*`.

- [ ] **Step 4: `src/pages/Questionario.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import PageShell from '../components/PageShell';
import AjudaSemVersao from '../components/questionario/AjudaSemVersao';
import PrazoVencido from '../components/questionario/PrazoVencido';
import Resumo from '../components/questionario/Resumo';
import { DEFESA_PREVIA, ESTAGIOS } from '../lib/estagios';
import {
  CHAVE_ATUAL, RESPOSTAS_VAZIAS, armazenamentoDoNavegador, diasAteDataLimite, erroDoPasso,
  gravarRespostas, lerRespostas, type RespostasQuestionario,
} from '../lib/questionario';

type Tela = 1 | 2 | 3 | 4 | 5 | 'resumo' | 'vencido';
const TITULOS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Em que estágio está o seu caso?',
  2: 'Qual é a data-limite que consta da sua notificação?',
  3: 'Era você quem dirigia o veículo no momento da infração?',
  4: 'A multa é de radar, por excesso de velocidade?',
  5: 'Você quer contar o que aconteceu?',
};
const digitos = (v: string) => v.replace(/\D/g, '').slice(0, 3);

const Opcao = ({ nome, valor, atual, rotulo, descricao, invalido, aoEscolher, extra, id }: {
  nome: string; valor: string; atual: string; rotulo: string; descricao?: string; invalido: boolean
  aoEscolher: (v: string) => void; extra?: ReactNode; id?: string
}) => (
  <label className="choice">
    <input type="radio" className="choice__input" id={id} name={nome} value={valor} checked={atual === valor}
      onChange={() => aoEscolher(valor)} aria-invalid={invalido} />
    <span>
      <span className="choice__name">{rotulo}{extra}</span>
      {descricao && <span className="choice__desc">{descricao}</span>}
    </span>
  </label>
);

const Questionario = () => {
  const arm = useRef(armazenamentoDoNavegador()).current;
  const [r, setR] = useState<RespostasQuestionario>(() => lerRespostas(arm, CHAVE_ATUAL) ?? RESPOSTAS_VAZIAS);
  const [tela, setTela] = useState<Tela>(1);
  const [erro, setErro] = useState<string | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { gravarRespostas(arm, CHAVE_ATUAL, r); }, [arm, r]);
  useEffect(() => { window.scrollTo(0, 0); tituloRef.current?.focus(); }, [tela]);

  const mudar = (campo: keyof RespostasQuestionario, valor: string) => {
    setErro(null);
    setR((atual) => ({ ...atual, [campo]: valor }) as RespostasQuestionario);
  };

  const continuar = () => {
    if (typeof tela !== 'number') return;
    const e = erroDoPasso(tela, r);
    if (e) { setErro(e); return; }
    if (tela === 2 && (diasAteDataLimite(r.data_limite, new Date()) ?? 0) < 0) { setTela('vencido'); return; }
    if (tela === 4 && r.multa_de_radar === 'nao') {
      setR((a) => ({ ...a, velocidade_permitida: '', velocidade_aferida: '', velocidade_considerada: '' }));
    }
    setTela(tela === 5 ? 'resumo' : ((tela + 1) as Tela));
  };
  const voltar = () => { setErro(null); if (typeof tela === 'number' && tela > 1) setTela((tela - 1) as Tela); };

  const invalido = Boolean(erro);
  const titulo =
    tela === 'resumo' ? 'O que a sua defesa vai pedir' : tela === 'vencido' ? 'Prazo' : TITULOS[tela];

  return (
    <PageShell>
      <div className="container">
        <div className="max-w-3xl">
          <div className="page__head">
            {typeof tela === 'number' && (
              <div className="progress">
                <span>Passo {tela} de 5</span>
                <span className="progress__bar" aria-hidden="true">
                  <span className="progress__fill" style={{ width: `${tela * 20}%` }} />
                </span>
              </div>
            )}
            <h1 ref={tituloRef} tabIndex={-1} className="page__title">{titulo}</h1>
          </div>

          {tela === 'resumo' && <Resumo r={r} aoRevisar={() => setTela(1)} />}
          {tela === 'vencido' && <PrazoVencido estagio={r.estagio} aoCorrigir={() => setTela(2)} />}

          {typeof tela === 'number' && (
            <form onSubmit={(e) => { e.preventDefault(); continuar(); }} noValidate>
              {tela === 1 && (
                <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                  {ESTAGIOS.map((e, i) => (
                    <Opcao key={e.valor} id={i === 0 ? 'q-campo' : undefined} nome="estagio" valor={e.valor}
                      atual={r.estagio} rotulo={e.nome} descricao={e.descricao} invalido={invalido}
                      aoEscolher={(v) => mudar('estagio', v)} />
                  ))}
                  <p className="form-hint">Está escrito no alto do papel que você recebeu.</p>
                </div>
              )}

              {tela === 2 && (
                <div>
                  <input type="date" id="q-campo" className="form-input max-w-xs" value={r.data_limite}
                    onChange={(e) => mudar('data_limite', e.target.value)} aria-invalid={invalido}
                    aria-describedby="q-dica" />
                  <p className="form-hint" id="q-dica">
                    {r.estagio === DEFESA_PREVIA
                      ? 'Na notificação de autuação, é a data-limite para apresentar defesa prévia ou indicar o condutor.'
                      : 'Na notificação de penalidade, é a data-limite para recorrer — a mesma do vencimento da multa.'}
                  </p>
                </div>
              )}

              {tela === 3 && (
                <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                  <Opcao id="q-campo" nome="cliente_conduzia" valor="sim" atual={r.cliente_conduzia} rotulo="Sim, eu dirigia"
                    invalido={invalido} aoEscolher={(v) => mudar('cliente_conduzia', v)} />
                  <Opcao nome="cliente_conduzia" valor="nao" atual={r.cliente_conduzia} rotulo="Não, outra pessoa dirigia"
                    invalido={invalido} aoEscolher={(v) => mudar('cliente_conduzia', v)} />
                  {r.cliente_conduzia === 'nao' && r.estagio === DEFESA_PREVIA && (
                    <div className="note mt-4">
                      <p className="font-semibold">Indique quem dirigia.</p>
                      <p className="mt-1">
                        Você tem até 30 dias, contados da notificação da autuação, para indicar ao órgão de
                        trânsito o condutor, pelo meio que consta da notificação. Sem a indicação, a
                        responsabilidade pela infração passa a ser sua (art. 257, § 7º, do CTB). A indicação
                        é feita à parte e não substitui a defesa.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {tela === 4 && (
                <div>
                  <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                    <Opcao id="q-campo" nome="multa_de_radar" valor="sim" atual={r.multa_de_radar} rotulo="Sim"
                      invalido={invalido} aoEscolher={(v) => mudar('multa_de_radar', v)} />
                    <Opcao nome="multa_de_radar" valor="nao" atual={r.multa_de_radar} rotulo="Não"
                      invalido={invalido} aoEscolher={(v) => mudar('multa_de_radar', v)} />
                  </div>
                  <label className="form-label mt-5" htmlFor="q-amparo">Enquadramento (amparo legal)</label>
                  <input id="q-amparo" type="text" className="form-input" maxLength={120} placeholder="Art. 218, II, do CTB"
                    value={r.amparo_legal} onChange={(e) => mudar('amparo_legal', e.target.value)} />
                  <p className="form-hint">Copie como está na notificação, no campo do enquadramento ou do amparo legal.</p>
                  {r.multa_de_radar === 'sim' && (
                    <div className="mt-4 grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3">
                      {([
                        ['velocidade_permitida', 'Vel. permitida'],
                        ['velocidade_aferida', 'Vel. aferida'],
                        ['velocidade_considerada', 'Vel. considerada'],
                      ] as const).map(([campo, rotulo]) => (
                        <div key={campo}>
                          <label className="form-label" htmlFor={`q-${campo}`}>{rotulo}</label>
                          <input id={`q-${campo}`} inputMode="numeric" className="form-input" placeholder="km/h"
                            value={r[campo]} onChange={(e) => mudar(campo, digitos(e.target.value))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tela === 5 && (
                <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                  <Opcao id="q-campo" nome="versao" valor="propria" atual={r.versao} rotulo="Quero contar o que aconteceu"
                    invalido={invalido} aoEscolher={(v) => mudar('versao', v)} />
                  {r.versao === 'propria' && (
                    <div className="mb-3">
                      <p className="form-hint" id="q-guia">
                        Algumas perguntas que ajudam: havia placa de velocidade no trecho? Você conhece a via?
                        Houve alguma emergência? Conte só o que você viveu ou viu, com as suas palavras — se
                        não tiver certeza de algo, diga isso.
                      </p>
                      <textarea className="form-input" rows={5} maxLength={4000} aria-describedby="q-guia"
                        aria-label="O que aconteceu" value={r.justificativa}
                        onChange={(e) => mudar('justificativa', e.target.value)} />
                    </div>
                  )}
                  <Opcao nome="versao" valor="sem_versao" atual={r.versao}
                    rotulo="Não tenho uma versão própria — quero a defesa pelos dados do auto"
                    invalido={invalido} aoEscolher={(v) => mudar('versao', v)} extra={<AjudaSemVersao />} />
                </div>
              )}

              {erro && <p className="form-error mt-3" role="alert">{erro}</p>}

              <div className="mt-6 flex flex-wrap gap-4">
                <button type="submit" className="btn btn--solid">Continuar</button>
                {tela > 1 && <button type="button" className="btn btn--ghost" onClick={voltar}>Voltar</button>}
              </div>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default Questionario;
```

O `AjudaSemVersao` fica dentro do `<label>` da opção: pela especificação do HTML, clicar num `<button>` dentro de um `<label>` não ativa o rádio do label. Isso é conferido no navegador (Step 6, item 6). **Não** chame `preventDefault()` no `PopoverTrigger`: o Radix trata o clique prevenido como "não abrir". Se o navegador marcar a opção mesmo assim, tire o `AjudaSemVersao` do `<label>` e ponha-o logo depois dele, dentro de um `<div className="flex items-start gap-2">` que envolva os dois.

- [ ] **Step 5: Rota e prefetch**

Em `src/App.tsx`, junto dos outros `lazyComRetentativa`:

```tsx
const Questionario = lazyComRetentativa(() => import("./pages/Questionario"), "questionario");
```

e `<Route path="/questionario" element={<Questionario />} />` antes de `<Route path="/form" …/>`.

Em `vite.config.ts`, ao lado de `const formulario = …`:

```ts
      // O questionário é o passo seguinte a qualquer botão de compra da home.
      const questionario = Object.keys(bundle).find((f) =>
        /assets\/Questionario-[^.]*\.js$/.test(f)
      );
```

e acrescentar à lista `links`, depois do `formulario`:

```ts
        ...(questionario
          ? [`    <link rel="prefetch" href="/${questionario}" as="script" crossorigin />`]
          : []),
```

- [ ] **Step 6: Lint, build e navegador**

Run: `npx eslint src/pages/Questionario.tsx src/components/questionario src/App.tsx vite.config.ts && echo eslint-ok` e `npm run build 2>&1 | tail -1` e `grep -c 'Questionario-' dist/index.html`
Expected: `eslint-ok`, `✓ built in …`, `1`.

Subir `npm run dev` (conferir com `curl -s localhost:8080/src/pages/Questionario.tsx | grep -c Resumo`) e, com o Playwright:
1. Da home, "Gerar meu recurso" leva a `/questionario`, passo 1.
2. Continuar sem escolher mostra o erro do passo; com a escolha, avança. Repetir nos cinco passos.
3. Passo 2 com data de ontem → tela de prazo vencido (texto da defesa prévia); voltar ao passo 1, escolher JARI, data de ontem → texto da JARI. "Corrigir a data" volta ao passo 2.
4. Os quatro diagnósticos no resumo: (Art 218, II / 80 / 91 / 84) desclassificação; (Art. 218, I / 80 / 85 / 80) arquivamento; (Art. 218, I / 80 / 91 / 84) neutro com advertência; (Art. 218, II / 80 / 101 / 97) neutro sem destaque. Conferir os textos contra a spec §4.6.
5. Com "Não, outra pessoa dirigia" na defesa prévia: o aviso de indicação aparece no passo 3, e a advertência do resumo vem condicionada.
6. O "?" abre e fecha com clique e com teclado (Tab até ele, Enter, Esc) e **não** marca a opção ao abrir.
7. Recarregar no passo 4: as respostas e o passo 1 voltam preenchidos (o passo atual não é guardado; as respostas sim).
8. No resumo, "Ir para o pagamento" chama `create-checkout-session` (com o Supabase local fora, a resposta é erro): aparece o `FalhaCheckout`, e as respostas continuam em `localStorage['questionario_atual']`. **Não concluir pagamento.**

- [ ] **Step 7: Commit**

```bash
git add src/pages/Questionario.tsx src/components/questionario src/App.tsx vite.config.ts
git commit -m "feat(questionario): os cinco passos, o resumo com diagnóstico e o prazo vencido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 7: O formulário enxuto, preenchido pelas respostas

**Files:**
- Modify: `src/pages/Form.tsx`

**Interfaces:**
- Consumes: `armazenamentoDoNavegador`, `lerRespostas`, `chaveDoCaso`, `paraCamposDoFormulario`, `mesclarComRascunho`, `apagarRespostas` (Task 4); `AjudaSemVersao` (Task 6); a Edge aceita `data_limite_protocolo` (Task 2).
- Produces: o POST para `form-submit` leva `data_limite_protocolo` e `justificativa: null` com "sem versão".

- [ ] **Step 1: Estado, mesclagem e envio**

1. Na interface `FormData`, acrescentar `data_limite: string;` e `versao: string; // '' | 'propria' | 'sem_versao'`; em `INITIAL_FORM`, `data_limite: ''` e `versao: ''`.
2. Na montagem (o `setFormData(prev => ({ ...prev, ...(rascunho ?? {}), form_token: …}))` perto de `const rascunho = caseId ? lerRascunho(caseId) : null;`), trocar por:

```tsx
    const respostas = caseId ? lerRespostas(armazenamentoDoNavegador(), chaveDoCaso(caseId)) : null;
    setFormData(prev => {
      const comQuestionario = respostas ? { ...prev, ...paraCamposDoFormulario(respostas) } : prev;
      return {
        ...mesclarComRascunho(comQuestionario, rascunho),
        form_token: token!,
        case_id: caseId ?? prev.case_id,
        stripe_session_id: stripeSessionId ?? prev.stripe_session_id
      };
    });
```

3. Em `normalizeData`, trocar a linha `justificativa: data.justificativa.trim() || null,` por:

```tsx
      justificativa: data.versao === 'propria' ? data.justificativa.trim() || null : null,
      data_limite_protocolo: data.data_limite || null,
```

4. No sucesso do envio (onde hoje há `apagarRascunho(caseId);` dentro de `handleSubmit`), acrescentar logo depois: `apagarRespostas(armazenamentoDoNavegador(), caseId);`.
5. Imports: `import { apagarRespostas, armazenamentoDoNavegador, chaveDoCaso, lerRespostas, mesclarComRascunho, paraCamposDoFormulario } from '../lib/questionario';` `import AjudaSemVersao from '../components/questionario/AjudaSemVersao';` e, no import de `../lib/estagios` (Task 4), acrescentar `DEFESA_PREVIA`: `import { DEFESA_PREVIA, ESTAGIOS } from '../lib/estagios';`.

- [ ] **Step 2: Validação**

Em `validateForm`:
- trocar a checagem `if (!formData.justificativa.trim()) newErrors.justificativa = '…'` por:

```tsx
    if (!formData.data_limite)
      newErrors.data_limite = 'Informe a data que está impressa na notificação.';
    if (!formData.versao)
      newErrors.versao = 'Escolha uma das opções.';
    else if (formData.versao === 'propria' && !formData.justificativa.trim())
      newErrors.justificativa = 'Conte o que aconteceu ou escolha a defesa pelos dados do auto.';
```

- `FIELD_ORDER` passa a começar pelos campos do novo bloco, na ordem visual: `'estagio', 'data_limite', 'cliente_conduzia', 'amparoLegal', 'velocidade_permitida', 'velocidade_aferida', 'velocidade_considerada', 'versao', 'justificativa',` seguidos de `'nomeCompleto', 'cpf', …` (removendo as ocorrências antigas desses nomes do meio da lista).

- [ ] **Step 3: O bloco "Suas respostas"**

Logo depois de `<form onSubmit={handleSubmit} noValidate>` e antes do comentário `{/* ---- Identificação ---- */}`, inserir:

```tsx
          {/* ---- Suas respostas (spec 2026-10-07, §8): vêm do questionário, editáveis ---- */}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">
              <span className="fieldset__name">Suas respostas</span>
              <span className="fieldset__rule" aria-hidden="true" />
            </legend>

            {/* (a) MOVER AQUI o <fieldset className="mb-5"> do estágio, hoje dentro de "Autuação". */}

            <div className="mb-5">
              <label className="form-label" htmlFor="data_limite">Data-limite da notificação *</label>
              <input type="date" id="data_limite" name="data_limite" value={formData.data_limite}
                onChange={handleInputChange} className="form-input max-w-xs"
                aria-invalid={Boolean(errors.data_limite)}
                aria-describedby={errors.data_limite ? 'err-data_limite' : 'hint-data_limite'} />
              {errors.data_limite ? (
                <p className="form-error" id="err-data_limite">{errors.data_limite}</p>
              ) : (
                <p className="form-hint" id="hint-data_limite">
                  {formData.estagio === DEFESA_PREVIA
                    ? 'Na notificação de autuação, é a data-limite para apresentar defesa prévia ou indicar o condutor.'
                    : 'Na notificação de penalidade, é a data-limite para recorrer — a mesma do vencimento da multa.'}
                </p>
              )}
            </div>

            {/* (b) MOVER AQUI o <fieldset className="mb-5"> de "Era você quem dirigia…", hoje em "Sua versão". */}

            {/* (c) MOVER AQUI o bloco do enquadramento (o <div> com label htmlFor="amparoLegal") e o
                bloco das três velocidades com a dica "hint-velocidades", hoje em "Autuação". */}

            <fieldset className="mb-5">
              <legend className="form-label">Você quer contar o que aconteceu? *</legend>
              <div className="choice-group" role="radiogroup" aria-invalid={Boolean(errors.versao)}>
                <label className="choice">
                  <input type="radio" className="choice__input" id="versao" name="versao" value="propria"
                    checked={formData.versao === 'propria'} onChange={handleInputChange}
                    aria-invalid={Boolean(errors.versao)} />
                  <span><span className="choice__name">Quero contar o que aconteceu</span></span>
                </label>
                <label className="choice">
                  <input type="radio" className="choice__input" name="versao" value="sem_versao"
                    checked={formData.versao === 'sem_versao'} onChange={handleInputChange}
                    aria-invalid={Boolean(errors.versao)} />
                  <span>
                    <span className="choice__name">
                      Não tenho uma versão própria — quero a defesa pelos dados do auto
                      <AjudaSemVersao />
                    </span>
                  </span>
                </label>
              </div>
              {errors.versao && <p className="form-error">{errors.versao}</p>}
            </fieldset>

            {/* (d) MOVER AQUI o <label htmlFor="justificativa">, o <textarea id="justificativa"> e o
                <div> da dica/contador que vem depois dele, hoje em "Sua versão", envolvidos em
                {formData.versao === 'propria' && ( … )}. Acima do textarea, a dica passa a ser o
                texto das perguntas-guia da spec §4.5. */}
          </fieldset>
```

Executar os quatro "MOVER AQUI" recortando o JSX existente (sem reescrever) e colando no lugar marcado; depois apagar os comentários de marcação. Ao final, o fieldset "Sua versão" fica vazio: apague-o inteiro. O fieldset "Autuação" fica só com órgão, nº do auto, nº da notificação, a regra dos identificadores, data e hora, expedida em, local, descrição e o medidor. A dica do `textarea` (`hint-justificativa`), hoje "É este texto que a IA usa para montar a defesa.", vira o texto das perguntas-guia; o `placeholder` atual fica.

- [ ] **Step 4: Lint, build e navegador**

Run: `npx eslint src/pages/Form.tsx && echo eslint-ok` e `npm run build 2>&1 | tail -1`
Expected: `eslint-ok` e `✓ built in …`.

Com o Playwright (Vite em :8080):
1. Gravar `questionario_CASO_teste-q` no `localStorage` com as respostas de exemplo (`DEFESA_PREVIA`, `2026-10-30`, `nao`, `Art. 218, II`, `80`/`91`/`84`, `propria`, `Não vi a placa.`) e abrir `/form?case_id=CASO_teste-q`: o bloco "Suas respostas" aparece no topo, preenchido.
2. Abrir `/form?case_id=CASO_outro`: o bloco vem vazio (caminho sem questionário), e enviar vazio mostra os erros de data-limite e de versão, com o foco no primeiro campo do bloco.
3. Marcar "sem versão": o `textarea` some; enviar e conferir no corpo do POST `"justificativa":null` e `"data_limite_protocolo":"2026-10-30"`.
4. Com um rascunho antigo em `rascunho_form_CASO_teste-q` sem `data_limite`, recarregar: a data-limite do questionário continua lá.
5. O "?" do formulário abre e não marca a opção.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Form.tsx
git commit -m "feat(form): bloco 'Suas respostas' preenchido pelo questionário e data-limite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 8: Documentação

**Files:**
- Modify: `CLAUDE.md`, `PENDENCIAS.md`, `PROGRESSO.md`

**Interfaces:**
- Consumes: as Tasks 1 a 7.
- Produces: nada de código.

- [ ] **Step 1: `CLAUDE.md`**

- Em "Fluxo ponta a ponta", item 1: antes do `src/lib/checkout.ts`, acrescentar "A home leva a `/questionario` (cinco passos e um resumo com diagnóstico); o checkout parte da tela de resumo, e `createCheckout(…, { aoCriarCaso })` copia as respostas de `questionario_atual` para `questionario_<case_id>`." E no item 3: "`/form` lê `questionario_<case_id>` e preenche o bloco 'Suas respostas'."
- Em "O schema vive em oito migrations": trocar por "nove migrations" e acrescentar "e a da data-limite de protocolo (07/10/2026)"; "Oito invariantes" vira "Nove invariantes".
- Acrescentar a invariante:

```markdown
- **O diagnóstico do questionário espelha o pipeline, e quem mudar um lado muda o outro.** `src/lib/diagnostico.ts` reimplementa em TypeScript o `parse_ref` (para o art. 218) e o `velocidade.bloco_velocidade`, porque o pipeline não pode ser chamado antes do pagamento. A paridade é garantida por `tests/compartilhados/velocidade.json`, rodado por `pipeline/test_diagnostico_paridade.py` (caminho real: `montar_base` + `bloco_velocidade`) e por `src/lib/diagnostico.test.ts`. Mudou a regra da velocidade ou a gramática do enquadramento? Regere o arquivo de casos pelo pipeline e faça os dois testes passarem. Do mesmo jeito, `ESTAGIOS` vive em `src/lib/estagios.ts` e `estagios.test.ts` confere que os rótulos batem com `DEFESA_PREVIA`/`RECURSO_JARI` do `peca.py`. E a peça pede sempre, nesta ordem, o arquivamento, a desclassificação (quando o `velocidade.py` a aponta) e a advertência (desde 07/10/2026; a spec de 30/09 tinha a desclassificação primeiro).
```

- Na lista de testes Python da seção "Comandos" (`python3 -m unittest test_verificacao …`), acrescentar `test_diagnostico_paridade`.

- [ ] **Step 2: `PENDENCIAS.md`**

- Remover o item "**Perguntas-guia no texto de ajuda de "O que aconteceu?" e a opção "não tenho versão própria"**".
- Acrescentar em "Produto e formulário":

```markdown
- **Projeto 2 do questionário: consulta ao radar antes do pagamento** — depende das pendências da tese do radar (`RADAR_TESE_ATIVA`, avisos legais, `docs/verificacao-radar.md`, ingestão recorrente) e de proteger a consulta aberta a quem ainda não pagou; `sem_registro` não é "radar irregular". → Sessão de 07/10/2026 (questionário de triagem)
- **Projeto 3 do questionário: defesa em nome do condutor** — com "não, outra pessoa dirigia", pedir os dados de quem dirigia e sair a peça em nome dele, como condutor identificado. Depende de conferir no CONTRAN quem pode assinar a defesa e o paralelo com a indicação. Resolver junto com o "cliente que dirigia mas não é o dono". → Sessão de 07/10/2026 (questionário de triagem)
```

- [ ] **Step 3: `PROGRESSO.md`**

Acrescentar `## Sessão de 08/10/2026 — Questionário de triagem antes do pagamento (projeto 1)` com: **Origem** (a ideia do Klaus, os dois objetivos, a divisão em três projetos), **Feito** (o que entrou em cada runtime, com os nomes do código), **Decisões** (as linhas da tabela §2 da spec), **O que a lei garante** (os artigos conferidos: 282, 284 §§ 2º e 3º, 285, 286 § 2º, 290), **Ficou de fora** (deploy e teste ponta a ponta, se ainda não feitos; projetos 2 e 3; contador de funil) e **Arquivos**.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md PENDENCIAS.md PROGRESSO.md
git commit -m "docs: questionário de triagem — invariante da paridade, pendências e sessão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 9: Deploy e teste ponta a ponta

**Files:**
- Modify: `PROGRESSO.md` (fecho da sessão)

**Interfaces:**
- Consumes: as Tasks 1 a 8 integradas e mergeadas na `main` (o merge é do Klaus).
- Produces: migration e `form-submit` publicadas e conferidas; um caso de teste revisado.

**Os comandos de deploy mudam a produção e são do Klaus**, no terminal dele, nesta ordem. Não rodar sem a confirmação explícita dele.

- [ ] **Step 1: Klaus publica**

```powershell
npx supabase db push
npx supabase functions deploy form-submit
```

- [ ] **Step 2: Conferir pelo conector** (`execute_sql`, projeto `tsdzvxgkokrjqayxukud`)

```sql
select data_type, is_nullable, column_default,
       col_description('public.form_submissions'::regclass, ordinal_position) as comentario
from information_schema.columns
where table_schema = 'public' and table_name = 'form_submissions' and column_name = 'data_limite_protocolo';
```

Expected: `date`, `YES`, sem default, com o comentário. E `get_edge_function form-submit`: o código publicado traz `dataLimiteProtocolo`.

- [ ] **Step 3: Teste ponta a ponta pela rota B do README**

O Klaus sobe Express, pipeline (reiniciado), túnel e site (:4173), aponta `DISPATCH_PIPELINE_URL` para o túnel e faz o fluxo inteiro **pelo questionário**: defesa prévia, data-limite futura, "Sim, eu dirigia", Art. 218, II com 80/91/84, "sem versão". Conferir:
- o resumo mostrou a desclassificação em destaque e as garantias da defesa prévia;
- o `/form` abriu com "Suas respostas" preenchido;
- pelo conector: `completed / sent / emailed`, `data_limite_protocolo` gravada, `justificativa` nula;
- no PDF: **a) arquivamento, b) desclassificação para o inciso I, c) advertência**, e fatos só a partir do auto;
- no e-mail (Resend `get-email`): "3. Protocole no órgão de trânsito até dd/mm/aaaa, a data-limite que consta da sua notificação…".

- [ ] **Step 4: Fechar a sessão e limpar**

Acrescentar ao `PROGRESSO.md` o resultado do deploy e do teste. Com a autorização do Klaus, apagar os casos de teste nas tabelas de produção (`generated_documents` → `dispatches` → `radar_consultas_log` → `form_submissions` → `stripe_sessions`) e os PDFs do bucket.

```bash
git add PROGRESSO.md
git commit -m "docs: deploy e teste ponta a ponta do questionário de triagem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```
