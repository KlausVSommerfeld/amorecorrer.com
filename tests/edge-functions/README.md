# 🧪 Testes das Edge Functions

Este diretório contém scripts e documentação para testar todas as funcionalidades do sistema de checkout e formulário.

## 📋 Pré-requisitos

Certifique-se de que os seguintes serviços estão rodando:

```bash
# Terminal 1: Supabase
cd c:\Users\Klaus\Coding\Atlas\amorecorrer.com
npx supabase start

# Terminal 2: Edge Functions
npx supabase functions serve --env-file supabase/.env.local

# Terminal 3: Frontend (Vite)
npm run dev
```

## 🚀 Executando os Testes

### Opção 1: Testes Individuais (PowerShell)

Execute cada arquivo de teste no PowerShell:

```powershell
# Terminal 4: Testes
cd tests/edge-functions

# Teste 1: create-checkout-session
.\1_test_checkout.ps1

# Teste 2: create-checkout-session + form-submit
.\2_test_form_submit.ps1

# Teste 3: Teste de Duplicação (dup_guard)
.\3_test_dup_guard_detection.ps1

# Teste 4: Fluxo Completo
.\4_test_complete_flow.ps1
```

### Opção 2: Teste Rápido (Bash/PowerShell)

```bash
# Teste simples de conectividade
./quick_test.sh
```

## 📝 Descrição dos Testes

### 1️⃣ **create-checkout-session** (`1_test_checkout.ps1`)

**O que testa:**
- Criação de sessão Stripe
- Geração de case_id único
- Geração de URL de checkout
- Resposta em tempo aceitável (< 5 segundos)

**Resultado esperado:**
```json
{
  "url": "https://checkout.stripe.com/c/pay/...",
  "id": "cs_test_...",
  "case_id": "uuid-aqui"
}
```

**Tempo esperado:** ~2 segundos

---

### 2️⃣ **form-submit** (`2_test_form_submit.ps1`)

**O que testa:**
- Envio de formulário com dados completos
- Persistência em banco de dados
- Cálculo automático de dup_guard
- Validação de CORS (Origin header)

**Dados de teste:**
- Nome: Wilson Witzel
- Email: wilson@test.com
- Telefone: (21) 98649-6452
- CPF: 12345678900
- Endereço: Rua Test 123
- CEP: 22793-266
- Placa: ABC1234
- Órgão Autuador: DETRAN

**Resultado esperado:**
```json
{
  "ok": true,
  "form": {
    "id": "uuid-aqui",
    "case_id": "case_id-aqui",
    "nome": "Wilson Witzel",
    "email": "wilson@test.com",
    "dup_guard": "93c0750b2d11c98a9e1f...",
    "updated_at": "2025-12-10T03:50:00Z"
  }
}
```

**Campos validados:**
- ✅ Form salvo no banco
- ✅ dup_guard calculado (SHA256)
- ✅ updated_at registrado
- ✅ CORS validado

---

### 3️⃣ **dup_guard Detection** (`3_test_dup_guard_detection.ps1`)

**O que testa:**
- Proteção contra envios duplicados
- Idempotência da operação
- dup_guard matching

**Fluxo:**
1. Envia formulário com dados específicos
2. Calcula dup_guard do payload
3. Envia novamente com os MESMOS dados
4. Verifica se retorna "Duplicate submission (no-op)"

**Resultado esperado (2ª submissão):**
```json
{
  "ok": true,
  "message": "Duplicate submission (no-op)",
  "dup_guard": "93c0750b2d11c98a9e1f..."
}
```

**Status HTTP:** 200 (sem erro, apenas no-op)

---

### 4️⃣ **Complete Flow** (`4_test_complete_flow.ps1`)

**O que testa:**
- Fluxo completo: checkout → form → verificação

**Passos:**
1. Cria sessão de checkout
2. Extrai case_id
3. Cria form_submission no banco
4. Envia formulário completo
5. Verifica persistência
6. Confirma dup_guard calculado

**Resultado esperado:**
- ✅ Checkout criado em ~2s
- ✅ Form submission criado
- ✅ Dados salvos corretamente
- ✅ dup_guard presente e válido

---

## 📊 Validações Automáticas

Os scripts testam automaticamente:

| Item | Validação |
|------|-----------|
| **HTTP Status** | 200 ou 201 |
| **Response JSON** | Parsed corretamente |
| **CORS Headers** | Origin header presente |
| **Rate Limit** | < 30 requests/min por IP |
| **Data Persistence** | Registros em BD |
| **dup_guard** | SHA256 válido |
| **Timestamps** | ISO 8601 format |
| **Case ID** | UUID v4 válido |

---

## 🔍 Monitorando Logs

Abra um **5º terminal** para monitorar logs da Edge Functions:

```bash
# Terminal 5: Monitorar logs
cd c:\Users\Klaus\Coding\Atlas\amorecorrer.com
npx supabase functions serve --env-file supabase/.env.local
```

Os logs mostram:
- Tempo de processamento
- Erros de validação
- Operações de BD
- Chamadas a RPC

---

## ⚠️ Troubleshooting

### Erro: "Origin not allowed"
**Solução:** Verifique se `Origin: http://localhost:8080` está sendo enviado

### Erro: "DB error"
**Solução:** Certifique-se de que existe `form_submission` com `case_id` antes de enviar

### Erro: "case_id inválido"
**Solução:** A form_submission não existe. Execute o script de teste completo primeiro

### Timeout na criação de checkout
**Solução:** Verifique se STRIPE_SECRET_KEY está configurado em `supabase/.env.local`

---

## 🧮 Variáveis de Ambiente

Os scripts usam estas variáveis (definidas nos arquivos .ps1):

```powershell
$SUPABASE_URL = "http://127.0.0.1:54321"
$SERVICE_ROLE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
$EDGE_FUNCTIONS_URL = "http://127.0.0.1:54321/functions/v1"
$FRONTEND_ORIGIN = "http://localhost:8080"
```

---

## 📈 Métricas Esperadas

### Tempo de Resposta
- **create-checkout-session**: 1-3s (Stripe API)
- **form-submit**: 200-500ms (BD + validações)
- **form-submit (duplicado)**: 50-100ms (cache + early exit)

### Taxa de Sucesso
- Deve ser 100% em ambiente dev
- Se < 95%, verifique logs da Edge Functions

---

## 🎯 Checklist de Validação Completa

- [ ] Supabase containers rodando (13/13)
- [ ] Edge Functions serving 3 functions
- [ ] Frontend acessível em http://localhost:8080
- [ ] create-checkout-session responde em < 5s
- [ ] form-submit aceita dados completos
- [ ] dup_guard calculado corretamente
- [ ] Duplicações detectadas e bloqueadas
- [ ] Todos os dados persistem em BD
- [ ] CORS validado
- [ ] Rate limit funciona

---

## 🔐 Segurança

Os testes validam:

✅ **CORS**: Origin header verificado
✅ **Rate Limiting**: Max 30 requests/min por IP
✅ **Idempotência**: dup_guard previne duplicações
✅ **Payload Validation**: Size limit 64KB
✅ **Required Fields**: nome, email, case_id obrigatórios
✅ **Data Normalization**: Telefone, CPF, CEP normalizados
✅ **RPC Security**: Triggers e functions com SECURITY DEFINER

---

## 📚 Referências

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Stripe Checkout Session](https://stripe.com/docs/payments/checkout/session)
- [PostgreSQL Triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html)
- [HMAC-SHA256](https://en.wikipedia.org/wiki/HMAC)

---

**Última atualização:** 2025-12-10
**Versão:** 1.0
