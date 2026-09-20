# 🔍 Diagnóstico - Erro do Formulário (form-submit)

## 📋 Checklist de Diagnóstico

### 1️⃣ Verificar o DevTools do Navegador

**Passos:**
1. Abra o formulário em http://localhost:8080/form
2. Pressione `F12` para abrir DevTools
3. Vá para a aba **Console** (não Network)
4. Preencha o formulário e clique em "Enviar"
5. Procure por erros vermelhos

**O que procurar:**
```
❌ CORS error: Access-Control-Allow-Origin
❌ TypeError: fetch failed
❌ Failed to fetch
❌ Error: Invalid JSON
```

### 2️⃣ Verificar a Aba Network do DevTools

1. Vá para a aba **Network** no DevTools
2. Preencha e envie o formulário
3. Procure pela requisição `form-submit`
4. Clique nela e veja:
   - **Status:** Deve ser 200 (sucesso) ou 4xx (erro do cliente)
   - **Response:** Ver a resposta do servidor
   - **Headers:** Ver os headers CORS

### 3️⃣ Verificar os Logs da Edge Function

No terminal onde está rodando `supabase functions serve`, procure por:
```
serving the request with supabase/functions/form-submit
[Error] ...
```

---

## 🐛 Possíveis Causas (ordem de probabilidade)

### **Causa 1: CORS Bloqueado** (Mais provável)

**Sintoma:**
- DevTools mostra: `Access-Control-Allow-Origin header`
- Network tab mostra status 0 ou CORS error

**Por quê:**
A requisição do navegador pode estar vindo de uma origem não autorizada.

**Verificação:**
```typescript
// form-submit/index.ts (linha ~72)
function getAllowedOrigins() {
  const env = Deno.env.get("ORIGIN_WHITELIST") ?? "";
  return env.split(",").map((s)=>s.trim()).filter(Boolean);
}

// Atualmente configurado em supabase/.env.local:
// ORIGIN_WHITELIST=http://localhost:5173,http://127.0.0.1:5173
```

**Seu Vite está rodando em:** `http://localhost:8080`
**Mas a whitelist permite:** `http://localhost:5173` e `http://127.0.0.1:5173`

**SOLUÇÃO:** Atualizar ORIGIN_WHITELIST em `supabase/.env.local`

---

### **Causa 2: form_token Faltando**

**Sintoma:**
- DevTools mostra erro no console
- Response: `{"ok": false, "error": "Missing field: form_token"}`

**Por quê:**
O frontend não está gerando ou enviando o `form_token`.

**Verificação:**
Procurar no código do formulário por onde gera `form_token`.

---

### **Causa 3: case_id Inválido**

**Sintoma:**
- Response: `{"ok": false, "error": "case_id inválido"}`

**Por quê:**
O `case_id` não existe na tabela `form_submissions`.

**Verificação:**
O `case_id` deve ser gerado pelo `create-checkout-session` e retornado ao frontend antes de submeter o formulário.

---

## 📊 Próximos Passos

1. **Verificar DevTools Console** - Copie qualquer erro que aparecer
2. **Verificar Network Tab** - Screenshot da requisição `form-submit`
3. **Verificar ORIGIN_WHITELIST** - Confirmar que `http://localhost:8080` está na lista
4. **Logs da Edge Function** - Copiar qualquer erro que aparecer
