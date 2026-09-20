# FK Relationship Reversal: stripe_sessions.case_id as Primary Reference

## Problema Original
A função Edge `create-checkout-session` estava gerando um novo `case_id` (`CASO_${crypto.randomUUID()}`) e tentando inserir na tabela `stripe_sessions`, violando a constraint FK que apontava para `form_submissions.case_id`:

```
ERROR: violates foreign key constraint 'stripe_sessions_case_id_fkey'
```

## Solução Implementada
Invertemos a relação de Foreign Keys:

### Antes (❌ Incorreto)
```
stripe_sessions.case_id → REFERENCES form_submissions.case_id
form_submissions.case_id → NO FK (apenas UNIQUE)
dispatches.case_id → REFERENCES form_submissions.case_id
```

### Depois (✅ Correto)
```
stripe_sessions.case_id → PRIMARY REFERENCE (UNIQUE, não referencia nada)
form_submissions.case_id → REFERENCES stripe_sessions.case_id (ON DELETE CASCADE)
dispatches.case_id → REFERENCES stripe_sessions.case_id (ON DELETE CASCADE)
```

## Alterações Realizadas

### 1. Migration 20250101000002_create_stripe_sessions.sql
- Adicionada constraint UNIQUE **nomeada**: `stripe_sessions_case_id_unique`
- Agora `stripe_sessions.case_id` é a chave referenciada por outras tabelas

```sql
CONSTRAINT stripe_sessions_case_id_unique UNIQUE (case_id)
```

### 2. Migration 20250101000003_create_form_submissions.sql
- **Removida** a FK que apontava para `form_submissions.case_id`
- A FK será adicionada pela nova migration 20260116

### 3. Migration 20250101000004_create_dispatch_tables.sql
- **Removida** a FK que apontava para `form_submissions.case_id`
- A FK será adicionada pela nova migration 20260116

### 4. Migration 20260109134917_remote_schema.sql
- Corrigido: Adicionado `IF EXISTS` no DROP da constraint `stripe_sessions_case_id_key`
- Corrigido: Adicionado DROP da constraint `stripe_sessions_case_id_unique`

### 5. **Nova Migration: 20260116_revert_fk_stripe_sessions_primary.sql** ✨
```sql
-- Add FK in form_submissions to reference stripe_sessions.case_id
ALTER TABLE public.form_submissions
ADD CONSTRAINT form_submissions_case_id_fkey
FOREIGN KEY (case_id) REFERENCES public.stripe_sessions(case_id) ON DELETE CASCADE;

-- Add FK in dispatches to reference stripe_sessions.case_id
ALTER TABLE public.dispatches
ADD CONSTRAINT dispatches_case_id_fkey
FOREIGN KEY (case_id) REFERENCES public.stripe_sessions(case_id) ON DELETE CASCADE;
```

## Impacto no Workflow

### Antes ❌
1. `form-submit` function tenta gerar `case_id`
2. `create-checkout-session` cria uma nova `stripe_sessions` com FK para `form_submissions`
3. **PROBLEMA**: Se `form_submissions` ainda não existe, FK constraint falha

### Depois ✅
1. `create-checkout-session` gera `case_id` e insere em `stripe_sessions`
2. `form-submit` function recebe este `case_id` como FK referência
3. **CORRETO**: `stripe_sessions` é criado primeiro, depois `form_submissions` o referencia

## Verificação do Banco de Dados

✅ Todas as 7 migrations aplicadas com sucesso:
```
Applying migration 20250101000001_create_trigger_functions.sql...
Applying migration 20250101000002_create_stripe_sessions.sql...
Applying migration 20250101000003_create_form_submissions.sql...
Applying migration 20250101000004_create_dispatch_tables.sql...
Applying migration 20250101000005_create_dispatch_functions.sql...
Applying migration 20251231000001_alter_data_infracao_to_timestamp.sql...
Applying migration 20260109134917_remote_schema.sql...
Applying migration 20260116_revert_fk_stripe_sessions_primary.sql...
```

✅ Edge Functions deployadas com sucesso:
```
create-checkout-session
form-submit
stripe-webhook
```

## Estrutura Final das FK Constraints

```
stripe_sessions (PRIMARY SOURCE OF TRUTH)
├── stripe_sessions.case_id (UNIQUE, gerado por create-checkout-session)

form_submissions (REFERENCIA stripe_sessions)
├── form_submissions.case_id → stripe_sessions.case_id (FK, ON DELETE CASCADE)
├── form_submissions.stripe_session_id → stripe_sessions.id (FK)

dispatches (REFERENCIA stripe_sessions)
├── dispatches.case_id → stripe_sessions.case_id (FK, ON DELETE CASCADE)
├── dispatches.stripe_session_id → stripe_sessions.id (FK)
```

## Próximos Passos

1. **Atualizar a função `create-checkout-session`** para garantir que:
   - Gera o `case_id` corretamente
   - Insere em `stripe_sessions` com sucesso
   - Retorna o `case_id` para o frontend

2. **Atualizar a função `form-submit`** para:
   - Receber o `case_id` gerado por `create-checkout-session`
   - Usar este `case_id` ao inserir em `form_submissions`

3. **Testar o fluxo completo:**
   - Checkout → `create-checkout-session` (gera case_id em stripe_sessions)
   - Form submission → `form-submit` (insere com case_id referenciando stripe_sessions)
   - Dispatch → `attempt_dispatch` (referencia stripe_sessions.case_id)
