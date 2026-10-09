# Entrega única ao pipeline — Design

*Escrito em 09/10/2026. Decidido em conversa com o Klaus na mesma data. Resolve duas pendências do
`PENDENCIAS.md` nascidas no teste do fluxo na nuvem de 02/10/2026: o formulário enviado antes da
confirmação do pagamento fica preso, e o servidor confia no `stripe_session_id` mandado pelo navegador.*

## 1. O problema

Um caso chega ao pipeline por dois caminhos possíveis, conforme a ordem em que o formulário e a
confirmação do pagamento (o webhook do Stripe) chegam:

- **pagamento confirmado antes do formulário** — a `form-submit` grava o formulário, chama
  `attempt_dispatch`, recebe a `dispatch_key` e faz o POST assinado ao pipeline. Funciona;
- **formulário antes da confirmação** — a `form-submit` grava o formulário, `attempt_dispatch` devolve
  vazio (ainda não pago) e ela para. Quando o webhook confirma o pagamento, a `stripe-webhook` chama
  `attempt_dispatch`, que **cria** o dispatch e devolve a chave — e ninguém faz o POST. O caso fica em
  `pending` para sempre, o cliente pagou e não recebe nada, e não há alerta. Visto no `CASO_fb6f9eca…`
  em 02/10/2026 (dispatch `ccdb8770…` parado em `pending`).

Acontece com webhook atrasado, webhook reenviado depois de uma falha, ou cliente rápido. O checkout
hoje só aceita cartão (`payment_method_types: ["card"]`), então pagamento assíncrono (Pix, boleto)
não entra agora.

O segundo defeito mora no mesmo lugar. A `form-submit` grava em `form_submissions.stripe_session_id` o
valor que o navegador guardou no `localStorage`, sem conferir se a sessão é do caso, e o
`attempt_dispatch` confere o pagamento por esse valor **antes** de olhar o `case_id`. O
`CASO_6b03e11a…` saiu com a sessão do `CASO_fb6f9eca…` (os dois pagos, sem dano). O risco: um caso com
o próprio pagamento pendente despachado por outra sessão paga, e a auditoria apontando para o
pagamento errado. E o valor nem é necessário: a `create-checkout-session` grava `stripe_sessions` com o
`case_id` (único) no momento do checkout, então o servidor sempre sabe qual é a sessão do caso.

A leitura do código achou mais três coisas:

- **Não há trava contra duas entregas simultâneas.** Se a `form-submit` e a `stripe-webhook`
  tentarem entregar ao mesmo tempo, as duas chegam ao pipeline. O caminho de recuperação da
  `form-submit` reenvia qualquer dispatch em `pending` — e o dispatch fica em `pending` até o Express
  confirmar. O worker só pula casos já `sent` ou `completed`; duas gerações rodariam em paralelo.
- **Uma entrega que falha não tem nova tentativa.** A `form-submit` responde `ok: true` ao navegador
  mesmo quando o POST ao pipeline falhou, e os dois caminhos de duplicata (`dup_guard` e
  `stripe_session_id` iguais) saem **antes** da entrega — o cliente que clica de novo não dispara nada.
- **O formulário exige o `stripe_session_id` no `localStorage`** (`Form.tsx`). Quem abre o link de
  sucesso em outro aparelho não consegue enviar.

## 2. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde mora a regra de quem entrega | **Numa função do banco** (`reservar_entrega`), atômica, e num módulo de entrega comum às duas Edge Functions | Decisão do Klaus (abordagem A). A regra fica num lugar só, sem corrida possível, e testável por pgTAP. A alternativa de manter `attempt_dispatch` e pôr a trava no TypeScript dividiria a regra em duas etapas cuja ordem é justamente onde a corrida mora. |
| Entrega que falha | **O caso volta a `pending`**; a `stripe-webhook` responde 500 e o Stripe reenvia o evento; a `form-submit` responde 503 e o cliente tenta de novo | Decisão do Klaus. Nova tentativa automática sem fila nova: o Stripe reenvia por até 3 dias, com intervalos crescentes. |
| Sessão de pagamento | **A do próprio caso**, lida em `stripe_sessions` pelo `case_id`. O valor do navegador é ignorado | O servidor já tem o dado; o navegador não tem como provar nada. |
| `attempt_dispatch` | **Removida** | Substituída por `reservar_entrega`. Ninguém mais a chama. |
| `confirm_dispatch` | **Não muda** | O Express a usa para fechar o ciclo, e o caminho legado do 200 também. |
| Contrato do 202 | **Não muda** | A Edge só marca `generating`; quem fecha o ciclo é o Express. |

## 3. O banco

Uma migration nova, `supabase/migrations/20261009000000_entrega_unica.sql`. A baseline continua
congelada.

### 3.1 `reservar_entrega(p_case_id text)`

```
RETURNS TABLE(dispatch_key uuid, email text, stripe_session_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
```

Numa transação só:

1. Lê `id` e `payment_status` de `stripe_sessions` **pelo `case_id`**. Sem linha, ou
   `payment_status <> 'paid'` → devolve vazio.
2. A trava:

   ```sql
   UPDATE form_submissions
      SET document_status = 'generating',
          stripe_session_id = <id da sessão do caso>,
          updated_at = now()
    WHERE case_id = p_case_id
      AND document_status = 'pending'
   RETURNING email
   ```

   Sem linha atualizada → devolve vazio. Isso cobre: formulário ainda não enviado; caso já em
   `generating` (outra entrega em curso); caso `completed` ou `failed`. Com dois disparos simultâneos,
   o segundo espera o bloqueio da linha, reavalia o `WHERE` depois que o primeiro confirma, não acha
   mais `pending` e recebe vazio — garantia do próprio Postgres (READ COMMITTED reavalia a linha
   atualizada).
3. Cria o dispatch ou reaproveita o que existe:

   ```sql
   INSERT INTO dispatches (case_id, dispatch_key, stripe_session_id, status, created_at)
   VALUES (p_case_id, gen_random_uuid(), <id da sessão>, 'pending', now())
   ON CONFLICT (case_id) DO UPDATE
      SET status = 'pending',
          stripe_session_id = EXCLUDED.stripe_session_id,
          updated_at = now()
   RETURNING dispatch_key
   ```

   Numa nova tentativa a `dispatch_key` **é a mesma**: ela é a chave de idempotência do e-mail
   (`Resend-Idempotency-Key`) e do registro do PDF (`generated_documents.dispatch_key` é único).
4. Devolve `(dispatch_key, email, stripe_session_id)`.

### 3.2 `devolver_entrega(p_dispatch_key uuid)`

```
RETURNS TABLE(devolvido boolean)
```

- `UPDATE form_submissions SET document_status = 'pending', updated_at = now()` no caso do dispatch,
  **só se** o status atual for `generating`;
- `UPDATE dispatches SET status = 'failed', updated_at = now()` — fica o rastro da tentativa; a
  próxima reserva o devolve a `pending`;
- devolve se o UPDATE do formulário pegou alguma linha.

Chamada só quando o POST ao pipeline falhou (§4). É uma **exceção explícita** à invariante do
`CLAUDE.md` de que nada reescreve `pending` sobre `generating`: aquela regra existe porque reabrir um
caso que o pipeline está processando manda um segundo e-mail, e aqui o pipeline não recebeu o
trabalho. Só esta função faz isso.

### 3.3 O resto da migration

- `DROP FUNCTION public.attempt_dispatch(text);`
- `COMMENT ON FUNCTION` para as duas novas, no tom dos comentários da baseline;
- o comentário de `form_submissions.stripe_session_id` passa a dizer que o valor é o da sessão do caso,
  gravado pelo servidor (hoje diz "enviado pelo navegador a partir do localStorage");
- **permissões fechadas**, no padrão do `verificar_medidor`: `REVOKE ALL … FROM PUBLIC, anon,
  authenticated` e `GRANT EXECUTE … TO service_role` nas duas. Não é cosmético: uma função `SECURITY
  DEFINER` sem `REVOKE` pode ser chamada pela PostgREST com a chave anônima, que vai no bundle do site,
  e `devolver_entrega` chamada por qualquer um reabriria um caso em `generating` — o segundo e-mail ao
  cliente. (`attempt_dispatch` nunca teve esse `REVOKE`; sai junto com ela.)

### 3.4 Risco aceito

Se o POST estourar o tempo **depois** de o pipeline ter aceitado o trabalho (o 202 se perdeu na
volta), o caso volta a `pending` e uma nova tentativa pode rodar uma segunda geração. O e-mail não
duplica — a Resend descarta o segundo envio com a mesma chave em até 24 h —, e o segundo registro do
PDF bate na unicidade de `dispatch_key`. É raro, porque o pipeline responde 202 antes de qualquer
trabalho (`main.py` só valida a assinatura e agenda), e é muito menos grave que o caso preso de hoje.

## 4. O módulo de entrega

`supabase/functions/_shared/entrega.ts`:

```ts
type Origem = "formulario" | "webhook";
type ResultadoEntrega = "entregue" | "nada_a_fazer" | "falhou";

export async function entregar(
  deps: { supabase: SupabaseClient; fetch: typeof fetch; env: (k: string) => string | undefined },
  caseId: string,
  origem: Origem,
): Promise<ResultadoEntrega>
```

As dependências entram como parâmetro (como em `form-submit/verificacao.ts`) para o módulo ser
testado sem rede.

1. **Reserva:** `rpc("reservar_entrega", { p_case_id })`. Vazio → `nada_a_fazer` (log de informação,
   não de erro: ainda não pago, ainda sem formulário, ou já em curso/encerrado). Erro da RPC → log de
   erro e `falhou` — sem chave não há o que devolver, e o caso continua `pending`.
2. **POST:** URL em `DISPATCH_PIPELINE_URL` (com o fallback `N8N_WEBHOOK_URL`), segredo em
   `DISPATCH_PIPELINE_HMAC_SECRET` (fallback `N8N_HMAC_SECRET`). Corpo `{case_id, email, dispatch_key}`
   por `JSON.stringify` (já compacto), `X-Signature` = HMAC-SHA256 hex do corpo, `Idempotency-Key` =
   `dispatch_key`. **Tempo-limite de 10 s** (`AbortSignal.timeout`); hoje não há nenhum.
3. **Resposta:**
   - **202** → `entregue`. Quem fecha o ciclo é o Express.
   - **outro 2xx** (caminho legado) → `confirm_dispatch(dispatch_key, true)`, como hoje → `entregue`.
   - **não-2xx, erro de rede, tempo esgotado** → `devolver_entrega(dispatch_key)` → `falhou`.
   - **URL ausente** → `devolver_entrega` → `falhou`, com log de configuração.
4. Todo log leva `case_id`, `dispatch_key` (quando há) e `origem`.

A marcação `generating` sai da Edge: quem a faz é a reserva, antes do POST.

## 5. Quem chama

### 5.1 `stripe-webhook`

- Quando a sessão do evento está `paid`, chama `entregar(…, "webhook")` no lugar de `triggerDispatch`.
- **A condição muda:** hoje é `paymentConfirmed` = "o status acabou de ser promovido a `paid`". Num
  evento reenviado o status já é `paid`, a promoção não acontece e nada seria tentado. Passa a ser "a
  sessão está `paid`" (promovida agora ou já estava). A reserva cuida do resto: caso em `generating`
  ou encerrado devolve `nada_a_fazer`.
- `falhou` → responde **500**, e o Stripe reenvia o evento. O tratamento já é idempotente: o status de
  pagamento nunca é rebaixado (`shouldPromoteStatus`), o `id` da linha nunca é reescrito, e a reserva
  só entrega a partir de `pending`.
- O PATCH de `form_submissions.stripe_session_id` que a função já faz continua: o valor vem da
  própria linha de `stripe_sessions`, não do navegador.

### 5.2 `form-submit`

- Depois de gravar o formulário, chama `entregar(…, "formulario")` no lugar de todo o bloco atual:
  `attempt_dispatch`, o caminho de recuperação de dispatch pendente e o diagnóstico de pré-condições
  (`dispatch_aguardando_pagamento`, `dispatch_ignorado`).
- **A duplicata por `dup_guard` também chama `entregar`** antes de responder, para que o cliente que
  clica de novo depois de uma falha dispare uma nova tentativa. Num caso em `generating` a reserva
  devolve `nada_a_fazer` e nada muda.
- **A duplicata por `stripe_session_id` sai** — dependia do valor do navegador.
- O `stripe_session_id` do corpo é **ignorado**. Na inserção, o valor gravado é o `id` de
  `stripe_sessions` do caso (a função já consulta essa tabela quando o caso é novo); a reserva o
  reescreve de qualquer forma.
- `falhou` → **503**, com os dados já gravados. `entregue` e `nada_a_fazer` → 200 como hoje.
- O pior caso de tempo da função fica abaixo dos 20 s do `TIMEOUT_ENVIO_MS` do formulário:
  verificação do medidor (3 s) + POST (10 s) + as idas ao banco.

### 5.3 `src/pages/Form.tsx`

- Deixa de ler `stripe_session_id` do `localStorage`, de exigi-lo (a mensagem "Não localizamos o seu
  pagamento neste navegador" e o `pedidoIncompleto` passam a olhar só o `case_id`) e de enviá-lo.
- `mensagemDeFalha(503)`: "Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora.
  Tente de novo em um minuto." — o botão de tentar de novo e os dados na tela já existem.

### 5.4 Tipos do Supabase (`src/integrations/supabase/types.ts`)

Sai `attempt_dispatch` de `Functions`; entram `reservar_entrega` e `devolver_entrega`, com os tipos de
argumento e de retorno do §3.

### 5.5 Express (`server/src/index.ts`)

A leitura do caso (`GET /internal/cases/:id`) busca a sessão em `stripe_sessions` pelo `case_id`, não
pelo `form_submissions.stripe_session_id`.

## 6. Testes

**Banco (pgTAP)** — `supabase/tests/entrega_test.sql`, rodado por `psql` como o do radar, isolado em
transação revertida:

1. sessão não paga → `reservar_entrega` vazio, formulário continua `pending`;
2. pago, sem formulário → vazio;
3. pago e `pending` → devolve a chave, formulário em `generating`, dispatch `pending`;
4. segunda reserva → vazio;
5. `devolver_entrega` → formulário `pending`, dispatch `failed`; nova reserva → **a mesma**
   `dispatch_key`;
6. formulário gravado com o `stripe_session_id` de **outra** sessão paga, e a sessão do caso não paga
   → vazio; com a sessão do caso paga → reserva e o `stripe_session_id` do formulário passa a ser o
   do caso;
7. caso `completed` ou `failed` → vazio;
8. `devolver_entrega` com o formulário fora de `generating` → `false`, nada muda;
9. `anon` e `authenticated` sem `EXECUTE` em `reservar_entrega` e `devolver_entrega` (`has_function_privilege`).

**Concorrência** — script com dois `psql` simultâneos sobre o mesmo caso, a primeira transação segura
por `pg_sleep`: só uma recebe a chave. O pgTAP roda numa sessão só e não prova isso.

**Módulo de entrega** — `supabase/functions/_shared/entrega.test.ts`, no `npm run radar:test` (o
script passa a incluir `supabase/functions/_shared/*.test.ts`), com `supabase` e `fetch` falsos:
reserva vazia; 202; 200 legado (chama `confirm_dispatch`); 500 (chama `devolver_entrega`); erro de
rede; tempo esgotado; URL ausente; erro da RPC de reserva; assinatura igual ao HMAC do corpo enviado.

**Ponta a ponta, depois do deploy** (sandbox do Stripe, sem pagamento real; comandos de deploy são do
Klaus):

1. **O caso preso de 02/10:** desativar o endpoint do webhook no painel da sandbox; pagar e enviar o
   formulário (o caso fica `pending`, log `nada_a_fazer origem=formulario`); reativar o endpoint e
   reenviar o evento pelo painel → PDF e e-mail, log `entregue origem=webhook`.
2. **Falha e nova tentativa:** com o uvicorn parado, enviar o formulário de um caso pago → a tela
   mostra a mensagem do 503 e o caso volta a `pending`; subir o uvicorn e clicar de novo → um PDF e
   um e-mail.
3. **Outro aparelho:** abrir `/form?success=true&case_id=…` numa aba anônima, sem nada no
   `localStorage` → o formulário envia.

## 7. Deploy

1. `npx supabase db push` — cria as funções novas e remove `attempt_dispatch`;
2. `npx supabase functions deploy form-submit` e `npx supabase functions deploy stripe-webhook`;
3. reiniciar o Express e o Vite locais.

Entre 1 e 2, as funções antigas chamariam uma RPC que não existe mais. O site não está no ar, então a
janela não afeta cliente; a ordem fica registrada para quando estiver.

## 8. Documentação

- `CLAUDE.md`:
  - passos 2 e 4 do fluxo;
  - invariante do `attempt_dispatch` → `reservar_entrega`, com a trava e a exceção de
    `devolver_entrega`;
  - a armadilha "UMA assinatura cada";
  - o comentário de `form_submissions.stripe_session_id`;
  - a resposta 503 da `form-submit` e o 500 da `stripe-webhook` para novas tentativas.
- `PROGRESSO.md`: a sessão.
- `PENDENCIAS.md`: tirar as duas pendências.

## 9. Fora do escopo

Continuam no `PENDENCIAS.md`:

- fila durável no pipeline (#6): processo morto depois do 202 ainda deixa o caso em `generating`;
- reprocessar casos `failed` (falha durante a geração, não na entrega);
- o caminho legado do 200, que deixa o caso em `generating`;
- Pix e boleto.

## 10. Critério de pronto

- suítes verdes: pgTAP da entrega e do radar, script de concorrência, `npm run radar:test`, testes do
  pipeline;
- os três testes ponta a ponta do §6 passando;
- nenhuma referência a `attempt_dispatch` no código (fica só nas migrations antigas, nos documentos de histórico e nos rascunhos de `supabase/snippets/`);
- um teste pgTAP confere que `anon` e `authenticated` não têm `EXECUTE` nas duas funções;
- `CLAUDE.md`, `PROGRESSO.md` e `PENDENCIAS.md` atualizados.
