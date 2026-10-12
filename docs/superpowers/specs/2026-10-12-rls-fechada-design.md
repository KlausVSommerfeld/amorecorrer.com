# RLS fechada para a chave anônima — Design

*Escrito em 12/10/2026. Decidido em conversa com o Klaus entre 11 e 12/10/2026. Resolve a pendência do
`PENDENCIAS.md` aberta na sessão de 09/10/2026: a chave anônima, que vai no código do site, lê e escreve
as tabelas do fluxo.*

## 1. O problema

Levantamento em produção (somente leitura), em 11/10/2026:

| Objeto | Hoje | Efeito |
|---|---|---|
| `stripe_sessions`, `form_submissions`, `dispatches`, `generated_documents` | política `FOR ALL TO public USING (true) WITH CHECK (true)` e todos os privilégios para `anon` e `authenticated` | a chave anônima lê CPF, endereço e placa, grava, apaga e reabre casos (o caminho de um segundo e-mail ao cliente) |
| `confirm_dispatch(dispatch_key, success)` | `SECURITY DEFINER`, `EXECUTE` para `PUBLIC`, `anon` e `authenticated` | quem tem uma `dispatch_key` — e hoje ela se lê na própria tabela — marca o caso `completed` ou `failed` |
| `radar_snapshots`, `radar_instruments`, `radar_faixas`, `radar_verificacoes` | política de `SELECT` para `anon` e `authenticated` ("legíveis publicamente"), gravação barrada pela RLS, mas todos os privilégios concedidos | a chave anônima copia a base do radar inteira |
| `radar_consultas_log` | todos os privilégios para `anon`, política só para `service_role` | fechada pela RLS; o privilégio sobra |
| buckets `generated-recursos` e `evidencias` | privados, políticas só para `service_role` | fechados |

A baseline diz no comentário "Nenhuma policy para `anon`", mas escreveu as quatro políticas do fluxo sem
`TO` — e política sem `TO` vale para `public`, que inclui `anon`. Os privilégios vêm do padrão da
Supabase: o `pg_default_acl` do schema `public` dá `arwdDxtm` (todos) a `anon` e `authenticated` em toda
tabela que o `postgres` cria, e `EXECUTE` em toda função. Hoje a única trava é a RLS, e ela estava
escrita errado.

**Ninguém usa esse acesso.** O site só usa a chave anônima para `supabase.auth` (em `src/lib/auth.ts`,
que nem é importado) e chama as Edge Functions por `fetch`. As três Edge Functions, o Express e o
pipeline usam a `service_role`, que tem `rolbypassrls = true`. Fechar a chave anônima não muda nada
para nenhum serviço.

## 2. Decisões travadas

- **Duas travas** (a abordagem A da conversa): políticas só para `service_role` **e** privilégios
  revogados de `anon` e `authenticated`. Uma trava só deixaria o próximo erro abrir o banco: só RLS
  mantém o `TRUNCATE` (que não passa pela RLS) e toda tabela nova nascendo aberta; só privilégios
  mantém as políticas dizendo `TO public`, e um `GRANT` futuro reabriria o fluxo.
- **O radar também fecha.** Nada no site lê as tabelas, e os dados indexados são trabalho nosso. A
  consulta antes do pagamento (projeto 2 do questionário) passaria por uma Edge Function que chama
  `verificar_medidor` com a `service_role`, com lista de origens e limite por IP, e devolve só o
  resumo — não precisa das tabelas abertas. A forma dela é decisão da spec do projeto 2.
- **O privilégio padrão muda**: tabela, sequência e função novas criadas pelo `postgres` no `public`
  nascem sem acesso para `anon` e `authenticated`.
- **Uma migration nova, nenhum código fora do banco.** Publicada pelo Klaus (`npx supabase db push`).

## 3. A migration

`supabase/migrations/20261012000000_rls_fechada.sql`. Todas as nove tabelas e as sete funções do
`public` pertencem a `postgres`; não há sequências nem views.

### 3.1 Políticas

```sql
-- Fluxo: a mesma política, agora com o papel escrito.
DROP POLICY IF EXISTS "Service role can manage stripe sessions"       ON public.stripe_sessions;
DROP POLICY IF EXISTS "Service role can manage form submissions"      ON public.form_submissions;
DROP POLICY IF EXISTS "Service role can manage dispatches"            ON public.dispatches;
DROP POLICY IF EXISTS "Service role can manage generated_documents"   ON public.generated_documents;

CREATE POLICY "Service role gerencia stripe_sessions"     ON public.stripe_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role gerencia form_submissions"    ON public.form_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role gerencia dispatches"          ON public.dispatches
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role gerencia generated_documents" ON public.generated_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Radar: sai a leitura pública; as políticas da service_role ficam.
DROP POLICY IF EXISTS "Radar snapshots são legíveis publicamente"   ON public.radar_snapshots;
DROP POLICY IF EXISTS "Radar instruments são legíveis publicamente" ON public.radar_instruments;
DROP POLICY IF EXISTS "Radar faixas são legíveis publicamente"      ON public.radar_faixas;
DROP POLICY IF EXISTS "Radar verificações são legíveis publicamente" ON public.radar_verificacoes;
```

A `service_role` ignora a RLS de qualquer jeito; a política fica por simetria com o radar e como
documentação de quem acessa. Para os `CREATE POLICY` não falharem numa segunda aplicação, a migration
também faz `DROP POLICY IF EXISTS` dos quatro nomes novos antes de criá-los.

### 3.2 Privilégios nas tabelas

```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
```

Pega as nove tabelas. `service_role` e `postgres` continuam com tudo.

### 3.3 Funções

```sql
REVOKE ALL ON FUNCTION public.confirm_dispatch(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_dispatch(text, boolean) TO service_role;
```

O mesmo padrão de `reservar_entrega`, `devolver_entrega` e `verificar_medidor`. As outras três funções
ficam como estão: `update_updated_at_column` (a função do gatilho de `updated_at`),
`radar_unaccent_imutavel` e `radar_classificar_resultado` (texto puro). Nenhuma é `SECURITY DEFINER`:
pela chave anônima, só transformam o texto que recebem. E revogá-las teria risco sem ganho — a
`radar_unaccent_imutavel` calcula a coluna gerada `radar_instruments.local_via_norm`, e quem grava ali precisa de `EXECUTE`
sobre ela.

### 3.4 Privilégio padrão para objetos novos

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
```

Dois limites, ditos no comentário da migration:

- o `EXECUTE` de toda função nova para `PUBLIC` é padrão **global** do Postgres e não sai por schema
  (o padrão por schema só soma ao global). A guarda é o teste do §4.1 (d): nenhuma função
  `SECURITY DEFINER` do `public` executável por `anon` ou `authenticated`;
- os padrões do papel `supabase_admin` (com que a própria Supabase cria objetos) não mudam — a
  migration roda como `postgres`, que não pode alterá-los. Nenhum objeto nosso nasce por esse papel.

### 3.5 Comentários

`COMMENT ON TABLE` nas quatro tabelas do fluxo: só a `service_role` acessa; o navegador nunca lê nem
grava. No topo da migration, o motivo: a baseline escreveu as políticas sem `TO`, e o padrão da
Supabase dava todos os privilégios à chave anônima.

A migration não muda dado nenhum e é reaplicável. Voltar atrás seria outra migration com os `GRANT` e
as políticas antigas.

## 4. Testes

### 4.1 pgTAP — `supabase/tests/rls_test.sql`

Rodado pelo `psql`, como os outros dois, numa transação revertida (`BEGIN … ROLLBACK`).

**Como testar outro papel.** As tentativas de `anon` não rodam com o pgTAP dentro do `SET ROLE`: as
tabelas temporárias em que o pgTAP guarda os resultados são do `postgres`, e o `anon` não as alcança.
Um auxiliar temporário faz a tentativa e devolve só o código do erro, e o pgTAP compara como
`postgres`:

```sql
CREATE FUNCTION pg_temp.tentar_como(papel text, comando text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', papel);
  EXECUTE comando;
  RESET ROLE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;  -- o rollback do bloco desfaz o SET LOCAL ROLE
END $$;
```

Grupos:

- **(a) A chave anônima é barrada**, cada caso esperando `'42501'` (permissão negada), para `anon` e
  para `authenticated`: `SELECT` nas quatro tabelas do fluxo e em `radar_faixas`; `INSERT` em
  `form_submissions`; `UPDATE` em `dispatches`; `SELECT public.confirm_dispatch('x', true)`.
- **(b) O fluxo continua**: como `service_role`, `SELECT` em cada uma das nove tabelas e
  `confirm_dispatch('chave-inexistente', true)` devolvem `'ok'`.
- **(c) As políticas são as escritas**: `policies_are` em cada uma das nove tabelas (só a política da
  `service_role`) e `policy_roles_are` em cada política (`{service_role}`).
- **(d) Varreduras** — não citam tabela por nome, então pegam o que ainda não existe:
  1. nenhuma tabela do `public` concede privilégio algum a `anon` ou `authenticated`
     (`has_table_privilege` com `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`);
  2. nenhuma política do `public` tem `public` (oid 0), `anon` ou `authenticated` em `polroles`;
  3. toda tabela do `public` tem `relrowsecurity`;
  4. nenhuma função `SECURITY DEFINER` do `public` é executável por `anon` ou `authenticated`
     (`has_function_privilege`).
- **(e) O privilégio padrão mudou**: dentro da transação, criar como `postgres` uma tabela e uma função
  de teste no `public`; a tabela não concede privilégio algum a `anon` nem a `authenticated`; o
  `proacl` da função não lista `anon` nem `authenticated` (pelo `PUBLIC` ela segue executável — por
  isso a varredura d.4).

### 4.2 O que já existe continua passando

Com a migration aplicada no banco local (pelo `psql`, como as anteriores): os 29 testes da entrega, os
26 do radar, a prova de concorrência (`entrega_concorrencia.sh`), a asserção do Storage
(`tests/sql/assert_storage_setup.sql`) e o `npm run radar:test` (111).

### 4.3 Depois da publicação

- **Catálogo, por MCP:** as quatro varreduras do §4.1 (d) e a lista de políticas, em produção.
- **API REST com a chave anônima do `.env`:** `GET /rest/v1/form_submissions?select=case_id&limit=1`
  e `GET /rest/v1/radar_faixas?limit=1` voltam com **permissão negada** (`42501`) — não com
  `[]`, que seria a RLS barrando com o privilégio ainda lá; `POST /rest/v1/rpc/confirm_dispatch` também
  negado.
- **Ponta a ponta, pelo Klaus:** questionário, pagamento, formulário, PDF e e-mail — a prova de que
  nenhum serviço dependia, sem sabermos, do acesso aberto.

## 5. Deploy

- **Branch:** `fix/rls-fechada`, a partir da `main` (já com a entrega única mesclada em 12/10/2026; a
  migration de 09/10 está em produção e esta vem depois dela).
- **Antes, por mim:** nos logs da API (`edge_logs`, na janela que a Supabase guarda), procurar pedidos
  a `/rest/v1/` feitos com a chave anônima. Responde se algum serviço legítimo usa o acesso (se usar,
  a publicação para) e se há sinal de alguém lendo os dados. Não responde pelo passado anterior à
  janela.
- **Publicação, pelo Klaus:** só `npx supabase db push`. Nenhuma função publicada, nenhum serviço
  reiniciado. Em seguida, as conferências do §4.3.
- **Se algo quebrar** (500 na Edge, 401 do Supabase no Express): a volta é uma migration com os `GRANT`
  antigos — o §4.1 (b) existe para isso não acontecer.

## 6. Documentação

- **`CLAUDE.md`, modelo de dados:** "RLS habilitada em todas as tabelas com política permissiva para
  service role" vira a invariante: `anon` e `authenticated` não têm privilégio algum no `public` e só a
  `service_role` acessa; tabela nova liga a RLS e acesso à chave anônima só com `GRANT` explícito,
  justificado na migration; função `SECURITY DEFINER` sai com
  `REVOKE … FROM PUBLIC, anon, authenticated`; o `rls_test.sql` reprova quem esquecer.
- **`CLAUDE.md`:** "dez migrations" passa a onze, com a desta correção; o comando do `rls_test.sql`
  entra na seção de testes.
- **`PROGRESSO.md`:** seção nova.
- **`PENDENCIAS.md`:** sai o item da RLS; sai o achado menor adiado da entrega única (a justificativa
  do bloqueio da `devolver_entrega` exagerava a proteção enquanto a RLS estava aberta), que esta
  correção resolve.

## 7. Fora do escopo

- **Storage:** os dois buckets já são privados, com políticas só da `service_role`.
- **Proteção da `form-submit`** (lista de origens mais a existência do `case_id`; bearer desligado):
  outra pendência.
- **Os padrões do `supabase_admin` e as três funções de texto**, pelos motivos do §3.3 e do §3.4.
- **Trocar a chave anônima:** ela é pública por definição; o problema eram os privilégios.

## 8. Critério de pronto

- `rls_test.sql` verde no banco local, com as suítes do §4.2 verdes;
- migration publicada, varreduras verdes em produção e a API REST negando a chave anônima;
- um caso de ponta a ponta chegando ao e-mail depois da publicação;
- `CLAUDE.md`, `PROGRESSO.md` e `PENDENCIAS.md` atualizados.
