# Velocidade considerada e a tese de enquadramento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A peça nunca sustenta um enquadramento de velocidade mais grave que o do auto; com a velocidade *considerada* (campo novo), o código calcula o inciso do art. 218 e a peça pede o arquivamento ou a desclassificação quando os números do próprio auto favorecem o cliente.

**Architecture:** O formulário ganha `velocidade_considerada` (migration + Edge, como as outras velocidades). No pipeline, `pipeline/velocidade.py` (puro) decide, a partir da considerada, da permitida e do enquadramento reconhecido pela `base_legal`, se há tese a favor e monta o bloco; `REGRA_ENQUADRAMENTO` no system prompt proíbe, em toda peça, enquadramento mais grave e cálculo de percentual pelo modelo.

**Tech Stack:** React 18 + TS (Vite), `node --test` (Node 22, type-stripping), Supabase Postgres + Edge (Deno), Python 3.12 `unittest` + `fractions`/`decimal`, DeepSeek `deepseek-flash` (só na verificação real).

**Spec:** `docs/superpowers/specs/2026-09-30-velocidade-considerada-design.md` — leia antes de começar.

## Global Constraints

- Branch: `feat/velocidade-considerada` (já existe; a spec está nela).
- Nome do campo, no estado do formulário, no payload e no banco: `velocidade_considerada`.
- Migration nova: `supabase/migrations/20260930000000_velocidade_considerada.sql`. Nenhuma migration existente é editada.
- Mensagem de erro exata: `A velocidade considerada não pode ser maior que a aferida. Confira os números no auto.`
- Dica exata: `No auto de radar vêm a velocidade medida e a considerada, que já desconta a tolerância. Copie as duas como estão.`
- Limites do art. 218, exatos (`Fraction`): I `0 < excesso ≤ 20`; II `20 < excesso ≤ 50`; III `excesso > 50`; `excesso = (considerada − permitida) / permitida × 100`.
- Percentual no texto: uma casa decimal, arredondamento **meio para cima**, vírgula (`21,3%`).
- O sistema **não calcula tolerância** (resolução do CONTRAN não conferida).
- `REGRA_ENQUADRAMENTO` exata: `" Nunca sustente que a conduta se enquadra em dispositivo, inciso ou gravidade mais severos do que os indicados no auto, e não calcule percentuais de excesso de velocidade: use apenas o que vier no bloco sobre o enquadramento, quando houver."`
- Ordem do system prompt: `SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO [+ REGRA_SEM_ENQUADRAMENTO] [+ REGRAS_RADAR]`.
- Fora do `dup_guard`. Não tocar: `build_case_context`, `base_legal`, `conferencia`, radar, contrato do 202.
- Testes Python: `python3 -m unittest <módulos explícitos>` de dentro de `pipeline/`. **Nunca `unittest discover`** (`test_resend_smtp.py` manda e-mail real).
- `pipeline/velocidade.py` e `src/lib/velocidade.ts` só com biblioteca padrão.
- Migration local pelo `psql` (o banco local não tem histórico de migrations; ver `CLAUDE.md`). Nunca `db reset`.
- O Vite no WSL pode não ver edições em `/mnt/c`: reinicie o `npm run dev` antes de conferir no navegador.
- Todo commit termina com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
  ```

## Review Focus

1. **Considerada maior que a aferida chegando por fora do formulário** (API direta, reenvio antigo) — o pipeline não confia no número: sem bloco. Teste na Task 2.
2. **Permitida zero ou ausente** — nada de divisão por zero: sem bloco. Teste na Task 2.
3. **Valor com texto** ("90 km/h", " 90 ") ou booleano — só inteiro positivo ou string só de dígitos conta. Teste na Task 2.
4. **"Art. 218" sem inciso com considerada ≤ permitida** — ainda é `sem_infracao` (não depende do inciso). Teste na Task 2.
5. **Casos antigos sem a coluna** (chave ausente no dict do caso) — sem bloco, sem erro. Teste na Task 2.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/velocidade.ts` | Criar | `consideradaMaiorQueAferida` (pura) |
| `src/lib/velocidade.test.ts` | Criar | `node --test` |
| `src/pages/Form.tsx` | Modificar | Campo, validação, normalização, layout, dica |
| `supabase/migrations/20260930000000_velocidade_considerada.sql` | Criar | Coluna `velocidade_considerada integer` |
| `supabase/functions/form-submit/index.ts` | Modificar | `updateFields` |
| `pipeline/velocidade.py` | Criar | `Bloco`, `inciso_pela_velocidade`, `bloco_velocidade` |
| `pipeline/test_velocidade.py` | Criar | `unittest` |
| `pipeline/prompt.py`, `pipeline/test_prompt.py` | Modificar | `REGRA_ENQUADRAMENTO` e ordem |
| `pipeline/worker.py` | Modificar | Bloco entre o contexto e a base; log |
| `CLAUDE.md`, `PENDENCIAS.md`, `PROGRESSO.md` | Modificar | Invariante, pendências, sessão |

---

### Task 1: O dado — formulário, banco e Edge

**Files:**
- Create: `src/lib/velocidade.ts`, `src/lib/velocidade.test.ts`
- Create: `supabase/migrations/20260930000000_velocidade_considerada.sql`
- Modify: `src/pages/Form.tsx`
- Modify: `supabase/functions/form-submit/index.ts` (linha de `velocidade_aferida` em `updateFields`)

**Interfaces:**
- Produces: `consideradaMaiorQueAferida(aferida: string, considerada: string): boolean`; coluna `form_submissions.velocidade_considerada integer`; payload `velocidade_considerada: number | null`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/velocidade.test.ts`:
```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { consideradaMaiorQueAferida } from './velocidade.ts'

test('considerada maior que a aferida é erro de digitação', () => {
  assert.equal(consideradaMaiorQueAferida('97', '98'), true)
})

test('igual ou menor é o normal', () => {
  assert.equal(consideradaMaiorQueAferida('97', '97'), false)
  assert.equal(consideradaMaiorQueAferida('97', '90'), false)
})

test('com algum dos dois vazio não há o que comparar', () => {
  assert.equal(consideradaMaiorQueAferida('', '90'), false)
  assert.equal(consideradaMaiorQueAferida('97', ''), false)
  assert.equal(consideradaMaiorQueAferida('  ', '  '), false)
})

test('compara número, não texto ("100" > "99")', () => {
  assert.equal(consideradaMaiorQueAferida('99', '100'), true)
  assert.equal(consideradaMaiorQueAferida('100', '99'), false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com && node --test src/lib/velocidade.test.ts 2>&1 | grep -E "ERR_MODULE_NOT_FOUND|^# fail" | head -2
```
Esperado: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar o módulo**

`src/lib/velocidade.ts`:
```ts
/*
 * Velocidade considerada (spec 2026-09-30): é a medida menos a tolerância, e é
 * sobre ela que o auto enquadra o art. 218. Num auto real ela nunca passa da
 * aferida — se passar, é erro de digitação.
 */
export function consideradaMaiorQueAferida(aferida: string, considerada: string): boolean {
  const a = aferida.trim()
  const c = considerada.trim()
  if (!a || !c) return false
  const na = Number(a)
  const nc = Number(c)
  if (!Number.isFinite(na) || !Number.isFinite(nc)) return false
  return nc > na
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
node --test src/lib/velocidade.test.ts 2>&1 | grep -E "^# (pass|fail)"
```
Esperado: `# pass 4`, `# fail 0`.

- [ ] **Step 5: O formulário**

Em `src/pages/Form.tsx`:

1. Import, junto do import de `../lib/medidor`:
```ts
import { consideradaMaiorQueAferida } from '../lib/velocidade';
```
2. Em `interface FormData`, depois de `velocidade_aferida: string;`:
```ts
  velocidade_considerada: string;
```
3. Em `INITIAL_FORM`, depois de `velocidade_aferida: '',`:
```ts
  velocidade_considerada: '',
```
4. Em `FIELD_ORDER`, troque `'velocidade_permitida', 'velocidade_aferida',` por `'velocidade_permitida', 'velocidade_aferida', 'velocidade_considerada',`.
5. Na validação, troque
```ts
    for (const campo of ['velocidade_permitida', 'velocidade_aferida'] as const) {
```
por
```ts
    for (const campo of ['velocidade_permitida', 'velocidade_aferida', 'velocidade_considerada'] as const) {
```
e, logo depois do fim desse `for`, acrescente:
```ts
    // A considerada é a aferida menos a tolerância: nunca passa dela num auto real.
    if (!newErrors.velocidade_considerada &&
        consideradaMaiorQueAferida(formData.velocidade_aferida, formData.velocidade_considerada)) {
      newErrors.velocidade_considerada =
        'A velocidade considerada não pode ser maior que a aferida. Confira os números no auto.';
    }
```
6. Em `handleInputChange`, troque `if (name === 'velocidade_permitida' || name === 'velocidade_aferida') {` por:
```ts
    if (name === 'velocidade_permitida' || name === 'velocidade_aferida' || name === 'velocidade_considerada') {
```
7. Em `normalizeData`, depois de `const vAferida = …;`:
```ts
    const vConsiderada = data.velocidade_considerada.trim() ? parseInt(data.velocidade_considerada, 10) : NaN;
```
e, depois de `velocidade_aferida: Number.isFinite(vAferida) ? vAferida : null,`:
```ts
      velocidade_considerada: Number.isFinite(vConsiderada) ? vConsiderada : null,
```
8. **Layout.** O `<div>` que envolve o campo `amparoLegal` (o que contém `htmlFor="amparoLegal"`) passa a ser `<div className="form-field--wide">`. O bloco das velocidades, hoje `<div className="grid grid-cols-2 gap-x-3">…</div>`, é substituído por:
```tsx
              <div className="form-field--wide">
                <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3">
                  {/* os dois <div> existentes de velocidade_permitida e velocidade_aferida, sem mudança */}
                  <div>
                    <label className="form-label" htmlFor="velocidade_considerada">
                      Vel. considerada
                    </label>
                    <input
                      type="text"
                      id="velocidade_considerada"
                      name="velocidade_considerada"
                      value={formData.velocidade_considerada}
                      onChange={handleInputChange}
                      className="form-input form-input--code"
                      inputMode="numeric"
                      maxLength={3}
                      placeholder="km/h"
                      aria-invalid={Boolean(errors.velocidade_considerada)}
                      aria-describedby={
                        errors.velocidade_considerada ? 'err-velocidade_considerada' : 'hint-velocidades'
                      }
                    />
                    {errors.velocidade_considerada && (
                      <p className="form-error" id="err-velocidade_considerada">
                        {errors.velocidade_considerada}
                      </p>
                    )}
                  </div>
                </div>
                <p className="form-hint" id="hint-velocidades">
                  No auto de radar vêm a velocidade medida e a considerada, que já desconta a
                  tolerância. Copie as duas como estão.
                </p>
              </div>
```
(Os dois `<div>` de permitida e aferida entram **exatamente como estão hoje**, antes do `<div>` da considerada, no lugar do comentário.)

- [ ] **Step 6: Migration e Edge**

`supabase/migrations/20260930000000_velocidade_considerada.sql`:
```sql
-- Velocidade considerada — spec docs/superpowers/specs/2026-09-30-velocidade-considerada-design.md
--
-- Nos autos de radar vêm a velocidade MEDIDA e a CONSIDERADA (a medida menos a
-- tolerância); o enquadramento do art. 218 (I, II, III) sai da considerada. Sem
-- ela, a IA fez a conta sobre a aferida (97/80 = 21,25%) e sustentou o inciso
-- II — mais grave — contra o cliente (29/09/2026). A Fase 4 do radar descartou
-- este campo como "duplicata" de velocidade_aferida: foi um engano.
--
-- Deploy: sobe ANTES da Edge que grava a coluna.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS velocidade_considerada integer;

COMMENT ON COLUMN public.form_submissions.velocidade_considerada IS
  'Velocidade considerada impressa no auto (a medida menos a tolerância), em km/h; é a que define o inciso do art. 218. NULL quando não informada.';
```
Em `supabase/functions/form-submit/index.ts`, depois de `      velocidade_aferida: norm.velocidade_aferida ?? null,`:
```ts
      velocidade_considerada: norm.velocidade_considerada ?? null,
```

- [ ] **Step 7: Build, lint, testes**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
npm run radar:test 2>&1 | grep -E '^# (pass|fail)'
npx eslint src/pages/Form.tsx src/lib/velocidade.ts src/lib/velocidade.test.ts supabase/functions/form-submit/index.ts
npm run lint 2>&1 | grep problems
npm run build 2>&1 | tail -1
```
Esperado: `# pass 53` / `# fail 0` (49 + 4); eslint sem saída; `✖ 14 problems (7 errors, 7 warnings)` (baseline); `✓ built`.

- [ ] **Step 8: Verificação local**

Pré-requisito: Docker e `npx supabase start` no ar.
```bash
C=supabase_db_tsdzvxgkokrjqayxukud
docker exec -i $C psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -f - < supabase/migrations/20260930000000_velocidade_considerada.sql
TMP=$(mktemp -d)
npx supabase functions serve --env-file .env.local > $TMP/functions.log 2>&1 &
docker exec -i $C psql -U postgres -d postgres -Xq -c "insert into stripe_sessions (id, case_id) values ('cs_test_vc_com','CASO_00000000-0000-4000-8000-0000000c0001'),('cs_test_vc_sem','CASO_00000000-0000-4000-8000-0000000c0002');"
timeout 120 bash -c 'until curl -s -o /dev/null -X OPTIONS http://127.0.0.1:54321/functions/v1/form-submit; do sleep 3; done'
for par in "c0001 90" "c0002 null"; do set -- $par
  curl -s -o /dev/null -w "$1 %{http_code}\n" -X POST http://127.0.0.1:54321/functions/v1/form-submit \
    -H "Origin: http://localhost:8080" -H "Content-Type: application/json" \
    -d "{\"case_id\":\"CASO_00000000-0000-4000-8000-0000000$1\",\"form_token\":\"tok-$1\",\"nome\":\"Teste $1\",\"email\":\"$1@example.com\",\"velocidade_permitida\":80,\"velocidade_aferida\":97,\"velocidade_considerada\":$2}"
done
docker exec -i $C psql -U postgres -d postgres -Xq -c "select right(case_id,5), velocidade_aferida, velocidade_considerada from form_submissions where case_id like '%0000000c000%' order by 1;"
docker exec -i $C psql -U postgres -d postgres -Xq -c "delete from form_submissions where case_id like '%0000000c000%'; delete from stripe_sessions where id like 'cs_test_vc_%';"
pkill -f "supabase functions serve"; true
```
Esperado: `c0001 200`, `c0002 200`; na consulta, `c0001 | 97 | 90` e `c0002 | 97 |` (nulo).

No navegador (reinicie o `npm run dev` antes; ver Global Constraints), em `/form?success=true&case_id=CASO_00000000-0000-4000-8000-0000000c0009`: preencha aferida 97 e considerada 98 e tente enviar — a mensagem de erro aparece sob "Vel. considerada". Confira o layout em 1280 px e 390 px (três colunas / empilhado; dica visível).

- [ ] **Step 9: Commit**

```bash
git add src/lib/velocidade.ts src/lib/velocidade.test.ts src/pages/Form.tsx supabase/migrations/20260930000000_velocidade_considerada.sql supabase/functions/form-submit/index.ts
git commit -m "feat(form): velocidade considerada no formulário, no banco e na Edge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 2: A conta — `pipeline/velocidade.py`

**Files:**
- Create: `pipeline/velocidade.py`, `pipeline/test_velocidade.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class Bloco: texto: str; situacao: str` (`"sem_infracao"` ou `"desclassificacao"`)
  - `inciso_pela_velocidade(permitida: int, considerada: int) -> str | None` (`"I" | "II" | "III"`, ou `None` se não há excesso)
  - `bloco_velocidade(case: dict, enquadramento: str | None) -> Bloco | None`

- [ ] **Step 1: Escrever o teste que falha**

`pipeline/test_velocidade.py`:
```python
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

    def test_sem_infracao_pede_arquivamento(self):
        for considerada in (80, 78):
            with self.subTest(considerada=considerada):
                b = bloco_velocidade(caso(80, considerada, 85), "art. 218, I")
                self.assertEqual(b.situacao, "sem_infracao")
                self.assertIn(f"{considerada} km/h", b.texto)
                self.assertIn("art. 281, § 1º, I", b.texto)
                self.assertIn("arquivamento", b.texto)

    def test_sem_infracao_mesmo_sem_inciso_no_auto(self):
        self.assertEqual(bloco_velocidade(caso(80, 78, 85), "art. 218").situacao, "sem_infracao")

    def test_auto_mais_grave_pede_desclassificacao(self):
        b = bloco_velocidade(caso(80, 118, 125), "art. 218, III")  # 47,5% → II
        self.assertEqual(b.situacao, "desclassificacao")
        self.assertIn("47,5%", b.texto)
        self.assertIn("inciso II", b.texto)
        self.assertIn("inciso III", b.texto)
        self.assertIn("desclassificação", b.texto)
        self.assertIn("art. 281, § 1º, I", b.texto)

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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_velocidade 2>&1 | grep -E "Error:" | head -2
```
Esperado: `ModuleNotFoundError: No module named 'velocidade'`.

- [ ] **Step 3: Implementar**

`pipeline/velocidade.py`:
```python
"""O enquadramento da velocidade, decidido em código.

Em 29/09/2026 a IA fez a conta sobre a velocidade aferida (97 num limite de 80
= 21,25%) e sustentou o inciso II do art. 218 — mais grave — contra o cliente.
O enquadramento sai da velocidade CONSIDERADA (a medida menos a tolerância),
impressa no auto. Aqui o código faz a conta e só devolve bloco quando os
números do próprio auto favorecem o cliente; nos casos neutros, silêncio (a
lição do radar: um bloco dizendo "não discuta" fez o modelo discutir).
A tolerância NÃO é calculada: vem de resolução do CONTRAN não conferida.

Spec: docs/superpowers/specs/2026-09-30-velocidade-considerada-design.md.
Puro, sem dependências fora da stdlib.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from typing import Any

_GRAVIDADE = {"I": 1, "II": 2, "III": 3}
_ENQUADRAMENTO_218 = re.compile(r"^art\.\s*218(?:,\s*(III|II|I))?$", re.I)


@dataclass(frozen=True)
class Bloco:
    texto: str
    situacao: str  # "sem_infracao" | "desclassificacao"


def _inteiro(valor: Any) -> int | None:
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor if valor > 0 else None
    if isinstance(valor, str) and valor.strip().isdigit():
        n = int(valor.strip())
        return n if n > 0 else None
    return None


def _excesso(permitida: int, considerada: int) -> Fraction:
    return Fraction(considerada - permitida, permitida) * 100


def inciso_pela_velocidade(permitida: int, considerada: int) -> str | None:
    """Limites do texto do art. 218: I até 20%; II acima de 20% até 50%; III acima de 50%."""
    excesso = _excesso(permitida, considerada)
    if excesso <= 0:
        return None
    if excesso <= 20:
        return "I"
    if excesso <= 50:
        return "II"
    return "III"


def _percentual(excesso: Fraction) -> str:
    valor = (Decimal(excesso.numerator) / Decimal(excesso.denominator)).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP
    )
    return f"{valor}".replace(".", ",") + "%"


def bloco_velocidade(case: dict[str, Any], enquadramento: str | None) -> Bloco | None:
    m = _ENQUADRAMENTO_218.match((enquadramento or "").strip())
    if not m:
        return None
    permitida = _inteiro(case.get("velocidade_permitida"))
    considerada = _inteiro(case.get("velocidade_considerada"))
    if permitida is None or considerada is None:
        return None
    aferida = _inteiro(case.get("velocidade_aferida"))
    if aferida is not None and considerada > aferida:
        return None  # impossível num auto real: não se confia no número

    cabecalho = "Enquadramento da velocidade (conta feita a partir dos números do auto):"
    pela_conta = inciso_pela_velocidade(permitida, considerada)
    if pela_conta is None:
        return Bloco(
            situacao="sem_infracao",
            texto=(
                f"{cabecalho}\n"
                f"- Velocidade considerada no auto: {considerada} km/h; máxima permitida: {permitida} km/h.\n"
                "- Os próprios números do auto não mostram excesso de velocidade.\n"
                "Instrução para a redação: Requeira o arquivamento do auto de infração por "
                "inconsistência, nos termos do art. 281, § 1º, I, do CTB, porque a velocidade "
                "considerada no próprio auto não supera a máxima permitida. Não calcule percentuais."
            ),
        )

    do_auto = (m.group(1) or "").upper()
    if do_auto and _GRAVIDADE[do_auto] > _GRAVIDADE[pela_conta]:
        pct = _percentual(_excesso(permitida, considerada))
        return Bloco(
            situacao="desclassificacao",
            texto=(
                f"{cabecalho}\n"
                f"- Velocidade considerada de {considerada} km/h sobre a máxima de {permitida} km/h: "
                f"excesso de {pct}, que corresponde ao inciso {pela_conta} do art. 218.\n"
                f"- O auto enquadrou a conduta no inciso {do_auto} do art. 218.\n"
                f"Instrução para a redação: Requeira a desclassificação da infração para o inciso "
                f"{pela_conta} do art. 218 e, subsidiariamente, o arquivamento do auto por "
                "inconsistência (art. 281, § 1º, I). Não calcule outros percentuais."
            ),
        )
    return None
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_velocidade -v 2>&1 | tail -3
```
Esperado: `Ran 15 tests`, `OK`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/velocidade.py pipeline/test_velocidade.py
git commit -m "feat(pipeline): enquadramento da velocidade decidido em código

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 3: O prompt e o worker

**Files:**
- Modify: `pipeline/prompt.py`, `pipeline/test_prompt.py`, `pipeline/worker.py`

**Interfaces:**
- Consumes: `bloco_velocidade`, `Bloco` (Task 2); `base.enquadramento` (`base_legal`).
- Produces: `REGRA_ENQUADRAMENTO: str`; `system_prompt(...)` com a ordem nova.

- [ ] **Step 1: Escrever os testes que falham**

Em `pipeline/test_prompt.py`:

1. No `from prompt import (...)`, acrescente `REGRA_ENQUADRAMENTO`.
2. Troque
```python
PROMPT_ANTIGO = SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL
```
por
```python
PROMPT_ANTIGO = SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO
```
3. Em `class TestBaseLegalNoPrompt`, troque as três asserções de ordem:
   - `self.assertEqual(system_prompt(False), SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL)` → `self.assertEqual(system_prompt(False), SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO)`
   - `SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_SEM_ENQUADRAMENTO)` → `SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO + REGRA_SEM_ENQUADRAMENTO)`
   - `SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_SEM_ENQUADRAMENTO + REGRAS_RADAR)` → `SYSTEM_PROMPT_BASE + REGRA_BASE_LEGAL + REGRA_ENQUADRAMENTO + REGRA_SEM_ENQUADRAMENTO + REGRAS_RADAR)`
4. Nessa mesma classe, acrescente:
```python
    def test_regra_de_enquadramento_em_toda_peca(self):
        # 29/09/2026: a IA calculou 97/80 = 21,25% e sustentou o inciso II contra o cliente.
        self.assertIn("mais severos do que os indicados no auto", REGRA_ENQUADRAMENTO)
        self.assertIn("não calcule percentuais de excesso de velocidade", REGRA_ENQUADRAMENTO)
        for args in ((False,), (True, CASO["verificacao_medidor"])):
            with self.subTest(args=args):
                self.assertIn(REGRA_ENQUADRAMENTO, system_prompt(*args))
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_prompt 2>&1 | grep -E "Error:" | head -2
```
Esperado: `ImportError: cannot import name 'REGRA_ENQUADRAMENTO'`.

- [ ] **Step 3: Implementar no prompt**

Em `pipeline/prompt.py`, depois do bloco `REGRA_SEM_ENQUADRAMENTO = (...)`:
```python
# Em toda peça (spec 2026-09-30): a IA calculou 97/80 = 21,25% sobre a
# velocidade aferida e sustentou o inciso II do art. 218 — mais grave — contra o
# cliente. O percentual é do código (velocidade.py), sobre a considerada.
REGRA_ENQUADRAMENTO = (
    " Nunca sustente que a conduta se enquadra em dispositivo, inciso ou gravidade mais "
    "severos do que os indicados no auto, e não calcule percentuais de excesso de "
    "velocidade: use apenas o que vier no bloco sobre o enquadramento, quando houver."
)
```
E, em `system_prompt`, troque
```python
        + REGRA_BASE_LEGAL
```
por
```python
        + REGRA_BASE_LEGAL
        + REGRA_ENQUADRAMENTO
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_prompt test_peca test_verificacao test_base_legal test_conferencia test_velocidade 2>&1 | tail -1
```
Esperado: `OK`.

- [ ] **Step 5: O worker**

Em `pipeline/worker.py`:
1. Nos imports, depois de `from conferencia import gerar_com_conferencia, resumo_alertas`:
```python
from velocidade import bloco_velocidade
```
2. Troque
```python
            usuario = f"{context}\n\n{base.texto}"
```
por
```python
            # Enquadramento da velocidade decidido em código (sobre a considerada);
            # sem bloco nos casos neutros — a REGRA_ENQUADRAMENTO protege.
            bloco_vel = bloco_velocidade(case, base.enquadramento)
            log.info(
                "velocidade case_id=%s situacao=%s",
                payload.case_id, bloco_vel.situacao if bloco_vel else "nenhuma",
            )
            partes = [context] + ([bloco_vel.texto] if bloco_vel else []) + [base.texto]
            usuario = "\n\n".join(partes)
```

- [ ] **Step 6: Compilar e rodar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline
python3 -m py_compile worker.py && echo compila
python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade 2>&1 | tail -1
```
Esperado: `compila`; `OK`.

- [ ] **Step 7: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/prompt.py pipeline/test_prompt.py pipeline/worker.py
git commit -m "feat(pipeline): regra de enquadramento em toda peça e bloco da velocidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 4: Verificação real com o DeepSeek, até o PDF

**Files:** nenhum arquivo do projeto; script descartável num diretório temporário.

- [ ] **Step 1: Dependências e o script**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
TMP=$(mktemp -d); echo $TMP
python3 -m pip install --quiet --target "$TMP/pydeps" -r pipeline/requirements.txt && echo instalado
cat > "$TMP/verificar.py" <<'EOF'
import asyncio, os, re
from config import settings
from worker import call_deepseek, build_pdf_bytes
from prompt import build_case_context, system_prompt
from base_legal import carregar_ctb, montar_base
from conferencia import gerar_com_conferencia, CitacaoForaDaBase
from velocidade import bloco_velocidade
from peca import texto_da_peca

BASE = {"nome": "Mariana Souza Lima", "email": "m@example.com", "cpf": "52998224725", "cidade": "Rio de Janeiro",
        "estado": "RJ", "placa": "RIO2A19", "orgao_autuador": "CET-RIO", "numero_auto": "E123456789",
        "especie_documento": "defesa_previa", "data_infracao": "2026-08-14T07:52:00", "expedida_em": "20/08/2026",
        "local_infracao": "Av. Brasil, 5000", "justificativa": "Não concordo com a multa de velocidade."}
CASOS = {
 "1_o_que_falhou": dict(amparo_legal="Art. 218, I, do CTB", velocidade_permitida=80, velocidade_aferida=97, velocidade_considerada=90),
 "2_desclassificacao": dict(amparo_legal="Art. 218, III, do CTB", velocidade_permitida=80, velocidade_aferida=125, velocidade_considerada=118),
 "3_sem_infracao": dict(amparo_legal="Art. 218, I, do CTB", velocidade_permitida=80, velocidade_aferida=85, velocidade_considerada=78),
 "4_sem_considerada": dict(amparo_legal="Art. 218, I, do CTB", velocidade_permitida=80, velocidade_aferida=97),
}

async def main():
    out = os.environ["OUT"]; ctb = carregar_ctb(settings.ctb_dir)
    for nome, extra in CASOS.items():
        caso = dict(BASE, **extra)
        base = montar_base(ctb, caso["amparo_legal"])
        bloco = bloco_velocidade(caso, base.enquadramento)
        usuario = "\n\n".join([build_case_context(caso)] + ([bloco.texto] if bloco else []) + [base.texto])
        sistema = system_prompt(False, None, sem_enquadramento=base.enquadramento is None)
        async def gerar(h): return await call_deepseek(usuario, sistema, h)
        try:
            peca, _, _ = await gerar_com_conferencia(gerar, base, ctb)
        except CitacaoForaDaBase as e:
            print(nome, "FAILED", e); continue
        open(f"{out}/{nome}.txt", "w").write(peca)
        corpo = "Rascunho gerado para apreciação. Revise antes de protocolar.\n\n" + texto_da_peca(peca, caso)
        open(f"{out}/{nome}.pdf", "wb").write(build_pdf_bytes(f"Recurso — {nome}", corpo))
        print(f"{nome:20} situacao={bloco.situacao if bloco else 'nenhuma':16} "
              f"inciso_II={'inciso II' in peca} pct={'%' in peca} desclass={'desclassific' in peca.lower()} "
              f"arquiv={'arquiv' in peca.lower()}")

asyncio.run(main())
EOF
```

- [ ] **Step 2: Rodar**

```bash
cd pipeline && OUT="$TMP" DEEPSEEK_API_KEY="$(grep -E '^DEEPSEEK_API_KEY=' ../.env | head -1 | cut -d= -f2- | tr -d '\r"')" PYTHONPATH="$TMP/pydeps:." python3 "$TMP/verificar.py" 2> "$TMP/erro.txt"; echo "exit=$?"; tail -3 "$TMP/erro.txt"; cd ..
```
(O `.env.local` deixa a chave vazia de propósito: ela vai só como variável do processo, sem editar arquivo nem imprimir.)

- [ ] **Step 3: Julgar**

| Caso | Critério |
|---|---|
| 1_o_que_falhou | `situacao=nenhuma`, `inciso_II=False`, `pct=False` |
| 2_desclassificacao | `situacao=desclassificacao`, `desclass=True`, `inciso_II=True` |
| 3_sem_infracao | `situacao=sem_infracao`, `arquiv=True`, e o `.txt` cita o art. 281, § 1º, I |
| 4_sem_considerada | `situacao=nenhuma`, `inciso_II=False`, `pct=False` |

Abra os PDFs dos casos 1 e 2. Se o caso 1 ou 4 sustentar inciso mais grave ou calcular percentual, **pare**: o ajuste é na `REGRA_ENQUADRAMENTO` (Task 3), com o teste atualizado, e esta task roda de novo. Guarde a saída para o `PROGRESSO.md`.

---

### Task 5: Documentação e verificação final

**Files:** `CLAUDE.md`, `PENDENCIAS.md`, `PROGRESSO.md`

- [ ] **Step 1: `CLAUDE.md`**

Em "Seis invariantes que quebram em silêncio", troque "Seis" por "Sete" e acrescente, depois do item "Toda peça recebe a base normativa do CTB…":
```markdown
- **A peça nunca sustenta um enquadramento mais grave que o do auto.** `REGRA_ENQUADRAMENTO` vai em toda peça e proíbe o modelo de calcular percentual de velocidade. Quem calcula é `pipeline/velocidade.py`, sobre a velocidade **considerada** (campo `velocidade_considerada`, a medida menos a tolerância, copiada do auto) — não sobre a aferida: foi a conta do modelo sobre a aferida (97/80 = 21,25%) que sustentou o inciso II contra o cliente em 29/09/2026. Só há bloco quando os números do auto favorecem o cliente (considerada ≤ permitida → arquivamento; inciso do auto mais grave que a conta → desclassificação); nos casos neutros, silêncio. O sistema não calcula a tolerância (resolução do CONTRAN não conferida).
```
No parágrafo dos testes Python, acrescente `test_velocidade` ao comando do `unittest`.

- [ ] **Step 2: `PENDENCIAS.md`**

Na seção **A peça (pipeline)**, remova o item **A peça pode argumentar contra o cliente na velocidade** e acrescente:
```markdown
- **Confirmar com um auto real a dica do campo "Vel. considerada"** (texto genérico hoje) e se todo auto de radar do RJ imprime a considerada. → Sessão de 30/09/2026 (velocidade considerada)
- **Publicar a velocidade considerada** — `db push` da migration `20260930000000`, **depois** `functions deploy form-submit`, depois o front. Pelo Klaus. → Sessão de 30/09/2026 (velocidade considerada)
```
Atualize a linha `*Atualizado em …*` para `2026-09-30`.

- [ ] **Step 3: `PROGRESSO.md`**

Acrescente no fim a entrada `## Sessão de 30/09/2026 — Velocidade considerada: a peça não argumenta mais contra o cliente`, no formato da convenção (**Feito / Arquivos / Verificação / Ficou de fora**), registrando: a decisão do Klaus (campo + conta no código), com link para a spec; que o descarte do `velocidadeConsiderada` na Fase 4 do radar foi um engano; a tabela da Task 4; o que ficou de fora (tolerância, deploy). Atualize também, em **Estado atual**, o bullet das três decisões jurídicas: a da velocidade está resolvida.

- [ ] **Step 4: Verificação final**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
(cd pipeline && python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade 2>&1 | tail -1 && python3 -m py_compile worker.py && echo compila)
npm run radar:test 2>&1 | grep -E '^# (pass|fail)'
npm run lint 2>&1 | grep problems
npm run build 2>&1 | tail -1
git status --short
```
Esperado: `OK`; `compila`; `# pass 53` / `# fail 0`; `✖ 14 problems (7 errors, 7 warnings)`; `✓ built`; só os três arquivos de documentação modificados.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md PENDENCIAS.md PROGRESSO.md
git commit -m "docs: velocidade considerada — invariante, pendências e sessão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```
