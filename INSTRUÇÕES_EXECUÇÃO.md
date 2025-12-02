# 🔧 Guia de Execução - Ambiente Local

## ⚠️ PROBLEMA IDENTIFICADO

Você estava executando o Vite de `/src` em vez da **raiz do projeto**:
```powershell
# ❌ INCORRETO
cd src
npm run dev

# ✅ CORRETO
npm run dev  # (Executar da raiz do projeto)
```

Isso causava:
- Vite não encontrar `.env.local` na raiz
- Edge Functions não carregarem `STRIPE_SECRET_KEY`
- Erro "Create checkout failed 500"

---

## 🚀 INSTRUÇÕES CORRETAS

### 1️⃣ Terminal 1 - Iniciar Supabase Local
```powershell
cd C:\Users\klaus\Coding\Atlas\amorecorrer.com
npx supabase start
```

Isso mostrará:
- ✅ API URL: http://127.0.0.1:54321
- ✅ Studio URL: http://127.0.0.1:54323
- ✅ Publishable key: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
- ✅ Secret key: sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz

### 2️⃣ Terminal 2 - Servir Edge Functions
```powershell
cd C:\Users\klaus\Coding\Atlas\amorecorrer.com
npx supabase functions serve --env-file supabase/.env.local
```

Isso carregará:
- ✅ STRIPE_SECRET_KEY do arquivo supabase/.env.local
- ✅ N8N_WEBHOOK_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY

### 3️⃣ Terminal 3 - Iniciar Vite (IMPORTANTE: DA RAIZ)
```powershell
cd C:\Users\klaus\Coding\Atlas\amorecorrer.com
npm run dev
```

**NÃO execute:**
```powershell
cd src
npm run dev  # ❌ ERRADO
```

---

## ✅ Verificação

Depois de iniciar os 3 terminais, teste:

1. Acesse http://localhost:8080
2. Clique em "Pagar R$ 19.99"
3. Você deve ser redirecionado para Stripe Checkout
4. Se vir erro "Create checkout failed 500", verifique:
   - Terminal 2 mostra `serving the request` sem erros?
   - STRIPE_SECRET_KEY está carregado em Terminal 2?

---

## 📋 Arquivos Configurados

| Arquivo | Propósito | Chaves |
|---------|-----------|--------|
| `.env.local` (raiz) | Vite & Frontend | VITE_SUPABASE_URL, VITE_CREATE_CHECKOUT_URL |
| `supabase/.env.local` | Edge Functions | STRIPE_SECRET_KEY, N8N_WEBHOOK_URL, SUPABASE_SERVICE_ROLE_KEY |

---

## 🔑 Chaves Configuradas

### Stripe
- ✅ sk_test_51RrARwPyoFJoyBNVJvg5YFp3OVny2JCYJX3cSLYizdyYtU9no8bAHLZiNZw3dNPAmB68S69WEoGSZBlA8gZMlVmm00GsTvODMB

### n8n (Teste/Staging)
- ✅ Webhook: https://w0danaz.app.n8n.cloud/webhook-test/f49a5305-bce4-4c9a-97be-36ab91f80631
- ✅ Secret: bd0d80a2c5c04f32962ff2d99d52f9e5

---

## 🐛 Se Ainda Tiver Problemas

1. **Limpar cache:**
   ```powershell
   npm run build
   npm cache clean --force
   ```

2. **Reiniciar tudo:**
   ```powershell
   npx supabase stop
   npx supabase start
   ```

3. **Verificar logs:**
   - Terminal 2 (Edge Functions) deve mostrar `serving the request` quando clicar em "Pagar"
   - Terminal 3 (Vite) deve mostrar a requisição HTTP

