# 🚀 Quick Start - Executar os Testes

## ⚙️ Pré-requisitos (Executar UMA VEZ)

Abra 3 terminais PowerShell:

### Terminal 1: Supabase
```powershell
cd C:\Users\Klaus\Coding\Atlas\amorecorrer.com
npx supabase start
```

### Terminal 2: Edge Functions
```powershell
cd C:\Users\Klaus\Coding\Atlas\amorecorrer.com
npx supabase functions serve --env-file supabase/.env.local
```

### Terminal 3: Frontend (opcional, para testes no browser)
```powershell
cd C:\Users\Klaus\Coding\Atlas\amorecorrer.com
npm run dev
```

---

## 🧪 Executando os Testes (Terminal 4)

```powershell
cd C:\Users\Klaus\Coding\Atlas\amorecorrer.com\tests\edge-functions

# Teste 1: Criar Checkout
.\1_test_checkout.ps1

# Teste 2: Enviar Formulário
.\2_test_form_submit.ps1

# Teste 3: Testar Duplicação (dup_guard)
.\3_test_dup_guard_detection.ps1

# Teste 4: Fluxo Completo (End-to-End)
.\4_test_complete_flow.ps1
```

---

## ✅ Resultado Esperado

Todos os 4 scripts devem retornar **✅ SUCESSO** ao final.

### Tempos de Resposta Esperados

| Teste | Tempo | Status |
|-------|-------|--------|
| create-checkout-session | 1-3s | ✅ OK |
| form-submit | 200-500ms | ✅ OK |
| dup_guard detection | 100-200ms (2ª submissão) | ✅ OK |
| complete flow | 5-10s | ✅ OK |

---

## 🔍 Troubleshooting Rápido

| Erro | Solução |
|------|---------|
| "Origin not allowed" | Edge Function valida Origin header. Enviado automaticamente nos scripts |
| "case_id inválido" | form_submission precisa existir antes de enviar dados. Os scripts criam automaticamente |
| "DB error" | Verificar se Supabase está rodando (Terminal 1) |
| Timeout > 10s | Stripe pode estar lento. Tente novamente |

---

## 📈 Validações Automáticas

Os scripts validam:

✅ HTTP Status 200/201
✅ Response JSON válido
✅ UUIDs válidos (case_id)
✅ dup_guard calculado (SHA256)
✅ Timestamps ISO 8601
✅ Duplicações detectadas
✅ Dados persistidos no banco

---

## 📚 Arquivos de Teste

| Script | Função |
|--------|--------|
| `1_test_checkout.ps1` | Testa create-checkout-session |
| `2_test_form_submit.ps1` | Testa form-submit com dados completos |
| `3_test_dup_guard_detection.ps1` | Testa proteção contra duplicação |
| `4_test_complete_flow.ps1` | Testa fluxo completo (e2e) |
| `README.md` | Documentação completa |

---

## 🎯 Checklist Antes de Commitar

- [ ] Terminal 1 (Supabase): 13/13 containers rodando
- [ ] Terminal 2 (Edge Functions): 3/3 functions serving
- [ ] Terminal 3 (Frontend): rodando em http://localhost:8080
- [ ] Executar `.\4_test_complete_flow.ps1` → ✅ SUCESSO
- [ ] Sem erros de validação

---

**Última atualização:** 2025-12-10
