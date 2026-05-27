# Amo Recorrer

Plataforma web para venda e geração automatizada de recursos de multa. O frontend em React/Vite conduz o usuário do checkout Stripe até o envio do formulário; as Edge Functions no Supabase criam a sessão de pagamento, validam e armazenam os dados do caso e disparam um **pipeline HTTP** (`pipeline/`, FastAPI) que produz PDF, chama IA (DeepSeek opcional), envia e-mail e fecha o ciclo via **API Express** (`server/`).

## 🔐 Autenticação Bearer Token

Este projeto implementa um sistema completo de autenticação com bearer tokens usando Supabase Auth. Todas as requisições para Edge Functions são protegidas com tokens JWT.

**Documentação completa:**
- 📖 [Implementação detalhada](./BEARER_TOKEN_IMPLEMENTATION.md)
- 🚀 [Guia rápido](./AUTH_QUICK_START.md)
- 💡 [Exemplos de código](./src/examples/authentication-examples.tsx)

**Principais recursos:**
- Sessões anônimas automáticas
- Refresh automático de tokens
- Retry em 401 (unauthorized)
- Headers de autenticação padronizados
- Hooks React para gerenciamento de estado

## Funcionalidades principais
- Landing page com contagem regressiva de promoção, CTAs para pagamento e cópia de valor (R$ 19,99).
- Checkout Stripe via Edge Function (`create-checkout-session`), com geração de `case_id` no backend e persistência em `stripe_sessions`.
- Formulário extenso com validação (CPF, CEP, placa Mercosul, campos obrigatórios) e normalização de dados.
- Envio do formulário para Edge Function (`form-submit`) com CORS por whitelist, rate limit por IP, deduplicação (`dup_guard`), atualização de `form_submissions` e despacho via RPC `attempt_dispatch` + POST para URL do pipeline; `confirm_dispatch` é concluído pela API Express quando o Python termina (`202 Accepted` desde a Edge até o trabalho pesado).
- Páginas institucionais (Termos, Privacidade) e rota 404.

## Estrutura de pastas
```
.
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── main.tsx / App.tsx
│   ├── pages/        # Home, Form, Terms, Privacy, NotFound, Index
│   ├── lib/          # checkout.ts, caseId.ts, utils.ts
│   ├── components/   # Countdown, FAQ, ui/ (shadcn)
│   ├── hooks/        # use-mobile, use-toast
│   └── integrations/supabase/ client.ts, types.ts
├── server/              # API Express (casos internos + POST /dispatch/finish)
├── pipeline/            # FastAPI + worker (PDF / DeepSeek / SMTP)
├── supabase/
│   ├── functions/
│   │   ├── create-checkout-session/ (Stripe checkout)
│   │   ├── form-submit/ (processa formulário + dispara pipeline)
│   │   └── stripe-webhook/
│   ├── migrations/
│   └── config.toml.example
├── public/ (favicons, logo, robots.txt)
└── docs auxiliares: INSTRUÇÕES_EXECUÇÃO.md, DIAGNÓSTICO_FORM_SUBMIT.md, COLOR_PALETTE.md
```

## Requisitos do sistema / dependências
- Node.js 18+.
- Gerenciador de pacotes oficial: `npm` (lockfile versionado: `package-lock.json`).
- Não usar Bun/Yarn/pnpm neste repositório para evitar drift de lockfile.
- Supabase CLI (para `supabase start`, `functions serve/deploy`); Deno é usado nas Edge Functions.
- Conta Stripe com `STRIPE_SECRET_KEY`.
- Produção Supabase cloud: URL **HTTPS público** do pipeline (serviço hospedado ou túnel, ex.: Cloudflare Tunnel/ngrok) — as Edge Functions na nuvem não enxergam `localhost`.
- Opcional recomendável: Python 3.11+ e venv para `pipeline/`; Node 18+ para `server/`.
- Principais libs frontend: React 18, Vite 7 (React SWC), TypeScript, Tailwind CSS + shadcn/Radix UI, React Router, TanStack Query, Supabase JS, Stripe SDK.

## Como instalar
```bash
npm install
```

## Atualizar base do Browserslist
Com o repositório padronizado em `npm`, use:
```bash
npx update-browserslist-db@latest
```

## Como configurar variáveis de ambiente
Crie arquivos não versionados:

`./.env.local` (frontend Vite)
```
VITE_CREATE_CHECKOUT_URL=http://127.0.0.1:54321/functions/v1/create-checkout-session
VITE_FORM_SUBMIT_URL=http://127.0.0.1:54321/functions/v1/form-submit
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=sua_publishable_key
VITE_CONTACT_EMAIL=contato@exemplo.com
VITE_WHATSAPP_URL=https://wa.me/55DDDNUMERO
```

`./supabase/.env.local` (Edge Functions)
```
STRIPE_SECRET_KEY=sk_test_...
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
ORIGIN_WHITELIST=http://localhost:8080,http://127.0.0.1:8080
DISPATCH_PIPELINE_URL=https://pipeline-seu-host/hooks/dispatch
DISPATCH_PIPELINE_HMAC_SECRET=mesmo_segredo_do_server_e_do_pipeline

# Opcional: retrocompatível com valores antigos
# N8N_WEBHOOK_URL=...
# N8N_HMAC_SECRET=...
```

Use `supabase/config.toml.example` como referência para um `supabase/config.toml` local (não versionar).

Serviços **`server/`** e **`pipeline/`** (variáveis: ver `server/.env.example`, `pipeline/.env.example`; segredo `PIPELINE_HMAC_SECRET` / `DISPATCH_PIPELINE_HMAC_SECRET` deve ser o mesmo trio Edge + Express + FastAPI).

## Como executar em modo desenvolvimento
1) Supabase local  
```bash
npx supabase start
```
2) Servir Edge Functions (usa `supabase/.env.local`)  
```bash
npx supabase functions serve --env-file supabase/.env.local
```
3) Vite na raiz (porta 8080)  
```bash
npm run dev
```
4) API Express (`server/`).  
```bash
cd server && npm install && npm run dev
```
5) Pipeline Python (`pipeline/`; recomenda-se venv).
```bash
cd pipeline && python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
6) Se usar **Supabase remoto**, exponha `https://...` do passo 5 (e opcionalmente 4) com túnel ou deploy — defina esse URL em `DISPATCH_PIPELINE_URL` nos secrets remotos (`npx supabase secrets set …`).

## Como executar em produção
- Build do frontend estático:
```bash
npm run build
```
- Preview local:
```bash
npm run preview
```
- Publique `dist/` em um host estático mantendo as mesmas variáveis `VITE_*`.
- Faça deploy das Edge Functions no projeto Supabase:
```bash
supabase functions deploy create-checkout-session
supabase functions deploy form-submit
```
- Aplique a migration `supabase/migrations/20250101000002_create_stripe_sessions.sql` e garanta a existência da tabela `form_submissions` e das RPCs `attempt_dispatch` e `confirm_dispatch` no Supabase.
- Configure secrets no Supabase (Stripe, service role, `ORIGIN_WHITELIST`, `DISPATCH_PIPELINE_URL`, `DISPATCH_PIPELINE_HMAC_SECRET`).

## Como rodar testes
Informação não encontrada no repositório atual.

## Fluxos importantes
- **Checkout Stripe (`supabase/functions/create-checkout-session`):** recebe POST JSON, gera `case_id` (UUID) no backend, cria sessão Stripe (modo pagamento, BRL 19,99, metadata `case_id`), persiste em `stripe_sessions` e responde com `url`/`id`/`case_id`. Sucesso redireciona para `/form?success=true&case_id=...`; cancelamento volta para `/?cancel=true`.
- **Formulário (`src/pages/Form.tsx`):** cria `form_token` no `localStorage`, resgata `case_id` da URL/`localStorage`, valida campos obrigatórios e formatos (CPF 11 dígitos, CEP 8 dígitos, placa Mercosul), normaliza dados e envia JSON para `VITE_FORM_SUBMIT_URL`.
- **Edge Function `form-submit`:** CORS por `ORIGIN_WHITELIST`, limite de 64 KB, rate limit 30 req/min por IP. Campos obrigatórios mínimos: `case_id`, `form_token`, `nome`, `email`; deduplicação e bloqueios como acima. Após `attempt_dispatch`, POST JSON para `DISPATCH_PIPELINE_URL` (retrocompatível: `N8N_WEBHOOK_URL`) com HMAC opcional. Resposta **`202 Accepted`** apenas marca `document_status = generating`; **`confirm_dispatch(true|false)`** ocorre no **Express** quando o pipeline concluí (ou continua sendo chamado pela Edge em falhas de rede/respostas não assíncronas herdadas).
- **Fluxo PDF/Storage/IA/email:** `/hooks/dispatch` no Python valida corpo+HMAC → worker busca dados via Express `GET /internal/cases/:caseId` (e-mail oficial = `form_submissions.email`), gera conteúdo (DeepSeek se `DEEPSEEK_API_KEY`), PDF (`reportlab`), **upload no Supabase Storage** (bucket privado; variáveis `SUPABASE_*` + `STORAGE_BUCKET` em `pipeline/.env`), registo em **`generated_documents`** via `POST /internal/generated-documents` (ações `register_pdf` / `email_result`), e-mail (SMTP opcional; `Message-ID` como `provider_message_id`), e por fim `POST /internal/dispatch/finish` na API Express, que atualiza `form_submissions.document_status` e chama RPC `confirm_dispatch`. Criar bucket privado no Dashboard e políticas de Storage para a service role; aplicar migration `20260209130000_generated_documents.sql`.
- **Persistência (`supabase/migrations/20250101000002_create_stripe_sessions.sql`):** tabela `stripe_sessions` com RLS habilitado e política ampla para service role; índices por `case_id` e `created_at`.
- **Rotas do frontend:** `/` (Home), `/form`, `/terms`, `/privacy`, `*` (404). Router em `src/App.tsx`.

## Tecnologias utilizadas
- Frontend: React 18, Vite (React SWC), TypeScript, Tailwind CSS, shadcn/Radix UI, React Router, TanStack Query.
- Backend/Edge: Supabase Edge Functions (Deno), supabase-js, Stripe SDK.
- Utilidades: uuid, date-fns, tailwind-merge/clsx, lucide-react.

## Notas de segurança
- Não exponha `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `DISPATCH_PIPELINE_HMAC_SECRET` / `PIPELINE_HMAC_SECRET` no frontend; apenas em ambientes servidor / secrets Supabase (`server/.env`, `pipeline/.env`, `supabase secrets`).
- Ajuste `ORIGIN_WHITELIST` para os domínios reais; CORS bloqueia origens fora da lista.
- RLS já habilitada em `stripe_sessions`; revise políticas das demais tabelas (a definição de `form_submissions` não está no repositório).
- Use HTTPS em produção e restrinja acesso aos painéis Supabase, Stripe e às rotas `/internal/*`; monitore logs das Edge Functions e do pipeline.
