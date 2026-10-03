# Amo Recorrer

Venda de recursos de multa de trânsito redigidos por IA (R$ 19,99, ticket único, sem cadastro). O cliente paga no Stripe, preenche o formulário do auto de infração, e o backend redige a peça com o DeepSeek, gera o PDF e o envia por e-mail. Cada pedido é identificado por um **`case_id`** (`CASO_<uuid>`), criado no servidor no momento do checkout.

Onde está o resto da documentação:

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Como o sistema funciona hoje: arquitetura, invariantes, armadilhas conhecidas. |
| `PROGRESSO.md` | O que aconteceu, quando e por quê — histórico de sessões. |
| `PENDENCIAS.md` | Tudo o que está em aberto. |

## Arquitetura

Quatro runtimes, encadeados pelo `case_id`:

| Runtime | Pasta | Papel |
|---|---|---|
| Frontend | `src/` | React 18 + Vite + Tailwind/shadcn: home, formulário, páginas legais |
| Edge Functions | `supabase/functions/` | `create-checkout-session`, `stripe-webhook`, `form-submit` (Deno, no Supabase) |
| API interna | `server/` | Express: o **único** caminho do pipeline até o Postgres (`/internal/*`) |
| Pipeline | `pipeline/` | FastAPI + worker: DeepSeek → PDF (reportlab) → Storage → e-mail |

O fluxo de um pedido:

1. A home chama `create-checkout-session`, que gera o `case_id`, cria a sessão no Stripe e grava em `stripe_sessions`. O Stripe devolve o cliente para `/form?success=true&case_id=…`.
2. O Stripe avisa a `stripe-webhook`, que marca o pagamento como `paid`.
3. O cliente envia o formulário à `form-submit`, que grava o caso, cria o dispatch e manda um POST assinado (HMAC) ao pipeline.
4. O pipeline responde `202` na hora e trabalha em segundo plano: lê o caso pelo Express, monta a base legal do CTB, chama o DeepSeek, gera o PDF, sobe para o bucket privado e envia o e-mail.
5. O pipeline avisa o Express, que fecha o caso (`document_status = completed` ou `failed`).

## Requisitos

- **Node.js 18+** e **npm** (o lockfile é versionado; não use Bun, Yarn ou pnpm).
- **Docker Desktop** e o **Supabase CLI** (`npx supabase`), para o banco local.
- **Python 3.11+** para o pipeline. O `pipeline/.venv` é um venv de **Windows**.
- **Stripe CLI** (`stripe`) para o teste local, e **cloudflared** para o teste contra a nuvem.
- **Rode tudo pelo PowerShell do Windows.** Do WSL, o venv do pipeline não funciona e a Edge em Docker não alcança um pipeline que escute na distro (detalhes em `CLAUDE.md › Armadilhas conhecidas`).

```powershell
npm install
npm install --prefix server
pipeline\.venv\Scripts\pip install -r pipeline\requirements.txt
```

## Variáveis de ambiente: três perfis, todos na raiz

| Arquivo | Perfil | Aponta para |
|---|---|---|
| `.env.local` | testes com o Supabase em **Docker** | `127.0.0.1:54321` |
| `.env` | testes com o Supabase na **nuvem** | o projeto `tsdzvxgkokrjqayxukud` — que **é o de produção** |
| `.env.production` | **lançamento** | produção (ainda com valores `SUBSTITUA_`) |

Nenhum deles vai para o git; os modelos versionados são `.env.local.example`, `.env.example` e `.env.production.example`.

**A regra de precedência é uma só, nos quatro runtimes:** carrega-se o `.env` e depois o `.env.local`, e **quem vem depois ganha**. Ou seja: enquanto o `.env.local` existir, o perfil ativo é o local. Para testar contra a nuvem, **renomeie o `.env.local`** — editar o `.env` não adianta.

Três coisas que confundem:

- **As Edge Functions na nuvem não leem nenhum desses arquivos.** Elas usam os *secrets* do projeto (`npx supabase secrets list` / `set`). O `secrets list` mostra só o SHA-256 de cada valor; para conferir um valor sem expô-lo, compare com o hash do valor do arquivo.
- **`DISPATCH_PIPELINE_HMAC_SECRET` (Edge) e `PIPELINE_HMAC_SECRET` (Express e pipeline) são o mesmo segredo** com dois nomes.
- **O modo de teste do Stripe é uma *sandbox*** ("Área restrita de New business"), não o modo de teste da conta principal "AMO RECORRER" (que é a do live). Os Checkouts de teste nascem na sandbox, e os eventos saem do endpoint de webhook **de lá** — é o segredo dele que vai em `STRIPE_WEBHOOK_SECRET`. Um endpoint criado no modo teste da conta principal nunca recebe evento.

## Testar o fluxo completo

Há dois jeitos, e eles exercitam coisas diferentes:

| | Local (`.env.local`) | Contra a nuvem (`.env`) |
|---|---|---|
| Banco, Storage, Edge Functions | Docker na sua máquina | o projeto de **produção** |
| Como o Stripe avisa o pagamento | `stripe listen`, na sua máquina | o endpoint da sandbox chama a função na nuvem |
| Como a Edge alcança o pipeline | `host.docker.internal:8000` | túnel `trycloudflare` publicado em `DISPATCH_PIPELINE_URL` |
| Porta do site | 8080 | **4173** (a única que os secrets da nuvem aceitam) |
| DeepSeek e SMTP | vazios no `.env.local` de propósito — informados só na janela do pipeline | já preenchidos no `.env` |
| Sujeira que fica | só no Docker | **linhas nas tabelas de produção** — limpe ao fim |
| Quando usar | desenvolvimento, mudança de schema, testes repetidos | antes de publicar; prova o caminho real da internet |

Em ambos, o pagamento é feito com o cartão de teste `4242 4242 4242 4242`, qualquer data futura e qualquer CVC — nenhuma cobrança é real. O PDF vai para o e-mail digitado no formulário.

### A. Local, com `.env.local`

Uma janela de PowerShell por processo, todas na raiz:

```powershell
# 1. Banco local (uma vez; :54321, Studio em :54323)
npx supabase start

# 2. Edge Functions
npx supabase functions serve --env-file .env.local

# 3. Webhook do Stripe para a função local
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
#    Ele imprime um whsec_…: esse valor precisa estar no STRIPE_WEBHOOK_SECRET do
#    .env.local. Se não estiver, troque e reinicie a janela 2 — senão o pagamento
#    nunca é confirmado e o caso fica em "aguardando pagamento".

# 4. Express
npm run dev --prefix server

# 5. Pipeline — chave do DeepSeek e SMTP lidos do .env só para esta janela
cd pipeline
$env:DEEPSEEK_API_KEY = ((Get-Content ..\.env | Select-String '^DEEPSEEK_API_KEY=').Line -replace '^DEEPSEEK_API_KEY=','').Trim('"')
$env:SMTP_HOST = ((Get-Content ..\.env | Select-String '^SMTP_HOST=').Line -replace '^SMTP_HOST=','').Trim('"')
.\.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000
#    --host 0.0.0.0 é obrigatório: é por ele que a Edge, dentro do Docker, chega aqui.

# 6. Site
npm run dev        # http://localhost:8080
```

**Migrations novas no banco local:** o banco local não tem histórico de migrations, então `migration up --local` e `db reset` não servem. Aplique cada arquivo novo direto:

```powershell
Get-Content supabase\migrations\<arquivo>.sql | docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

### B. Contra a nuvem, com `.env` (como em produção)

O site e o pipeline rodam na sua máquina; todo o resto é o ambiente de produção.

```powershell
# 1. Tirar o perfil local do caminho
Rename-Item .env.local .env.local.off
#    Atenção: o .gitignore cobre .env.local, mas não .env.local.off — não faça
#    `git add .` até renomear de volta.

# 2. Em quatro janelas:
npm run dev --prefix server                                                           # Express
cd pipeline; .\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000  # pipeline
cloudflared tunnel --url http://localhost:8000                                        # túnel
npm run dev -- --port 4173 --strictPort                                               # site

# 3. Conferir o túnel e apontar a Edge para ele
#    Abra https://<endereço-do-túnel>/health no navegador: precisa responder {"ok":true}.
npx supabase secrets set DISPATCH_PIPELINE_URL=https://<endereço-do-túnel>/hooks/dispatch
```

Abra o site **por `http://localhost:4173`**, não por `127.0.0.1`: o Stripe devolve o cliente para `localhost`, e o `localStorage` (onde fica o `form_token`) é separado por origem.

Acompanhe pelo Studio do projeto (SQL Editor), pelos logs das funções no painel do Supabase e pela janela do pipeline, que deve mostrar `base legal …`, `velocidade …` e `pipeline ok`:

```sql
select f.case_id, f.document_status, d.status as dispatch, g.status as documento, g.storage_path
from form_submissions f
left join dispatches d using (case_id)
left join generated_documents g on g.dispatch_key = d.dispatch_key;
```

O esperado é `completed`, `sent` e `emailed`.

**Ao terminar:**

1. Feche as quatro janelas. O túnel morre junto; o `DISPATCH_PIPELINE_URL` pode ficar apontando para ele.
2. `Rename-Item .env.local.off .env.local`
3. Apague os casos de teste das tabelas de produção, nesta ordem (as chaves estrangeiras exigem): `generated_documents` → `dispatches` → `radar_consultas_log` → `form_submissions` → `stripe_sessions`. O PDF fica no bucket `generated-recursos` até ser apagado à parte.

**Se travar:**

| Sintoma | Causa provável |
|---|---|
| A `stripe-webhook` responde 400 `No signatures found matching the expected signature` | O `STRIPE_WEBHOOK_SECRET` publicado não é o do endpoint **da sandbox**. |
| `form-submit` responde 403 | O site não está na porta 4173 (ou foi aberto por outro endereço). |
| O caso fica em `pending` com `dispatch` também `pending`, depois do pagamento confirmado | O formulário foi enviado **antes** de o pagamento ser confirmado: a `stripe-webhook` cria o dispatch mas não o entrega ao pipeline (lacuna conhecida, em `PENDENCIAS.md`). Reenvie o formulário alterando o telefone. |
| O caso vai a `failed` no upload do PDF, com `Invalid API key` | O venv tem o `supabase-py` antigo: rode o `pip install -r pipeline\requirements.txt` dos Requisitos. |

## Produção

O que já roda e o que falta — o detalhe de cada item está em `PENDENCIAS.md`.

| Peça | Onde roda | Estado |
|---|---|---|
| Banco, Storage e Edge Functions | projeto Supabase `tsdzvxgkokrjqayxukud` | **no ar** |
| Express e pipeline | VPS na Hostinger, em contêineres, atrás de um Caddy com TLS, em `pipeline.amorecorrer.com` | planejado (`docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md`), **nenhuma task executada** |
| Site (`dist/`) | ainda não decidido — a recomendação é o mesmo VPS, servido pelo Caddy | **nunca esteve no ar** |
| Pagamentos | conta Stripe "AMO RECORRER", modo live | falta criar o produto, os preços e o endpoint de webhook live |
| E-mail | Resend, remetente `@amorecorrer.com` | domínio verificado |

**Como vai funcionar.** No VPS, um `docker compose` sobe três serviços: o pipeline, o Express e o Caddy. Só o pipeline é exposto, e só em `/hooks/dispatch` e `/health`; o Express fica na rede interna, sem porta publicada. A configuração entra por variáveis de ambiente do compose (um `deploy/.env.vps` criado no servidor) — nenhum `.env` vai para dentro de uma imagem. Com `PIPELINE_ENV=production`, o pipeline exige SMTP configurado em vez de pular o e-mail. Na nuvem, o `DISPATCH_PIPELINE_URL` passa a apontar para `https://pipeline.amorecorrer.com/hooks/dispatch`.

**O site** é estático: `npm run build` gera o `dist/`, com as variáveis `VITE_*` de produção (do `.env.production`) **embutidas no build** — trocar uma delas exige um build novo. O host precisa servir o `index.html` para qualquer rota (`/form` é para onde o Stripe devolve o cliente); em Apache, o `public/.htaccess` já faz isso. Os secrets `ORIGIN_WHITELIST` e `FRONTEND_URL` da nuvem precisam bater com o domínio do site.

**Ordem de lançamento.** O site **só vai ao ar junto com o pipeline, ou depois dele**: com o pipeline sem endereço, o cliente pagaria e não receberia nada. Antes do lançamento também precisam estar resolvidos os valores `SUBSTITUA_` do `.env.production`, a conta Stripe live e a lacuna do formulário enviado antes da confirmação do pagamento.

**Publicar mudanças no Supabase** (pelo seu terminal; o CLI precisa de login):

```powershell
npx supabase db push                                  # migrations — sempre ANTES das funções
npx supabase functions deploy form-submit             # e/ou create-checkout-session, stripe-webhook
npx supabase secrets set NOME=valor
```

A migration vem antes da função: uma função que grava numa coluna que ainda não existe derruba todo envio.

## Testes

Nenhum instrumento cobre o fluxo inteiro sozinho — o fluxo completo é o roteiro "Testar o fluxo completo" acima.

```powershell
npm run radar:test      # funções puras do front, do radar e da form-submit (node --test)
npm run lint
npm run build

# Pipeline, de dentro de pipeline/
.\.venv\Scripts\python -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia test_velocidade test_pdf_peca
```

**Nunca rode `unittest discover`** no pipeline: o `test_resend_smtp.py` casa com o padrão e manda um e-mail real ao ser importado.

Há ainda os testes de borda do RPC do radar (pgTAP) e a asserção dos buckets do Storage, ambos contra o banco local — os comandos estão em `CLAUDE.md › Comandos`.

## Estrutura

```
.
├── src/                      # frontend (pages/, components/, lib/, hooks/)
├── supabase/
│   ├── functions/            # create-checkout-session, stripe-webhook, form-submit
│   ├── migrations/           # o schema (baseline + migrations novas)
│   └── tests/                # pgTAP do radar
├── server/                   # Express (/internal/*)
├── pipeline/                 # FastAPI + worker (prompt, base legal, conferência, velocidade, PDF)
├── CTB-compilado_files/      # o CTB compilado do Planalto e o parser (base legal da peça)
├── scripts/                  # utilitários: ingestão dos radares do INMETRO, favicon, paleta
├── tests/                    # asserções SQL e roteiros manuais
└── docs/superpowers/         # specs e planos de cada feature
```

## Segurança

- **A autenticação bearer está desligada.** A infraestrutura existe (`src/lib/auth.ts`, `BEARER_TOKEN_IMPLEMENTATION.md`), mas a validação está comentada nas Edge Functions. Hoje a `form-submit` é protegida pela `ORIGIN_WHITELIST` e pela existência do `case_id`.
- Segredos (`STRIPE_SECRET_KEY`, chaves de serviço do Supabase, o segredo HMAC) ficam só nos `.env` da raiz e nos secrets do projeto — nunca em variáveis `VITE_*`, que entram no bundle do site.
- O Express não deve ser exposto à internet: em produção ele vive só na rede interna do compose.
