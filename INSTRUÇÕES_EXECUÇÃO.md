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
- ✅ DISPATCH_PIPELINE_URL (URL pública do FastAPI; ex. túnel apontando para `http://127.0.0.1:8000/hooks/dispatch`)
- ✅ DISPATCH_PIPELINE_HMAC_SECRET (igual ao `PIPELINE_HMAC_SECRET` da API Express e do `.env` do pipeline)
- ✅ SUPABASE_SERVICE_ROLE_KEY

### Opcional Terminal 4 / 5 — API Express + Pipeline

As Edge chamam primeiro o **FastAPI**. O worker Python chama **Express**, que faz `confirm_dispatch` no Postgres.

API Express (`server/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PIPELINE_HMAC_SECRET`):  
```powershell
cd C:\Users\klaus\Coding\Atlas\amorecorrer.com\server
npm install
npm run dev
```
Pipeline Python (na pasta `pipeline/`, arquivo `.env`; ver `pipeline/.env.example`):  
```powershell
cd C:\Users\klaus\Coding\Atlas\amorecorrer.com\pipeline
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Com **projeto Supabase na nuvem**, use um túnel (Cloudflare/ngrok) e coloque **só** a URL pública HTTPS do listener em `:8000` em `DISPATCH_PIPELINE_URL`; o Express também precisa estar acessível na mesma LAN ou público onde o Python rode.

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
| `supabase/.env.local` | Edge Functions | STRIPE_SECRET_KEY, DISPATCH_PIPELINE_URL, DISPATCH_PIPELINE_HMAC_SECRET, SUPABASE_SERVICE_ROLE_KEY |
| `server/.env` | Express | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIPELINE_HMAC_SECRET |
| `pipeline/.env` | FastAPI/worker | PIPELINE_HMAC_SECRET, EXPRESS_INTERNAL_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STORAGE_BUCKET, DEEPSEEK_API_KEY?, SMTP_*? |

Após `supabase db push`, crie no Dashboard um bucket **privado** (ex.: `generated-recursos`) e políticas de Storage permitindo upload/leitura à **service role** do projeto, para o pipeline gravar os PDFs antes de `generated_documents`.

---

## 🔑 Chaves Configuradas

### Stripe
- Defina sua `STRIPE_SECRET_KEY` de teste/live no `supabase/.env.local` (não compartilhe em repositórios públicos).

### Pipeline (`DISPATCH_PIPELINE_URL`)
- Endpoint `POST …/hooks/dispatch` deve aceitar JSON `{ case_id, email, dispatch_key }` assinado com `DISPATCH_PIPELINE_HMAC_SECRET`. Resposta esperada **`202 Accepted`** para trabalho pesado async.

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

