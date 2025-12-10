# Amo Recorrer

Plataforma web para venda e geração automatizada de recursos de multa. O frontend em React/Vite conduz o usuário do checkout Stripe até o envio do formulário; as Edge Functions no Supabase criam a sessão de pagamento, validam e armazenam os dados do caso e disparam automações (n8n) após a submissão.

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
- Envio do formulário para Edge Function (`form-submit`) com CORS por whitelist, rate limit por IP, deduplicação (`dup_guard`), atualização de `form_submissions` e tentativa de despacho via RPC + n8n.
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
├── supabase/
│   ├── functions/
│   │   ├── create-checkout-session/ (Stripe checkout)
│   │   └── form-submit/ (processa formulário)
│   ├── migrations/20251130_create_stripe_sessions.sql
│   └── config.toml.example
├── public/ (favicons, logo, robots.txt)
└── docs auxiliares: INSTRUÇÕES_EXECUÇÃO.md, DIAGNÓSTICO_FORM_SUBMIT.md, COLOR_PALETTE.md
```

## Requisitos do sistema / dependências
- Node.js 18+ e npm.
- Supabase CLI (para `supabase start`, `functions serve/deploy`); Deno é usado nas Edge Functions.
- Conta Stripe com `STRIPE_SECRET_KEY`.
- Opcional: endpoint n8n para automação pós-formulário.
- Principais libs: React 18, Vite 7 (React SWC), TypeScript, Tailwind CSS + shadcn/Radix UI, React Router, TanStack Query, Supabase JS, Stripe SDK.

## Como instalar
```bash
npm install
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
N8N_WEBHOOK_URL=https://seu-n8n/webhook...
N8N_HMAC_SECRET=segredo_opcional_para_assinatura
```

Use `supabase/config.toml.example` como referência para um `supabase/config.toml` local (não versionar).

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
- Aplique a migration `supabase/migrations/20251130_create_stripe_sessions.sql` e garanta a existência da tabela `form_submissions` e das RPCs `attempt_dispatch` e `confirm_dispatch` no Supabase.
- Configure secrets no Supabase (Stripe, service role, ORIGIN_WHITELIST, n8n).

## Como rodar testes
Informação não encontrada no repositório atual.

## Fluxos importantes
- **Checkout Stripe (`supabase/functions/create-checkout-session`):** recebe POST JSON, gera `case_id` (UUID) no backend, cria sessão Stripe (modo pagamento, BRL 19,99, metadata `case_id`), persiste em `stripe_sessions` e responde com `url`/`id`/`case_id`. Sucesso redireciona para `/form?success=true&case_id=...`; cancelamento volta para `/?cancel=true`.
- **Formulário (`src/pages/Form.tsx`):** cria `form_token` no `localStorage`, resgata `case_id` da URL/`localStorage`, valida campos obrigatórios e formatos (CPF 11 dígitos, CEP 8 dígitos, placa Mercosul), normaliza dados e envia JSON para `VITE_FORM_SUBMIT_URL`.
- **Edge Function `form-submit`:** CORS baseado em `ORIGIN_WHITELIST`, limite de 64 KB, rate limit 30 req/min por IP. Exige `case_id`, `form_token`, `nome`, `email`; verifica `form_submissions` (atualização com `dup_guard`), bloqueia casos finalizados, evita duplicidade (`dup_guard` ou `stripe_session_id`). Após update chama RPC `attempt_dispatch`; se retorna `dispatch_key`, tenta POST assinado para `N8N_WEBHOOK_URL` e confirma status via `confirm_dispatch`.
- **Persistência (`supabase/migrations/20251130_create_stripe_sessions.sql`):** tabela `stripe_sessions` com RLS habilitado e política ampla para service role; índices por `case_id` e `created_at`.
- **Rotas do frontend:** `/` (Home), `/form`, `/terms`, `/privacy`, `*` (404). Router em `src/App.tsx`.

## Tecnologias utilizadas
- Frontend: React 18, Vite (React SWC), TypeScript, Tailwind CSS, shadcn/Radix UI, React Router, TanStack Query.
- Backend/Edge: Supabase Edge Functions (Deno), supabase-js, Stripe SDK.
- Utilidades: uuid, date-fns, tailwind-merge/clsx, lucide-react.

## Notas de segurança
- Não exponha `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `N8N_HMAC_SECRET` em `.env.local` do frontend; mantenha-os apenas em `supabase/.env.local` ou secrets do projeto Supabase.
- Ajuste `ORIGIN_WHITELIST` para os domínios reais; CORS bloqueia origens fora da lista.
- RLS já habilitada em `stripe_sessions`; revise políticas das demais tabelas (a definição de `form_submissions` não está no repositório).
- Use HTTPS em produção e restrinja acesso ao painel Supabase, Stripe e n8n; monitore logs das Edge Functions para detectar abuso ou falhas de despacho.
