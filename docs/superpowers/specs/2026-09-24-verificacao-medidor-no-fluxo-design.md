# Verificação do medidor no fluxo do recurso — Design

*Escrito em 24/09/2026. Decidido em conversa com o Klaus na mesma data. Fase 5 de
`PLANO-verificacao-radar-inmetro.md`.*

## 1. O problema, e por que este desenho existe

O parque de radares do RJ está em produção desde 22/09 (1.971 instrumentos, 9.652 verificações), a RPC
`verificar_medidor` responde com dado real, e desde a Fase 4 (24/09) o formulário captura nº de série,
nº INMETRO e nº do certificado do medidor. **Nada disso chega à peça.** Nenhum runtime chama a RPC, e a IA
redige sem saber se o radar tinha certificado vigente na data da infração.

A Fase 5 liga as pontas: a verificação roda no envio do formulário, fica gravada no caso com evidência
auditável, e o pipeline a transforma em instrução de redação.

Há um impasse que este desenho resolve explicitamente. A **Fase 0.5 (calibração)** — conferir 8 a 10
notificações reais contra a base — está bloqueada porque `form_submissions` tem 0 linhas em produção, e o
plano se contradiz sobre o que isso impede: a §5.4 diz que, até a calibração, "a coluna é gravada e
auditada, mas **não** entra no prompt"; o critério da Fase 0.5 diz "sem isso, a Fase 5 não sobe".
**Decisão do Klaus: constrói-se tudo, e a tese fica atrás de uma chave desligada.** Gravação e auditoria
entram em produção já — e viram dado para a própria calibração; o uso na peça liga por variável de
ambiente, sem deploy de código, depois que a Fase 0.5 for assinada.

## 2. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Escopo diante da Fase 0.5 | **Tudo construído; tese atrás de `RADAR_TESE_ATIVA=false`** | Decisão do Klaus. Gravar e auditar não tem risco jurídico e alimenta a calibração; redigir tem, e espera. |
| Onde a verificação roda | **Na Edge `form-submit`, antes do `attempt_dispatch`** | A verificação fica gravada antes de o pipeline ler o caso — sem janela de corrida. A Edge já usa service role, único papel com `EXECUTE` na RPC. No pipeline, ela não rodaria hoje (o pipeline não está em produção, pendência #11) e a calibração perderia a fonte. Trigger no Postgres foi descartado: esconde lógica (o projeto já removeu um trigger assim, o do `dup_guard`) e um erro nele derruba o INSERT. |
| Base legal que a IA pode citar | **Só CTB, art. 280, V e § 2º** | Conferidos no texto oficial em `CTB-compilado_files/L9503Compilado.html`: o inciso V exige identificar o "equipamento que comprovar a infração"; o § 2º exige aparelho "previamente regulamentado pelo CONTRAN". O número da resolução do CONTRAN sobre verificação metrológica **não foi confirmado** (risco 3 do plano) e fica proibido até ser. |
| Verificação vigente sem nº de certificado | **Corrigida na RPC** | 81 das 7.814 verificações de origem `historico` não trazem número; a RPC só avisava para origem `topo`. A condição do aviso passa a ser "número ausente", qualquer que seja a origem. A regra fica num lugar só, e o log de auditoria passa a trazê-la. |
| Match por endereço | **Não usado** | O formulário não tem município da infração — `cidade` é o endereço do cliente, vindo do CEP. Extrair município do texto livre de `localSentido` seria chute; `p_municipio` e `p_local` vão `null`. |
| Chamada sem nº de série nem nº INMETRO | **Não chama a RPC** | Sem identificador, a RPC devolveria `sem_registro` com o aviso "instrumento não localizado na base pública" — falso, porque não houve busca. |
| Quem escolhe a regra de redação | **O código, não o modelo** | O status vira uma instrução única, escolhida em Python. O modelo não precisa mapear status → regra, e o que ele não pode citar nem chega ao prompt. |

**Escopo negativo, explícito.** Não entram: ligar `RADAR_TESE_ATIVA` em produção; match por endereço;
qualquer mudança no `dup_guard`, na guarda de 409, no bloco do `attempt_dispatch`, no contrato do 202 ou no
corpo da resposta da `form-submit`; mudanças no Express; a Fase 6 (alertas, view de revisão, métricas);
qualquer UF que não seja RJ.

## 3. Banco

Uma migration nova, `supabase/migrations/20260924000001_verificacao_medidor.sql`. Nenhuma migration antiga
é tocada.

**3.1 A coluna.** `ALTER TABLE form_submissions ADD COLUMN verificacao_medidor jsonb` — anulável, sem
default. Guarda o objeto devolvido pela RPC inteiro, no contrato da §0 do plano. Os dois "vazios" têm
significados diferentes, e a Fase 6 depende da diferença:

- `NULL` — a verificação **nunca rodou** (caso anterior à Fase 5);
- `{"status": "nao_aplicavel", …}` — rodou e não se aplicava, ou falhou.

**3.2 O aviso na RPC.** `CREATE OR REPLACE FUNCTION public.verificar_medidor(...)` com o corpo atual e **uma**
condição trocada: `IF v_cert.origem = 'topo'` passa a `IF nullif(v_cert.numero_certificado, '') IS NULL`.
O aviso *"a base pública informa a verificação, mas não o número do certificado"* sai sempre que o número
faltar — inclusive string vazia, que hoje também escapa. `CREATE OR REPLACE` preserva os privilégios, mas o
`REVOKE`/`GRANT` do fim é repetido, para a migration dizer por si só quem pode executar.

**3.3 `radar_consultas_log` não muda.** Já tem `case_id` único (com FK para `form_submissions`), `entrada`,
`resultado`, `status`, `confianca`, `metodo_match` e os campos de revisão humana.

**Ordem de deploy:** a migration sobe **antes** da Edge. Na ordem inversa, o UPDATE da coluna falharia —
sem derrubar o envio, porque está dentro do `try/catch` da §4, mas perdendo a verificação.

## 4. Edge `form-submit`

**4.1 Módulo puro, `supabase/functions/form-submit/verificacao.ts`.** Sem imports, para rodar sob
`node --test` (Deno não está instalado no WSL). Três funções:

- `entradaDaVerificacao(norm)` → argumentos da RPC, ou `null` se não houver `medidor_numero_serie` **nem**
  `medidor_numero_inmetro`. Argumentos: `p_numero_serie`, `p_numero_inmetro`, `p_data_infracao` (os 10
  primeiros caracteres de `data_infracao` — o relógio de parede do papel, `AAAA-MM-DD`, sem conversão de
  fuso), `p_municipio: null`, `p_local: null`.
- `naoAplicavel(aviso)` → objeto de fallback no formato do contrato: `status: "nao_aplicavel"`,
  `confianca: "baixa"`, `metodo_match: "nenhum"`, `instrumento`, `certificado_vigente` e `evidencia`
  nulos, `certificados_proximos: []`, `avisos: [aviso]`. Os dois avisos usados:
  - `"dados do medidor não informados — verificação não realizada"`;
  - `"verificação indisponível"`.
- `linhaDoLog(caseId, entrada, resultado)` → a linha de `radar_consultas_log`: `case_id`, `entrada`,
  `resultado`, `status`, `confianca`, `metodo_match`, `consultado_em` (agora), e `revisado_por` /
  `revisado_em` **nulos** — uma consulta nova invalida revisão humana feita sobre dados anteriores.

**4.2 Em `index.ts`**, um bloco novo **entre** a gravação do formulário (depois do `if (upsertErr)`) e o
`attempt_dispatch`:

1. Sem entrada → `naoAplicavel("dados do medidor não informados — verificação não realizada")`; a RPC
   **não** é chamada.
2. Com entrada → `supabase.rpc("verificar_medidor", args).abortSignal(AbortSignal.timeout(3000))`. Erro,
   timeout ou `data` nulo → `naoAplicavel("verificação indisponível")`; o motivo real vai só para
   `console.error`.
3. `UPDATE form_submissions SET verificacao_medidor = … WHERE case_id = …` — **sem tocar
   `document_status`** (a invariante do `CLAUDE.md`: reescrever o status gera um segundo e-mail).
4. Upsert em `radar_consultas_log` com `onConflict: "case_id"` — **também para `nao_aplicavel`**: a
   calibração e as métricas precisam saber quantos casos chegam sem os números.
5. Tudo dentro de um `try/catch` próprio, que só loga. Nenhum caminho novo devolve erro ao cliente; o
   `attempt_dispatch` roda em seguida, como hoje.

**4.3 Comportamento que decorre do que já existe:** reenvio idêntico é no-op pelo `dup_guard` e não
reverifica; reenvio com dados novos passa pelo UPDATE e reverifica; caso `completed`/`failed` recebe 409
antes e não reverifica.

**Latência:** zero quando os números não foram informados; no pior caso, 3 s mais duas escritas.

## 5. Pipeline

**5.1 A chave.** `config.py` ganha `radar_tese_ativa: bool = False` (variável `RADAR_TESE_ATIVA`). O padrão
é o modo seguro: quem não define a variável não liga a tese.

**5.2 Módulo puro, `pipeline/verificacao.py`.** Sem dependências, testável com `unittest` fora do venv de
Windows. Duas funções:

`instrucao_de_redacao(v) -> str | None` — a regra do caso, escolhida em código, **nesta ordem de
precedência** (a primeira linha que casar vence):

| # | Verificação | Instrução |
|---|---|---|
| 1 | `nao_aplicavel`, ou `v` nulo | `None` — sem bloco. |
| 2 | `confianca` diferente de `"alta"`, qualquer status | **Pedido de exibição** (texto da linha 5). A RPC hoje só produz `alta` e `baixa`, mas o contrato admite `media`: só `alta` libera as linhas 3 e 4. |
| 3 | `reprovado` | Tese forte: o equipamento foi reprovado na verificação que cobre a data. Citar data do laudo e resultado; o nº do certificado **só se constar no bloco**. |
| 4 | `comprovado_valido` | **Não** levantar tese metrológica e **não** mencionar a verificação na peça. |
| 5 | `nao_comprovado`, `sem_registro`, `ambiguo`, ou status desconhecido | **Pedido de exibição**: requerer que o órgão junte aos autos o certificado de verificação vigente na data da infração, informando que a consulta à base pública do INMETRO não o localizou. **Nunca** afirmar que o radar estava sem verificação. Não citar número de certificado. |

`bloco_verificacao(v) -> str | None` — o texto em português que entra no prompt, ou `None` quando a
instrução é `None`. Contém: o resultado em palavras; o equipamento (município, local, proprietário); o
certificado vigente **só quando a regra permite citá-lo** (data do laudo, validade e resultado em
`dd/mm/aaaa`, e o número só se existir e a regra permitir); os avisos da RPC; a fonte ("base de dados
abertos do INMETRO/RBMLQ, capturada em dd/mm/aaaa"); e, por fim, a instrução. **O que a regra proíbe citar
não entra no bloco** — o modelo não tem como citar o que não recebeu.

**5.3 Em `worker.py`:**

- `verificacao_medidor` entra em `CAMPOS_INTERNOS` **sempre**. Com a chave desligada ou ligada, o dict cru
  nunca chega ao prompt. (Os três `medidor_numero_*` continuam no laço genérico — são fatos do formulário.)
- `build_case_context(case)`: com a chave ligada e bloco não nulo, o bloco entra logo depois do cabeçalho
  e **fora** do corte `lines[:200]`.
- `call_deepseek`: com a chave ligada, o system prompt ganha três proibições gerais — citar como base
  legal só o CTB, art. 280, V e § 2º (nenhuma resolução do CONTRAN, nenhuma portaria do INMETRO); não citar
  número de certificado que não esteja no bloco; não afirmar irregularidade do equipamento. Com a chave
  desligada, o prompt é **idêntico** ao de hoje.
- O worker loga o bloco gerado (só dados do equipamento, nenhum dado pessoal do cliente).

## 6. Testes

| Camada | Instrumento | O que prova |
|---|---|---|
| RPC | pgTAP, 24 → 26 | Verificação `historico` vigente com nº vazio traz o aviso; origem `topo` continua trazendo (regressão). |
| Edge | `node --test` sobre `verificacao.ts`, incluído no `npm run radar:test` | Entrada `null` sem números; entrada com só um dos dois números; data cortada no relógio de parede; formato do fallback; linha do log com revisão zerada. |
| Pipeline | `python3 -m unittest` sobre `pipeline/test_verificacao.py` | A instrução de cada status, na ordem de precedência; `reprovado` e `comprovado_valido` com confiança baixa ou média caem no pedido de exibição; status desconhecido cai no pedido de exibição; `nao_comprovado` e origem `topo` não trazem número no bloco; `nao_aplicavel` sem bloco; chave desligada deixa contexto e system prompt idênticos aos de hoje. |

**Ponta a ponta local:**

1. Parque do RJ no banco local com `npm run radar:ingest` (a precedência do `.env.local` o manda para o
   local).
2. Quatro envios pela Edge local, conferindo a coluna e a linha do log em cada um: sem números
   (`nao_aplicavel`); série de aparelho com certificado vigente na data (`comprovado_valido`); série de
   aparelho `Reprovado` na data (`reprovado`); e **falha simulada** — `REVOKE EXECUTE` temporário da função
   no banco local — com resposta 200, `nao_aplicavel` com "verificação indisponível" e o `attempt_dispatch`
   rodando em seguida. Permissão restaurada ao fim.
3. Pipeline com Express local no ar e `RADAR_TESE_ATIVA=true`: contexto montado a partir do caso real lido
   do Express, e **uma chamada real ao DeepSeek** para `reprovado` e outra para `nao_comprovado`, lendo o
   texto para conferir que o modelo não cita resolução do CONTRAN, não inventa número e não afirma
   irregularidade.

## 7. Ordem de publicação

1. Merge do código com a chave desligada. O pipeline não está em produção (pendência #11), então não há
   efeito imediato.
2. `npx supabase db push` — pelo Klaus, no terminal dele (o CLI não autentica a partir do shell do Claude
   Code).
3. `npx supabase functions deploy form-submit` — pelo Klaus, **depois** do push.
4. `RADAR_TESE_ATIVA` permanece `false` até a Fase 0.5 ser assinada. Ligar vira pendência.

**Documentação:** `RADAR_TESE_ATIVA=false` nos três `.env*.example`; no `CLAUDE.md`, a variável e duas
invariantes (a verificação nunca derruba o envio; o dict nunca vai cru ao prompt); `PROGRESSO.md` e
`PENDENCIAS.md` atualizados.

## 8. Critério de pronto

- 26/26 pgTAP; `npm run radar:test` e `python3 -m unittest` verdes; build verde; lint no baseline.
- Os quatro envios locais da §6 com coluna e log corretos, incluindo a falha simulada devolvendo 200.
- Os dois textos reais do DeepSeek lidos e dentro das regras.
- Com a chave desligada, `build_case_context` e o system prompt idênticos aos de antes da mudança.
