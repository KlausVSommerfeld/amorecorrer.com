# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Histórico e pendências:** este arquivo descreve *como o sistema funciona hoje*. Para *o que aconteceu, quando e o que ficou em aberto*, leia `PROGRESSO.md` — e acrescente uma entrada lá ao fim de qualquer sessão que mude algo relevante.

## Produto

**Amo Recorrer** vende recursos de multa de trânsito gerados por IA (R$ 19,99, ticket único, sem cadastro de usuário). O usuário paga primeiro no Stripe, depois preenche o formulário do auto de infração; o backend redige a peça com IA, gera um PDF e envia por e-mail. A identidade de um pedido é o **`case_id`** (`CASO_<uuid>`), gerado no backend no momento do checkout — ele amarra todas as tabelas e todos os serviços.

## Comandos

```bash
npm install                 # gerenciador oficial: npm (lockfile versionado). Não usar bun/yarn/pnpm.
npm run dev                 # Vite em :8080 — SEMPRE da raiz, nunca de dentro de src/
npm run build               # build de produção -> dist/
npm run lint                # eslint

npx supabase start                                              # stack local (:54321, studio :54323)
npx supabase functions serve --env-file .env.local              # edge functions locais
npx supabase db push                                            # aplica migrations
npx supabase functions deploy create-checkout-session           # deploy individual
npx supabase secrets set KEY=value                              # secrets do projeto remoto

npm run dev --prefix server  # API Express :3001 (tsx watch)
npm run build --prefix server

# pipeline Python (a partir de pipeline/)
python -m venv .venv && pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**Testes:** não há suíte automatizada. `tests/edge-functions/*.ps1` são 4 scripts PowerShell manuais, executáveis individualmente (`.\2_test_form_submit.ps1`) com os serviços acima no ar. Ver `tests/edge-functions/README.md`.

O ciclo completo local exige 5 processos: Supabase, functions serve, Vite, Express e FastAPI. Com Supabase **na nuvem**, as Edge Functions não enxergam `localhost` — o pipeline precisa de URL HTTPS pública (túnel Cloudflare/ngrok) em `DISPATCH_PIPELINE_URL`.

## Arquitetura

Quatro runtimes independentes encadeados por um `case_id`:

| Runtime | Stack | Papel |
|---|---|---|
| `src/` | React 18 + Vite + Tailwind/shadcn | landing, formulário, páginas legais |
| `supabase/functions/` | Deno | `create-checkout-session`, `stripe-webhook`, `form-submit` |
| `server/` | Express + TS | API `/internal/*` — **único** caminho do pipeline até o Postgres |
| `pipeline/` | FastAPI + worker async | DeepSeek → PDF (reportlab) → Storage → SMTP |

### Fluxo ponta a ponta

1. `src/lib/checkout.ts` → edge `create-checkout-session`: gera `case_id` **no servidor**, cria a sessão Stripe (`client_reference_id` + `metadata.case_id`), grava em `stripe_sessions`. Sucesso → `/form?success=true&case_id=…`.
2. `stripe-webhook`: valida assinatura, promove `payment_status` (`shouldPromoteStatus` impede rebaixar `paid`), liga `form_submissions.stripe_session_id` e, se pagou, chama `attempt_dispatch`.
3. `src/pages/Form.tsx`: `form_token` em `localStorage`, `case_id` da URL, máscaras/validação (CPF, CEP com autofill ViaCEP, placa Mercosul) → POST para `form-submit`.
4. `form-submit`: CORS por whitelist, 64 KB máx., rate limit 30/min por IP, `dup_guard` SHA-256, upsert em `form_submissions`, `attempt_dispatch`, POST assinado para `DISPATCH_PIPELINE_URL`.
5. `pipeline/main.py` `/hooks/dispatch`: valida HMAC e responde **202 imediato**, empurrando o trabalho para `BackgroundTasks`. O worker busca o caso via Express (`GET /internal/cases/:id`), chama DeepSeek, gera PDF, sobe para bucket privado, registra em `generated_documents` (`register_pdf`), envia e-mail, atualiza `email_result`.
6. `POST /internal/dispatch/finish` no Express roda `confirm_dispatch` e grava `document_status = completed|failed`.

**Contrato do 202:** a Edge só marca `document_status = generating`. Quem fecha o ciclo é o Express. Se o pipeline responder algo diferente de 202, a Edge volta a chamar `confirm_dispatch` ela mesma (caminho legado/erro de rede). Mexer nesse status code quebra a divisão de responsabilidades.

### Cadeia de confiança HMAC

Um único segredo compartilhado, com nomes diferentes por serviço: `DISPATCH_PIPELINE_HMAC_SECRET` (Edge) = `PIPELINE_HMAC_SECRET` (Express e pipeline). Retrocompatível com `N8N_HMAC_SECRET`/`N8N_WEBHOOK_URL` de uma versão anterior baseada em n8n.

Mensagens assinadas: o corpo JSON **compacto** (`separators=(",",":")`) nos POSTs, e a string literal `GET:${caseId}` no read model. Qualquer mudança de serialização dos dois lados invalida as assinaturas.

### Modelo de dados

`stripe_sessions` → `form_submissions` (1 por `case_id`) → `dispatches` (1 por caso; `dispatch_key` UNIQUE = chave de idempotência) → `generated_documents` (auditoria: bucket/path/sha256/status de e-mail; o binário fica no Storage).

Invariantes: `attempt_dispatch` só cria dispatch se `payment_status = 'paid'` **e** `document_status = 'pending'` — caso contrário retorna conjunto vazio (não é erro). RLS habilitada em todas as tabelas com política permissiva para service role. O `id` de uma linha existente em `stripe_sessions` nunca é reescrito pelo webhook, para preservar a FK `dispatches.stripe_session_id`.

Requer setup manual no Dashboard: bucket **privado** (`generated-recursos`) + políticas de Storage para a service role.

## Design system

Direção **"Notificação e Resposta"**: a página é feita da linguagem visual do documento que ela combate — campos rotulados, códigos monoespaçados, filetes, carimbo. Semântica de cor: **vermelho = a multa e o prazo, verde = o recurso e o protocolado**. A paleta de `COLOR_PALETTE.md` (extraída do favicon) é preservada integralmente; nenhum matiz novo entra.

Fonte de verdade dos tokens: `src/index.css`. Três famílias, auto-hospedadas via `@fontsource` e importadas em `src/main.tsx` — **Archivo** (`font-display`/`font-sans`, grotesca institucional), **IBM Plex Mono** (`font-mono` — placa, artigo do CTB, nº do auto, `case_id`, cronômetro) e **Source Serif 4** (`font-serif`, reservada ao interior do documento gerado e citações do CTB; não usar em chrome de página).

Botões são `.btn` + variante: `--solid` (fundo claro), `--inverse` (sobre verde), `--ghost`, `--disabled`. Nunca empilhar utilitários de cor sobre `.btn--*` — foi exatamente essa colisão que a refatoração eliminou. O átomo de layout é `.field` (rótulo mono em caixa alta + valor), copiado da notificação de autuação.

Todas as páginas internas (`/form`, `/cancel`, `/terms`, `/privacy`, 404) são envolvidas pelo `<PageShell />` — masthead + rodapé —, e o formulário está agrupado em quatro `fieldset` que espelham a ordem da notificação: identificação, veículo, autuação, sua versão. O estado de erro dos campos sai de `aria-invalid`, não de `className` condicional; o CTA do formulário é `sticky` (solta quando o formulário acaba), enquanto o da home é `fixed` com listener de scroll.

A home é montada por cinco blocos, cada um com seu prefixo de classe em `src/index.css`: `.hero` (assinatura), `.track` (as cinco etapas costuradas por um filete contínuo — sem `gap` entre as colunas, o espaço vem do padding, senão o filete se parte na calha do grid), `.doc` (a primeira página da peça, cortada por `mask-image`), `.closer` (a faixa verde de fechamento, único gradiente do site; `.on-green` troca os cinzas pelo papel) e `.footer`. O FAQ usa o **Accordion do shadcn**, não estado à mão.

A assinatura da home é o `<NotificacaoHero />`: a réplica do auto em papel creme, a folha do recurso pousando por cima em serifa e o carimbo `.stamp` (tinta verde — o protocolado é verde, a multa é vermelha). A sequência de entrada roda **uma vez, no load**, encadeada pelos delays de `notice-settle` → `sheet-slide` → `stamp-drop` em `tailwind.config.ts`; as três usam `fill-mode: both`, e a guarda de `prefers-reduced-motion` em `src/index.css` (duração 0.01ms + `animation-delay: -1ms`) entrega o estado final sem movimento e sem espera. Toda a ousadia da página é gasta aqui: o resto são filetes, campos e tipografia.

Todo par de cor em uso passa WCAG AA (verificado numericamente). Ao introduzir combinações novas, conferir antes de commitar — duas falhas reais já existiram aqui (`primary-light` sobre o hero verde a 2,05:1 e `muted-foreground` sobre papel a 3,15:1).

## Armadilhas conhecidas

- **Duas assinaturas de `attempt_dispatch` convivem** — `case_id` (`20260109134917_remote_schema`) e `p_case_id` (`20260206120000`). Os callers em `form-submit` e `stripe-webhook` tentam as duas, em ordem oposta. É dívida técnica consciente; consolidar exige saber qual versão está viva no projeto remoto.
- **A migration `20250101000005` está quebrada em runtime**: referencia `v_submission.payment_status`, coluna inexistente em `form_submissions`. Só não explode porque migrations posteriores substituem a função.
- **Autenticação bearer está desligada**: o bloco de validação de token está comentado em `create-checkout-session` e `form-submit`. Toda a infra existe (`src/lib/auth.ts`, `src/hooks/use-auth.tsx`, `BEARER_TOKEN_IMPLEMENTATION.md`) e `verify_jwt = false` em `supabase/config.toml`. Hoje `form-submit` é protegida só por whitelist de origem + existência do `case_id`.
- **Rate limit é in-memory** (`Map` no isolate) — não vale entre instâncias de Edge Function.
- **`BackgroundTasks` do FastAPI não é fila durável**: se o processo morrer entre o 202 e o `finish`, o caso fica preso em `generating`, sem retry automático.
- `ORIGIN_WHITELIST` vazio bloqueia **tudo** em `form-submit` (`originAllowed` retorna false quando a lista é vazia).
- **O preço é escolhido pelo navegador, não pelo servidor**: o prazo de 30 minutos vive em `sessionStorage` (`promo_expires_at`, hook `use-promo`). Expirado, a home manda `{"pricing":"full"}` para `create-checkout-session`, que troca `STRIPE_PRICE_ID` (R$ 19,99) por `STRIPE_PRICE_ID_FULL` (R$ 39,99). Isso **não é verificável no servidor** — quem limpar a sessão volta ao preço promocional. É decisão consciente do Klaus; a alternativa seria um prazo global de campanha numa env var, que a Edge poderia conferir contra o próprio relógio. Só o literal `"full"` promove o preço, e só se a variável existir: qualquer outro valor cai no promocional. A faixa usada fica em `metadata.pricing_tier` da sessão Stripe.
- **Tema escuro implementado** (Ago/2026): `next-themes` montado em `App.tsx` com `attribute="class"`, alternância no masthead (`AlternarTema.tsx`) e um script inline no `index.html` que decide a classe antes da primeira pintura. O bloco `.dark` foi reescrito a partir da paleta — o papel creme do talão vira via carbonada e o creme reaparece como tinta. Quatro tokens novos (`--band`, `--band-deep`, `--band-ink`, `--band-paper`) separam a faixa verde de `--primary`, porque no escuro a faixa continua verde enquanto o botão clareia; `--shadow` faz o mesmo pelas sombras. Todos os pares foram medidos nos dois temas: nenhuma reprovação AA.
- `.gitattributes` normaliza line endings; diffs no Windows vêm cheios de avisos CRLF — ruído esperado, não é mudança real.
- Entulho na raiz que não deve ser tratado como fonte de verdade: `TEMP_Form*.txt`, `edge-functions.log`, `src/.git/` (repositório git aninhado), e ~10 markdowns de diagnóstico com conteúdo sobreposto. Em `public/` sobrou só o que é referenciado (mais `logo-stripe.png`, que é para o painel do Stripe); 2,9 MB de imagens mortas saíram em Ago/2026.

## Variáveis de ambiente

**Três arquivos, todos na raiz — um por perfil, não um por serviço.** Os quatro runtimes leem os mesmos arquivos; não existe mais `server/.env`, `pipeline/.env` nem `supabase/.env.local`.

| Arquivo | Perfil | Aponta para |
|---|---|---|
| `.env` | testes com a Supabase na **web** | projeto da nuvem |
| `.env.local` | testes com a Supabase em **Docker** | `127.0.0.1:54321` |
| `.env.production` | **lançamento oficial** | produção (12 valores ainda como `SUBSTITUA_`) |

Nenhum dos três vai para o git; os pares versionados são `.env.example`, `.env.local.example` e `.env.production.example`.

**A precedência é uma só, igual nos quatro runtimes:** carrega-se `.env` e depois `.env.local`, e **quem vem depois ganha**. Ou seja, *enquanto `.env.local` existir, o perfil ativo é o local* — para testar contra a web, renomeie o arquivo (`.env.local.off`), não adianta editar o `.env`. Vite já faz isso nativamente; `server/src/index.ts` e `pipeline/config.py` ancoram na raiz pelo caminho do próprio arquivo (não por `cwd`, já que ambos são iniciados de dentro do seu diretório) e replicam a mesma ordem. Foi a divergência dessa regra entre Express e pipeline que derrubou o dispatch inteiro em 401, em silêncio — ver `PROGRESSO.md`, sessão de 31/08/2026.

Chaves por consumidor: **Vite** lê só `VITE_*` (o resto não entra no bundle); **Edge** lê `STRIPE_*`, `ORIGIN_WHITELIST`, `DISPATCH_PIPELINE_*`, `FRONTEND_URL`; **Express** lê `SUPABASE_*`, `PIPELINE_HMAC_SECRET`, `PORT`; **pipeline** lê `PIPELINE_*`, `EXPRESS_INTERNAL_URL`, `SUPABASE_*`, `STORAGE_BUCKET`, `DEEPSEEK_*`, `SMTP_*`, `MAIL_*`.

`DISPATCH_PIPELINE_HMAC_SECRET` (Edge) e `PIPELINE_HMAC_SECRET` (Express e pipeline) são **o mesmo segredo com dois nomes** — num arquivo só, a invariante fica visível. No perfil local, `DISPATCH_PIPELINE_URL` precisa ser `http://host.docker.internal:8000/hooks/dispatch`: a Edge roda dentro de container e `127.0.0.1` ali é o próprio container. E atenção: `supabase functions serve --env-file` **ignora silenciosamente toda variável `SUPABASE_*`** ("Env name cannot start with SUPABASE_"); no local não morde, porque o runtime injeta as próprias.

`PIPELINE_ENV=production` torna SMTP obrigatório; em development o e-mail é pulado (`email_skipped`) e o pipeline segue.
