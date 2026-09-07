# Plano de implementação — Verificação do medidor de velocidade (INMETRO/RBMLQ) — **escopo: RJ**

> **Para o Claude Code.** Este documento é a especificação de execução. Leia por inteiro antes de escrever
> qualquer linha. Implemente **fase por fase**, na ordem, parando ao fim de cada fase para rodar os testes
> daquela fase. Não pule para a fase seguinte com teste vermelho.
>
> Repositório: `KlausVSommerfeld/amorecorrer.com` · Branch base: `main`
> Feature branch: `feat/verificacao-radar-inmetro-rj`
>
> **Escopo travado: apenas o estado do Rio de Janeiro (UF = RJ).** Não implemente nada multi-UF. A UF fica
> em constante nomeada (`UF_ALVO = 'RJ'`) para que a expansão futura seja mecânica, mas **nenhuma** decisão
> de design deve pagar preço hoje por hipóteses de outros estados.

---

## 0. Objetivo

Para cada caso de multa por excesso de velocidade no RJ, determinar se o medidor que gerou a autuação
**possuía certificado de verificação INMETRO comprovadamente vigente** na data da infração, e entregar esse
resultado — com evidência auditável — ao pipeline que redige o recurso.

Contrato de saída (estável). É gravado em `form_submissions.verificacao_medidor` e chega à IA jurídica pelo
read model do Express — ver Fase 5:

```json
{
  "status": "comprovado_valido | nao_comprovado | reprovado | sem_registro | ambiguo | nao_aplicavel",
  "confianca": "alta | media | baixa",
  "metodo_match": "numero_serie | numero_inmetro | local_municipio | nenhum",
  "instrumento": {
    "municipio": "RIO DE JANEIRO",
    "local_via": "Est Rio Grande Px1096",
    "tipo_medidor": "Fixo",
    "proprietario": "CONSILUX CONSULTORIA E CONSTRUÇÕES ELÉTRICAS LTDA",
    "velocidade_nominal": 40,
    "sentido": "Est Tindiba"
  },
  "certificado_vigente": {
    "origem": "historico | topo",
    "numero": "13785621",
    "numero_ensaio": "478",
    "data_laudo": "2024-07-12",
    "data_validade": "2025-07-11",
    "tipo_servico": "Periódica",
    "resultado": "Aprovado"
  },
  "certificados_proximos": [
    { "numero": "13780552", "data_laudo": "2023-01-03", "data_validade": "2024-01-02" }
  ],
  "evidencia": {
    "fonte_url": "https://servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json",
    "snapshot_id": "uuid",
    "sha256": "…",
    "capturado_em": "2026-09-01T04:30:00Z"
  },
  "avisos": []
}
```

Repare no vocabulário: **`comprovado_valido` / `nao_comprovado`**, não "válido" / "vencido". A §2 explica
por que essa escolha de palavras é o núcleo do projeto, e não preciosismo.

`certificado_vigente.origem` distingue a procedência da prova: `historico` (uma entrada do array `Historico`,
com número de certificado) ou `topo` (o par `DataUltimaVerificacao`/`DataValidade` do registro, que **não traz
número de certificado** — nesse caso `numero` e `numero_ensaio` vêm `null` e um aviso registra que o número
não consta na base pública). A §1.4.11 explica por que ignorar a origem `topo` classificaria errado 297
instrumentos.

---

## 1. Fatos verificados na fonte (não re-investigar)

Levantados em 2026-09-01 direto no arquivo de produção do RJ.

### 1.1 O endpoint

| Fato | Valor |
|---|---|
| Endpoint | `https://servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json` |
| Descoberto via | `https://dados.gov.br/api/publico/conjuntos-dados/portal-de-servicos-do-inmetro-nos-estados-psie` |
| Licença | Creative Commons CC0 |
| Atualização | **irregular, apesar de nominalmente diária.** Em 03/09/2026 o arquivo ainda respondia `Last-Modified: Tue, 01 Sep 2026 00:12:26 GMT` — três dias sem regeneração. Ver Fase 6.1. |
| Tamanho (RJ) | **3,66 MB** (3.661.867 bytes em 03/09/2026) |
| Autenticação | nenhuma |
| Requisições necessárias | **1 por dia** |

### 1.2 O que existe no RJ (censo do arquivo)

| Métrica | Valor |
|---|---|
| Instrumentos | **1.971** |
| Municípios cobertos | 67 |
| Município do Rio de Janeiro | 1.111 (56% do estado) |
| Tipo `Fixo` | 1.939 · `Estático ou Portátil` 32 |
| Verificações no histórico | **7.814**, cobrindo de **2011 a 2026** |
| Números de série distintos | 1.976 — **apenas 2 aparecem em mais de um instrumento** |
| Números INMETRO distintos | 1.815 — 8 aparecem em mais de um instrumento |
| Instrumentos **sem nenhum** histórico | **311 (15,8%)** |
| …destes, com **par do topo** válido (`DataUltimaVerificacao` + `DataValidade`) | **297 — todos `Aprovado`** |
| …cujo par do topo cobria 04/09/2026 | **225** |
| Instrumentos sem registro algum (nem histórico, nem par do topo válido) | **14** |
| Instrumentos com histórico mas `DataValidade` vazia no topo | 119 |
| Instrumentos sem faixas | 1 |
| Validade dos certificados | 12 meses em 7.772 de 7.814 casos (42 têm duração 0 — dado inválido) |

Municípios com mais instrumentos: RIO DE JANEIRO (1.111), ARARUAMA (78), MACAÉ (60), CABO FRIO (54),
SÃO PEDRO DA ALDEIA (52), SAQUAREMA (37), SÃO GONÇALO (36), MARICÁ (35), CAMPOS DOS GOYTACAZES (30).

Proprietários (empresas operadoras, **não** o órgão autuador): CONSILUX (328), SPLICE (293), PERKONS (247),
CLD CONSTRUTORA (233 + 134 grafados de forma diferente), ELISEU KOPP (231), SITRAN (162), TALENTECH (147),
ETT-ESTEIO (80), FOCALLE (35).

### 1.3 Registro real do RJ (usar como fixture canônico)

```json
{
  "SiglaUf": "RJ",
  "Estado": "Rio de Janeiro",
  "Municipio": "RIO DE JANEIRO",
  "LocalVerificacao": "Est Rio Grande Px1096",
  "DataUltimaVerificacao": "28/08/2026",
  "DataValidade": "27/08/2027",
  "UltimoResultado": "Aprovado",
  "TipoMedidor": "Fixo",
  "Faixas": [
    { "NumeroFaixa": "2", "NumeroInmetro": "14117709", "NumeroSerie": "2000065",
      "Sentido": "Est Tindiba", "VelocidadeNominal": "40" },
    { "NumeroFaixa": "1", "NumeroInmetro": "14117709", "NumeroSerie": "2000065",
      "Sentido": "Est Pau Fome", "VelocidadeNominal": "40" }
  ],
  "Historico": [
    { "NumeroCertificado": "13785621", "NumeroEnsaio": "478", "Ano": "2024",
      "DataLaudo": "12/07/2024", "DataValidade": "11/07/2025",
      "TipoServico": "Periódica", "Resultado": "Aprovado" },
    { "NumeroCertificado": "13780552", "NumeroEnsaio": "12", "Ano": "2023",
      "DataLaudo": "03/01/2023", "DataValidade": "02/01/2024",
      "TipoServico": "Periódica", "Resultado": "Aprovado" },
    { "NumeroCertificado": "13773206", "NumeroEnsaio": "1024", "Ano": "2021",
      "DataLaudo": "20/12/2021", "DataValidade": "19/12/2022",
      "TipoServico": "Periódica", "Resultado": "Aprovado" },
    { "NumeroCertificado": "13785998", "NumeroEnsaio": "737", "Ano": "2025",
      "DataLaudo": "01/10/2025", "DataValidade": "30/09/2026",
      "TipoServico": "Periódica", "Resultado": "Aprovado" }
  ],
  "Proprietario": { "Nome": "CONSILUX CONSULTORIA E CONSTRUÇÕES ELÉTRICAS LTDA",
                    "Municipio": "CURITIBA", "Estado": "PR" }
}
```

### 1.4 Armadilhas confirmadas nos dados reais do RJ

Cada item abaixo foi observado no arquivo. Todos precisam de teste.

1. **O array é o topo do JSON**, sem envelope.
2. **Todas as datas são `DD/MM/YYYY` string; todos os números são string** (inclusive `VelocidadeNominal`).
3. **`Historico` NÃO vem ordenado.** No exemplo acima a ordem é 2024, 2023, 2021, 2025. Ordene sempre por
   `DataLaudo` antes de qualquer raciocínio temporal. Este é o bug mais fácil de introduzir aqui.
4. **`Resultado` tem quatro valores**, não dois: `Aprovado` (7.772), `Reprovado` (41), `Pendente` (1),
   e string vazia. E `UltimoResultado` no topo tem um valor que **não** aparece no histórico: **`Reparado`**
   (131 instrumentos). Uma lógica `resultado === 'Aprovado' ? ok : reprovado` classifica `Reparado` como
   reprovação — **erro grave, com consequência jurídica**. Mapeie explicitamente e trate desconhecido
   como `indeterminado`, nunca como reprovado.
5. **`TipoServico` tem cinco valores:** `Periódica` (5.452), `Após Reparo` (1.523), `Inicial` (834),
   `Fiscalização` (1) e string vazia (4).
6. **`Sentido` é texto livre e inconsistente.** No RJ aparece como `STA CRUZ` e `Santa Cruz`, `CENTRO` e
   `Centro`, além de `Crescente`/`Decrescente` e nomes de bairros (`Est Tindiba`). Nunca use como chave;
   normalize com `unaccent` + `upper` para exibição.
7. **`VelocidadeNominal` vem `"0"`** em 32 faixas. Tratar como nulo, não como limite de 0 km/h.
8. **Grafia instável em nomes próprios**: `CLD CONSTRUTORA, LAÇOS DETETORES E ELETRÔNICA LTDA` e
   `CLD CONSTRUTORA, LACOS DETETORES E ELETRONICA LTDA` são a mesma empresa, contadas separadamente.
9. **`LocalVerificacao` é abreviado e não-canônico**: `"Est Rio Grande Px1096"`, `"RJ106 KM 84,8"`.
   A notificação de infração escreve o mesmo lugar de outro jeito ("Estrada do Rio Grande, altura do
   nº 1096"). Isso limita severamente o match por endereço — ver §2.3.
10. **Instrumento com `UltimoResultado: "Reparado"` e `Historico: []`** existe (ex.: ARARUAMA, RJ106 KM 84,8).
11. **O par do topo (`DataUltimaVerificacao` + `DataValidade`) é uma verificação que frequentemente NÃO está
    no `Historico`.** Nos 1.660 instrumentos que têm histórico ele é redundante: coincide com o laudo mais
    recente do array em **1.659** casos. Mas entre os 311 com `Historico: []`, **297 têm par do topo válido,
    datado e com `UltimoResultado: "Aprovado"`** — e em **225** deles a validade cobre a data de hoje. Os
    laudos desses 297 concentram-se no presente: 2 em 2022, 25 em 2023, 36 em 2024, 71 em 2025 e **163 em
    2026**. Tratar `Historico: []` como "sem registro" classifica errado esses 297 instrumentos, e o erro é
    maior justamente nas datas de infração recentes — as que chegam ao produto dentro do prazo de recurso.
    Consequências em §2.1, Fase 1, Fase 2 e Fase 3.
12. **`DataValidade` do topo vem string vazia em 119 instrumentos que têm histórico.** Par do topo inválido
    não é erro: apenas não contribui prova. Só os **14** instrumentos sem histórico *e* sem par válido são
    `sem_registro` legítimo.

---

## 2. O achado que define o produto — leia antes de projetar qualquer coisa

### 2.1 A medição

Simulei, contra os 1.971 instrumentos do RJ, quantos teriam um certificado cobrindo uma data de infração
hipotética. A medição foi refeita em 03/09/2026 sobre o mesmo arquivo (sha256 `4dcb3d35…48fb9b`), agora
distinguindo as duas fontes de prova da §1.4.11:

| Data da infração | **Sem cobertura** — só `Historico` | **Sem cobertura** — `Historico` + par do topo | Δ |
|---|---|---|---|
| 15/06/2024 | 1.270 (64,4%) | 1.238 (62,8%) | +32 |
| 10/03/2025 | 1.124 (57,0%) | 1.090 (55,3%) | +34 |
| 20/11/2025 | 1.159 (58,8%) | 1.098 (55,7%) | +61 |
| 05/05/2026 | 1.402 (71,1%) | 1.319 (66,9%) | +83 |
| 01/08/2026 | 1.369 (69,5%) | **1.144 (58,0%)** | **+225** |
| 01/09/2026 | 1.376 (69,8%) | **1.148 (58,2%)** | **+228** |

(A coluna da esquerda soma "sem cobertura" e "sem histórico" da versão anterior desta tabela — as duas
contagens são a mesma coisa do ponto de vista do produto: nenhuma prova de vigência na data.)

**Duas leituras, ambas necessárias.**

Primeira: **entre 55% e 67% dos instrumentos do RJ não têm, neste dataset, prova de vigência numa data
qualquer.** O número continua alto depois da correção — o problema da §2.2 não desaparece. 73,7% dos
instrumentos com dois ou mais certificados apresentam lacuna entre a validade de um e o laudo do seguinte;
a maior lacuna observada é de 2.572 dias.

Segunda: **todo o ganho da coluna direita vem dos instrumentos com `Historico: []`** — para os que têm
histórico, o par do topo não acrescenta um único caso. E o ganho cresce conforme a data de infração se
aproxima do presente: 32 casos em jun/2024, 228 em set/2026 (11,6 pontos percentuais). Ou seja, **ignorar o
par do topo erra pouco no passado e muito no presente**, exatamente na faixa de datas em que o produto
opera, já que o recurso tem prazo.

### 2.2 A leitura correta desse número

Duas hipóteses explicam o resultado:

- **(a)** Metade dos radares do Rio realmente operou sem verificação metrológica vigente.
- **(b)** O arquivo de dados abertos está incompleto — certificados existem mas não constam.

**Não sabemos qual predomina.** E a diferença entre as duas é a diferença entre um produto que funciona e um
que gera 65% de recursos formulaicos, todos afirmando irregularidade, todos indeferidos em bloco — com o
risco adicional de afirmar em peça dirigida ao poder público um fato que não se comprovou.

**Mas o próprio dataset já prova que (b) ocorre.** Os 297 instrumentos da §1.4.11 têm uma verificação
documentada — data, validade e resultado `Aprovado` no topo do registro — e o `Historico` deles está
**vazio**. Não é interpretação: é o mesmo arquivo afirmando que houve verificação e, ao mesmo tempo, não a
listando. Se o array pode estar vazio havendo verificação, ele também pode estar parcial havendo várias.

Isso não mede o tamanho de (b) nem absolve os instrumentos que *têm* histórico com lacunas — mas desloca o
ônus da prova. A conclusão prática não muda, ela endurece: `nao_comprovado` significa **"não consta na base
pública"**, e essa base comprovadamente omite. A Fase 0.5 continua bloqueante; o que este achado faz é
tornar o cenário conservador dela o mais provável dos dois.

Consequências de projeto, todas obrigatórias:

- O status para lacuna chama-se **`nao_comprovado`**, jamais "vencido" ou "irregular".
- A redação gerada para `nao_comprovado` é **pedido de exibição do certificado**, nunca afirmação de
  ausência. Ver §5.4.
- A **Fase 0.5 (calibração) é bloqueante**: sem ela, não se sobe a Fase 5 para produção.
- O caso `comprovado_valido` tem valor próprio e talvez maior: ele **impede** que a IA levante uma tese
  metrológica perdedora, poupando o cliente de um argumento que enfraquece a peça.

### 2.3 Sobre o match por endereço

Dado o formato de `LocalVerificacao` (§1.4.9), o fallback por município + similaridade textual é fraco.
Decisão: ele **existe apenas para apresentar candidatos a um revisor humano**. Um resultado obtido por
`metodo_match: "local_municipio"` **nunca** alimenta tese jurídica automaticamente — sai como
`confianca: baixa` e cai na fila de revisão.

A boa notícia compensa: no RJ, `NumeroSerie` é praticamente uma chave primária (2 colisões em 1.976).
Quando a notificação traz o número de série, o match é sólido.

---

## 3. Regras invioláveis

1. **Proibido fazer scraping de `https://servicos.rbmlq.gov.br/Instrumento`.** Tem reCAPTCHA e token
   antiforgery. Tudo que é necessário está no endpoint de dados abertos.
2. **Proibido resolver, contornar ou terceirizar CAPTCHA**, por qualquer meio. Se algum requisito parecer
   exigir isso, pare e reporte — o requisito está errado.
3. **Proibido Playwright, Selenium ou agente-LLM-com-browser no caminho de produção.**
4. **Lacuna de dados nunca vira afirmação de irregularidade.** Ver §2.2.
5. **Todo resultado usado em peça precisa de evidência persistida**: o JSON bruto do RJ com `sha256` e
   timestamp de captura.
6. **Nenhum segredo novo em variável `VITE_*`.** Ver §4.3.
7. **User-Agent identificável com e-mail de contato** na requisição ao INMETRO. Uma requisição por dia.

---

## 4. Estado atual do repositório

> **Seção reescrita em 03/09/2026 contra o código real.** A versão anterior descrevia uma arquitetura
> baseada em **n8n** que não existe mais: `grep -rn "n8n" src/` não retorna nada, e a perna de IA hoje é
> Express + FastAPI. Onde este documento e o código divergirem, o código vence.

### 4.1 Os quatro runtimes (confirmado)

O sistema são quatro processos independentes encadeados por um **`case_id`** (`CASO_<uuid>`), gerado no
servidor no momento do checkout:

| Runtime | Stack | Papel |
|---|---|---|
| `src/` | React 18 + Vite + Tailwind/shadcn | landing, formulário, páginas legais |
| `supabase/functions/` | Deno | `create-checkout-session`, `stripe-webhook`, `form-submit` — **só estas três** |
| `server/` | Express + TS (`:3001`) | API `/internal/*` — **único** caminho do pipeline até o Postgres |
| `pipeline/` | FastAPI + worker async (`:8000`) | DeepSeek → PDF (reportlab) → Storage → SMTP |

O usuário **paga primeiro** e só então preenche o formulário. Quando `form-submit` roda, o caso já existe e
o pagamento normalmente já está confirmado.

```
Form.tsx ──POST──> edge `form-submit` ──upsert──> form_submissions
                         │
                         ├──> attempt_dispatch()   (só se payment_status='paid' e document_status='pending')
                         │
                         └──POST assinado (HMAC)──> pipeline /hooks/dispatch ──202──> BackgroundTasks
                                                          ├─ GET /internal/cases/:id (Express)
                                                          ├─ DeepSeek ─> PDF ─> Storage ─> SMTP
                                                          └─ POST /internal/dispatch/finish
```

**O contrato do 202 é intocável:** a Edge só marca `document_status = 'generating'`; quem fecha o ciclo é o
Express, via `confirm_dispatch`. Esta feature não encosta nisso.

### 4.2 Pontos de integração já verificados no código

- **`server/src/index.ts:164`** — `GET /internal/cases/:caseId` faz `.select("*")` em `form_submissions` e
  devolve a linha inteira em `agg["case"]`. **Consequência decisiva para a Fase 5: qualquer coluna nova em
  `form_submissions` chega ao worker sem uma única linha de código de transporte.**
- **`pipeline/worker.py:141`** — `build_case_context(case)` serializa o caso como `chave: valor`, ordenado,
  ignorando nulos e vazios, truncado em 200 linhas. É o *user message* da DeepSeek.
- **`pipeline/worker.py:107`** — `call_deepseek` tem *system prompt* genérico ("Você é um assistente
  jurídico… Não invente dados ausentes. Produza 2 a 4 parágrafos."). Não há nada específico por tese: é aqui
  que a §5.4 precisa entrar.
- **`supabase/functions/form-submit/index.ts:366`** — o `upsert` em `form_submissions`; **`:384`** — o bloco
  `attempt_dispatch`. A verificação entra entre os dois.

### 4.3 Campos do formulário hoje

`FormData` em `src/pages/Form.tsx`, nomes exatos do estado:

`nomeCompleto, email, emailConfirma, telefone, cpf, cnh, cep, endereco, cidade, estado, orgaoAutuador,
notificacaoPenalidade, estagio, autoInfracao, expedidaEm, placa, marcaModeloEspecie, localSentido, dataHora,
renainf, descricaoInfracao, amparoLegal, justificativa, velocidade_permitida, velocidade_aferida,
form_token, case_id, stripe_session_id`

Três correções à Fase 4, que foi escrita sem isto:

1. **`velocidade_permitida` e `velocidade_aferida` já existem** — no formulário, em `form-submit` (`:355`)
   e na tabela (migration `20250101000003`). A Fase 4 propunha `velocidadeAferida` / `velocidadeConsiderada`
   / `velocidadeRegulamentada`: seria duplicata semântica. **Só os três campos do medidor são novos.**
2. **A convenção de nome mudou no meio do caminho:** os campos antigos são camelCase, os recentes são
   snake_case iguais à coluna. Campos novos seguem o padrão recente.
3. Segue verdade que **não há nenhum campo sobre o medidor** — série, número INMETRO, certificado.
   `especieDocumento`, citado na versão anterior desta seção, virou `estagio`.

### 4.4 Reconhecimento (Fase 0) — o que de fato falta

O schema **é conhecido e está documentado no `CLAUDE.md`**; não há o que descobrir. A cadeia é
`stripe_sessions` → `form_submissions` (1 por `case_id`) → `dispatches` (1 por caso) →
`generated_documents`. A tabela de caso é **`form_submissions`** e sua identidade é **`case_id text unique`**
— não um uuid de submissão. Todo o plano usa `case_id`; ver a correção na Fase 1.

O que resta confirmar contra o remoto:

```bash
npx supabase link --project-ref tsdzvxgkokrjqayxukud
npx supabase migration list     # aplicado no remoto vs. os 12 arquivos em supabase/migrations/
npx supabase functions list     # há funções órfãs no remoto?
```

`submit-form` e `force-log-webhook`, citados na versão anterior, **não existem no repositório**. Se
aparecerem no remoto, são órfãs de uma versão antiga: abra issue, **não** integre nada nelas e **não**
delete nesta branch.

`src/integrations/supabase/types.ts` está com os tipos **vazios** (`Tables: { [_ in never]: never }`),
dessincronizado do banco real — isso se confirmou. Regenerar faz parte da Fase 1.

### 4.5 Restrições do repositório que esta feature precisa respeitar

- **`npm` é o gerenciador oficial** (lockfile versionado). Não usar bun/yarn/pnpm.
- **Nenhum segredo novo em `VITE_*`** — o Vite só expõe essas, e elas vão para o bundle.
- A **dívida de Basic Auth do n8n no frontend, apontada na versão anterior deste plano, não existe mais.**
  Não há issue a abrir.
- `form-submit` é protegida hoje **apenas por whitelist de origem + existência do `case_id`** (a validação
  de bearer está comentada). A RPC nova não pode ampliar essa superfície: `security definer`, acessível
  **só a `service_role`**, nunca a `anon`.
- O rate limit de `form-submit` é in-memory por isolate. A chamada à RPC não pode acrescentar latência que
  faça a função estourar tempo — daí o timeout de 3s da Fase 5.
- O ciclo local exige **cinco processos** (Supabase, `functions serve`, Vite, Express, FastAPI), e a
  precedência é `.env` → `.env.local`, com o último vencendo. Ver `CLAUDE.md`.

---

## 5. Arquitetura alvo

```
   pg_cron (1x/dia, 04:30 UTC)
        │  net.http_post
        v
   Edge Function `ingest-radares-rj`     ← 1 arquivo, 3,7 MB, 1.971 registros
        │
        ├──> Storage (bucket privado `evidencias`)
        │      radares/RJ/{YYYY-MM-DD}-{sha12}.json      ← a prova
        │
        └──> Postgres
               radar_snapshots · radar_instruments
               radar_faixas    · radar_verificacoes
                       │
                       │  RPC verificar_medidor()
                       v
   Form.tsx ─> edge fn `form-submit` ─> verificação ─> form_submissions.verificacao_medidor
                                            │                          │
                                            │                          v
                                            │            Express GET /internal/cases/:id  (select *)
                                            │                          │
                                            │                          v
                                            │            pipeline/worker.py ─> DeepSeek ─> PDF
                                            │
                                            └─> radar_consultas_log (auditoria por caso)
```

### 5.1 Decisão de runtime — recomendação revisada

Uma versão anterior deste plano previa GitHub Actions, justificado pelo tamanho dos arquivos (SP tem 18 MB).
**Com o escopo travado em RJ, esse argumento caiu**: são 3,7 MB e 1.971 registros, que cabem folgadamente
numa Edge Function.

**Recomendação: Edge Function `ingest-radares-rj` agendada por `pg_cron` + `pg_net`.** A razão que
sobrevive ao corte de escopo é de segurança: o `SUPABASE_SERVICE_ROLE_KEY` nunca sai do Supabase, enquanto
na alternativa ele viraria um secret do GitHub. Um sistema a menos, um lugar a menos onde a chave mais
poderosa do projeto existe.

Setup: `create extension if not exists pg_cron; create extension if not exists pg_net;` e um
`cron.schedule` chamando `net.http_post` para a URL da função, com um shared secret guardado no Supabase
Vault e conferido pela função no header.

**Alternativa documentada** (se `pg_cron`/`pg_net` derem trabalho no plano atual): um workflow do GitHub
Actions com cron `30 4 * * *`, secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Funciona igual;
escolha essa se a primeira travar, e registre a troca no PR. Não implemente as duas.

#### 5.1.1 — Medir antes de escolher (pré-requisito da Fase 2)

A frase "cabem folgadamente numa Edge Function" acima **é uma hipótese, não uma medição**, e o limite que
morde aqui não é o de *wall clock* — é o de **tempo de CPU** por invocação. O trabalho é justamente do tipo
que consome CPU e não espera I/O: `sha256` sobre 3,66 MB, `JSON.parse` do mesmo volume, e a normalização de
1.971 instrumentos em ~3.346 faixas e ~9.652 verificações. Uma função que estoura o limite de CPU é morta no
meio, e o sintoma é uma ingestão que falha de forma intermitente conforme o arquivo cresce — o pior tipo de
defeito para uma rotina que roda de madrugada.

**Faça esta medição antes de escrever a Fase 2** (custa cerca de uma hora e decide o desenho dela):

1. Escreva uma Edge Function descartável que baixe o arquivo do RJ, calcule o `sha256`, faça o `JSON.parse`
   e rode `normalize` sobre os 1.971 registros — **sem gravar nada**. Retorne os tempos parciais.
2. Rode contra o Supabase local e, se o projeto remoto estiver ativo, contra ele também. O local é
   otimista: não tem os limites do runtime hospedado.
3. Confira o limite de CPU vigente para o plano do projeto na documentação do Supabase e compare com a
   medição, com folga — o arquivo cresce e o limite não.

#### Resultado da medição — feita em 06/09/2026

Rodada no edge runtime local (`supabase functions serve`), sobre os 3.661.867 bytes reais do RJ, três
execuções. O limite oficial, confirmado na documentação do Supabase, é **2s de CPU por request** (I/O
assíncrono não conta) e **256 MB de memória**.

| Etapa | Mediana | Natureza |
|---|---|---|
| Buscar o arquivo | 78 ms | I/O — **não conta** |
| `sha256` do corpo | 10 ms | CPU |
| `TextDecoder` + `JSON.parse` | 38 ms | CPU |
| `normalize` dos 1.971 registros (inclui 1 `sha256` por instrumento) | **365 ms** | CPU |
| **Total de CPU** | **≈411 ms** (faixa: 398–494) | **20% do limite** |

Memória: `heapUsed` entre 13 e 17 MB, contra 256 MB disponíveis. As contagens conferem com o censo da §1.2:
1.971 instrumentos, 3.346 faixas, 7.814 verificações de histórico e 1.838 de topo — 14.969 linhas montadas.

**A hipótese se confirmou: cabe, com folga de cerca de 5×.** O `normalize` é 85% do custo, e dentro dele o
`sha256` por instrumento é o item dominante — se um dia apertar, é ali que se otimiza. O que a medição *não*
cobre é a serialização dos 14.969 registros para os `upsert` em lotes de 500 (~30 requisições): é CPU
também, mas de ordem muito menor que a folga disponível.

#### O risco que a medição encontrou no lugar do CPU

**O `fetch` do endpoint do INMETRO falhou de dentro do edge runtime local**, com
`client error (Connect): tls handshake eof`. A medição foi concluída servindo os mesmos bytes pelo Storage
local — o que não afeta o número, já que I/O não conta para o limite de CPU.

O que se apurou sobre a causa, para ninguém repetir o caminho:

- O servidor (IIS 7.5) responde **só em TLS 1.2**, e negocia por padrão `ECDHE-RSA-AES128-SHA256`, que é
  CBC — mas **também aceita** `AES128-GCM`, `AES256-GCM` e `ChaCha20-Poly1305` quando o cliente pede. Ou
  seja, **a explicação fácil "o cliente TLS do Deno não faz CBC" está descartada.**
- O mesmo endereço baixa normalmente por `curl` a partir do WSL, na mesma máquina.
- Portanto pode ser específico da rede do container local (Docker Desktop) e **não** do runtime hospedado.

**A causa está em aberto, e isso é bloqueante para a Fase 2 na Edge.** Antes de escrever a ingestão,
publique uma função mínima que só faça `fetch` no endpoint real e invoque-a **no projeto hospedado**. Se
falhar lá também, o CPU deixa de ser o critério: a busca precisa acontecer onde ela comprovadamente
funciona — o `server/` (Express), que já baixou o arquivo com sucesso.

**Regra de decisão:**

- Cabe com folga → siga a recomendação: Edge Function + `pg_cron`/`pg_net`. **Medido em 06/09: cabe.**
  Resta só provar que a Edge hospedada consegue *alcançar* o endpoint (ver acima).
- Não cabe → **o destino preferencial não é o GitHub Actions, e sim o `server/` (Express)**. Ele já existe,
  já tem a `service_role` no ambiente e já é o caminho oficial até o Postgres (§4.1). Manter a chave onde ela
  já está é o mesmo argumento de segurança que rejeitou o GitHub Actions — e aqui ele não custa um sistema
  novo. Ressalva honesta: hoje o Express não tem endereço estável de produção (é a pendência 11 do
  `PROGRESSO.md`, a mesma do `DISPATCH_PIPELINE_URL`); escolher esta rota amarra a Fase 2 à resolução dela.
- Não cabe **e** o Express não tiver onde morar → aí sim GitHub Actions, com a troca registrada no PR.

Registre o número medido no PR, qualquer que seja a escolha. Sem ele, a decisão de runtime é palpite.

### 5.2 Convenções

- Deno 2.x, consistente com as Edge Functions existentes.
- Migrations em `supabase/migrations/` com timestamp no nome.
- Datas no banco sempre `date` / `timestamptz`. Nunca guardar `DD/MM/YYYY` como texto.
- `snake_case`, em português quando o domínio é brasileiro (`numero_certificado`).
- `const UF_ALVO = 'RJ'` num único módulo compartilhado. Nenhum literal `'RJ'` espalhado pelo código.

### 5.3 Identidade do instrumento

O dataset não tem chave primária. Derive um ID determinístico:

```
instrument_id = sha256( SiglaUf | Municipio | LocalVerificacao | serie_1 | serie_2 | … )[:32]
                        (números de série únicos das faixas, ordenados lexicograficamente)
```

**Risco aceito, e que deve estar comentado no código:** se o INMETRO corrigir a grafia de
`LocalVerificacao`, o hash muda e o instrumento entra como novo. Tolerável porque o histórico vive em
`radar_verificacoes` e a busca por caso é por `numero_serie` / `numero_inmetro`, que sobrevivem à mudança
de grafia.

**Não invente uma chave "mais esperta"** com fuzzy matching na ingestão. Ambiguidade se resolve na consulta,
devolvendo todos os candidatos com status `ambiguo` — nunca escolhendo um em silêncio.

### 5.4 Mapa de resultado (implementar exatamente assim)

| `Resultado` no histórico | Interpretação |
|---|---|
| `Aprovado` | conforme |
| `Reprovado` | não conforme |
| `Pendente` | indeterminado |
| `""` ou ausente | indeterminado |
| qualquer outro valor | **indeterminado** (nunca "não conforme") |

`UltimoResultado` no topo do registro admite ainda `Reparado`, e é classificado pela **mesma tabela acima**
(logo `Reparado` → indeterminado, nunca "não conforme").

Sobre o alcance do par do topo, a regra é geométrica e não precisa de julgamento:

- **Dentro** da janela `[DataUltimaVerificacao, DataValidade]`, o par é prova direta de vigência e deve ser
  usado como qualquer outra verificação — é o que corrige os 297 casos da §1.4.11.
- **Fora** dessa janela, o par não diz nada sobre a data consultada. `UltimoResultado` descreve o estado
  *atual* do equipamento e **não julga uma data passada** — ali serve apenas para exibição.

Como o par do topo não traz número de certificado, um resultado com `origem: "topo"` sai com `numero: null` e
o aviso *"a base pública informa a verificação, mas não o número do certificado"*. A peça pode afirmar a
vigência; não pode citar um número que não existe na fonte.

---

## 6. Fases

### Fase 0 — Reconhecimento e baseline

**Entregável:** nada em produção; um comentário no PR com os achados.

1. Rodar o bloco de comandos da §4.2.
2. Baixar o RJ e commitar `tests/fixtures/medidores_RJ.json` com **20 registros escolhidos a dedo**, que
   cubram obrigatoriamente: o registro do §1.3 (histórico fora de ordem), um `Historico: []`, um
   `UltimoResultado: "Reparado"`, um `Resultado: "Reprovado"`, um `VelocidadeNominal: "0"`, o registro sem
   `Faixas`, um com `TipoServico: ""`, **um dos 297 com `Historico: []` e par do topo válido e vigente
   (§1.4.11)**, e **um dos 119 com histórico e `DataValidade` vazia no topo (§1.4.12)**. O arquivo íntegro
   fica fora do git.
3. Rodar `npm test` / `npm run lint` / `npm run build` e registrar o estado verde/vermelho **antes** de
   qualquer mudança sua. Se já estiver vermelho, diga no PR — não conserte junto.

**Critério de aceite:** schema real documentado no PR; fixture commitado cobrindo os sete casos; baseline registrado.

---

### Fase 0.5 — Calibração (BLOQUEANTE — não pule)

**O que a §2 exige que se responda antes de gerar qualquer tese jurídica.**

1. Separe 8 a 10 casos reais de excesso de velocidade no RJ já existentes em `form_submissions`, cujas
   notificações estejam disponíveis.
2. Para cada um, obtenha o número do certificado de verificação informado na notificação (ou o número de
   série do medidor) e verifique **manualmente**:
   - se o instrumento aparece no JSON do RJ;
   - se o certificado daquela data aparece no `Historico`;
   - cruzando, quando houver código de validação/QR (certificados a partir de abr/2022), com
     `https://servicos.rbmlq.gov.br/Certificado` — **consulta manual, uma a uma, sem automação**.
3. Registre a tabela de resultados em `docs/verificacao-radar-calibracao.md`.

**O que a resposta decide:**

- Se os certificados das notificações **aparecem** no dataset → as lacunas da §2.1 são reais e a tese de
  ausência de verificação é forte. A redação pode ser mais assertiva (ainda assim: pedido de exibição, não
  afirmação categórica).
- Se os certificados **não aparecem** → o dataset é incompleto, `nao_comprovado` significa apenas
  "não consta na base pública", e a feature vira **auxiliar de triagem**, não geradora de tese. Nesse
  cenário, reduza o escopo: entregue as Fases 1–3 e 6, e **não** conecte à IA jurídica (Fase 5.4).

**Critério de aceite:** documento de calibração escrito, com decisão explícita entre os dois cenários,
assinada pelo Klaus no PR. Sem isso, a Fase 5 não sobe.

---

### Fase 1 — Schema

**Arquivo:** `supabase/migrations/<timestamp>_radar_inmetro_rj.sql`

- `radar_snapshots` — `id uuid pk`, `uf char(2) not null default 'RJ'`, `fetched_at timestamptz`,
  `source_url text`, `last_modified text`, `sha256 text`, `storage_path text`, `bytes int`,
  `record_count int`, **`unique (uf, sha256)`** ← é isso que torna a ingestão idempotente.
- `radar_instruments` — `id text pk` (§5.3), `uf`, `municipio`, `local_via`,
  `local_via_norm` (gerada: `upper(unaccent(local_via))`), `tipo_medidor`, `proprietario`,
  `data_ultima_verificacao date`, `data_validade date`, `ultimo_resultado text`,
  `snapshot_id uuid fk`, `updated_at timestamptz`.
- `radar_faixas` — `instrument_id fk on delete cascade`, `numero_faixa`, `numero_inmetro`, `numero_serie`,
  `sentido`, `velocidade_nominal int null`, `pk (instrument_id, numero_faixa, sentido)`.
- `radar_verificacoes` — `instrument_id fk on delete cascade`,
  **`origem text not null check (origem in ('historico','topo'))`**,
  `numero_certificado text not null default ''` (vazio quando `origem = 'topo'` — o par do topo não traz
  número), `numero_ensaio text`, `ano int`, `data_laudo date not null`, `data_validade date not null`,
  `tipo_servico text`, `resultado text`,
  `pk (instrument_id, origem, numero_certificado, data_laudo)`.

  A coluna `origem` é o que faz o par do topo (§1.4.11) virar prova consultável sem se confundir com o
  histórico. Note que `numero_certificado` entra no PK como `''` para a origem `topo`: um instrumento tem no
  máximo um par do topo, e a data de laudo o distingue.
- `radar_consultas_log` — `id uuid pk`, **`case_id text not null references form_submissions(case_id)`**,
  `consultado_em timestamptz`, `entrada jsonb`, `resultado jsonb`, `status text`, `confianca text`,
  `metodo_match text`, `revisado_por text null`, `revisado_em timestamptz null`, **`unique (case_id)`**.

  A versão anterior previa `submission_id`. A identidade do pedido neste sistema é o **`case_id`**
  (`CASO_<uuid>`, `text unique` em `form_submissions`), e é por ele que todas as tabelas se amarram — ver
  §4.4. Usar um uuid de submissão aqui quebraria a única convenção que atravessa os quatro runtimes.

Extensões: `pg_trgm`, `unaccent`.

Índices:
```sql
create index on radar_faixas (numero_serie);
create index on radar_faixas (numero_inmetro);
create index on radar_instruments (municipio);
create index on radar_instruments using gin (local_via_norm gin_trgm_ops);
create index on radar_verificacoes (data_laudo, data_validade);
```

**RLS:** obrigatória em todas. As quatro tabelas `radar_*` de dados são públicas por natureza (CC0) mas
somente-leitura para `anon`, escrita só por `service_role`. `radar_consultas_log` contém dados de caso:
**nenhum acesso para `anon`**. Escreva as policies explicitamente.

**Storage: bucket privado `evidencias` — criado *pela migration*, não pelo Dashboard.**

```sql
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;
```

…seguido das policies de `storage.objects` restringindo leitura e escrita à `service_role`.

Isto não é preciosismo: o bucket `generated-recursos` do fluxo principal é criado à mão no Dashboard, e por
isso **toda stack recriada do zero quebra no primeiro upload com `Bucket not found`** — aconteceu em três
sessões seguidas (pendência 14 do `PROGRESSO.md`). Não repita o padrão numa feature nova. Se esta migration
funcionar, ela é o molde para consertar o `generated-recursos` depois — **mas não o conserte nesta branch**,
que é escopo alheio.

**Política de retenção dos snapshots (decidir antes de ligar o cron).**

O arquivo do RJ tem 3,66 MB e é regenerado quase todo dia. O `unique (uf, sha256)` da Fase 1 só evita gravar
o **mesmo** arquivo duas vezes; como o conteúdo muda, ele quase nunca vai economizar. Guardar tudo custa
**~1,35 GB por ano**, contra 1 GB do free tier do Supabase: o bucket estoura em torno de nove meses e a
ingestão passa a falhar por falta de espaço.

Política proposta — ajuste o prazo, não a estrutura:

- **Últimos 90 dias:** todos os snapshots.
- **Mais antigos que 90 dias:** manter apenas o primeiro snapshot de cada mês; apagar o resto do Storage.
- **Nunca apagar** um snapshot referenciado por alguma linha de `radar_consultas_log` — isto é, cujo
  `snapshot_id` apareça em `resultado -> 'evidencia' ->> 'snapshot_id'`. **É a prova que sustenta uma peça já
  protocolada**, e a regra 5 da §3 exige que ela persista. A retenção precisa desta exceção
  explícita, com teste.
- A linha em `radar_snapshots` **nunca** é apagada — ela é metadado, custa bytes, e é o que permite auditar
  a série histórica. Ao podar o arquivo, marque `storage_path = null` e grave `pruned_at timestamptz`.

Acrescente `pruned_at timestamptz null` a `radar_snapshots` já nesta migration, para não precisar de uma
segunda depois.

Ao fim: `supabase gen types typescript --linked > src/integrations/supabase/types.ts` (conserta a dessincronia
apontada na §4.4 de quebra).

**Critério de aceite:** `supabase db push` limpo; `supabase db reset` reconstrói do zero **incluindo o
bucket `evidencias`**; `npm run build` verde.

---

### Fase 2 — Ingestão

**Arquivos:**
- `supabase/functions/ingest-radares-rj/index.ts` — entrypoint (verifica shared secret, orquestra)
- `supabase/functions/_shared/psie.ts` — parsing **puro, sem I/O** (é o que será testado)
- `supabase/migrations/<timestamp>_cron_ingest_radares.sql` — `pg_cron` + `pg_net`

`_shared/psie.ts` exporta:

```ts
export const UF_ALVO = 'RJ'
export function parseBrDate(s?: string | null): string | null    // "12/07/2024" -> "2024-07-12"
export function parseIntOrNull(s?: string | null): number | null  // "0" -> null para VelocidadeNominal
export function classificarResultado(r?: string): 'conforme' | 'nao_conforme' | 'indeterminado'
export function instrumentId(r: PsieRecord): Promise<string>
export function normalize(r: PsieRecord, snapshotId: string): {
  instrument: InstrumentRow; faixas: FaixaRow[]; verificacoes: VerificacaoRow[];
}
// `verificacoes` inclui as entradas do `Historico` (origem 'historico') E, quando
// `DataUltimaVerificacao` e `DataValidade` forem ambas parseáveis, uma linha adicional
// com origem 'topo', numero_certificado '' e resultado = UltimoResultado. Ver §1.4.11.
```

Fluxo do entrypoint:

1. Conferir o shared secret do header. Sem ele, `401`.
2. `GET` no endpoint do RJ com `User-Agent: amorecorrer.com/1.0 (+contato@amorecorrer.com)`.
3. `sha256` do corpo. Se `(RJ, sha256)` já existe em `radar_snapshots` → **pular para o passo 7** e
   encerrar com `{status:"inalterado"}`. Re-execuções ficam gratuitas — mas a poda ainda roda, senão uma
   fonte parada por muitos dias (§1.1) deixaria a retenção sem executar.
4. Upload do bruto para `evidencias/radares/RJ/{YYYY-MM-DD}-{sha[:12]}.json`.
5. `insert` em `radar_snapshots` → `snapshot_id`.
6. Normalizar e `upsert` em lotes de 500. `radar_verificacoes` com `ignoreDuplicates: true` (histórico é imutável).
7. **Poda**, conforme a política de retenção da Fase 1: apagar do Storage os snapshots fora da janela que
   **não** estejam referenciados em `radar_consultas_log`, marcando `storage_path = null` e `pruned_at`.
   Este passo roda em `try/catch` e **nunca aborta a ingestão** — falha de limpeza não pode custar o dado do
   dia. Logue o que foi apagado.
8. Retornar `{status, records, faixas, verificacoes, bytes, ms, pruned}` e logar.

A poda mora aqui, e não numa função separada, para não precisar de um segundo `cron` e um segundo shared
secret. O preço é a disciplina do `try/catch`: a ordem dos passos importa, e nada depois do passo 6 pode
derrubar o que já foi gravado.

**Sanidade antes de gravar** (aborta sem persistir nada se falhar):
- `records >= 1500` (o RJ tem 1.971; queda abaixo disso indica arquivo truncado na origem);
- o corpo parseia como array;
- pelo menos 80% dos registros têm ao menos uma faixa.

**Testes `deno test` (`supabase/functions/_shared/psie_test.ts`):**
- `parseBrDate("12/07/2024") === "2024-07-12"`. Inclua **`"13/01/2026"`** (dia > 12: prova que não está
  lendo MM/DD) e entradas inválidas (`""`, `null`, `"2026-08-04"`, `"31/02/2026"`).
- `classificarResultado`: `Aprovado`→conforme; `Reprovado`→nao_conforme; `Pendente`,`""`,`undefined`,
  `"Reparado"`, `"XYZ"`→indeterminado. **Nenhuma entrada desconhecida pode virar `nao_conforme`.**
- `instrumentId` estável entre chamadas e **invariante à ordem do array `Faixas`**.
- `normalize` sobre o fixture do RJ: histórico devolvido **ordenado por `data_laudo`**;
  `velocidade_nominal` `"0"` → `null`; registro sem `Faixas` e sem `Historico` não quebram.
- `normalize` e o par do topo: registro com `Historico: []` e par válido devolve **exatamente uma**
  verificação, com `origem: 'topo'` e `numero_certificado: ''`; registro com histórico devolve
  `historico.length + 1` verificações — a do topo é redundante em 1.659 de 1.660 casos, mas como `origem`
  entra no PK as duas linhas coexistem por construção, e a Fase 3 sabe preferir a do histórico; registro com
  `DataValidade: ""` no topo devolve **nenhuma** linha de origem `topo`.

**Teste de integração** (`supabase start`): rodar a ingestão duas vezes sobre o mesmo fixture → a segunda
insere **zero** linhas em `radar_snapshots`.

**Teste da retenção**, com snapshots forjados em datas antigas:
- snapshot fora da janela e sem referência → arquivo apagado, linha mantida, `pruned_at` preenchido;
- snapshot fora da janela **referenciado** por uma linha de `radar_consultas_log` → **arquivo preservado**;
- snapshot dentro da janela → intocado;
- exceção forçada na poda → a ingestão do dia ainda retorna sucesso.

**Critério de aceite:** testes verdes; invocação manual popula o banco local com ~1.971 instrumentos e
**~9.652 verificações — 7.814 de origem `historico` e ~1.838 de origem `topo`**; segunda invocação é no-op;
cron agendado e visível em `cron.job`.

---

### Fase 3 — Consulta

**Arquivo:** `supabase/migrations/<timestamp>_fn_verificar_medidor.sql`

```
verificar_medidor(
  p_numero_serie text, p_numero_inmetro text, p_data_infracao date,
  p_municipio text default null, p_local text default null
)
```

Match em cascata, **parando no primeiro que der resultado**:

| Ordem | Critério | `metodo_match` | `confianca` |
|---|---|---|---|
| 1 | `radar_faixas.numero_serie` exato | `numero_serie` | `alta` |
| 2 | `radar_faixas.numero_inmetro` exato | `numero_inmetro` | `alta` |
| 3 | `municipio` + `similarity(local_via_norm, unaccent(upper(p_local))) > 0.45` | `local_municipio` | **`baixa` sempre** |
| — | nada | `nenhum` | — |

Resolução de status:

- nenhum candidato → **`sem_registro`**
- mais de um instrumento distinto → **`ambiguo`** (retornar **todos**, nunca escolher)
- existe verificação — **de qualquer `origem`** — com `data_laudo <= p_data_infracao <= data_validade`:
  - havendo mais de uma, escolher a de `origem = 'historico'` (é a única que traz número de certificado);
    persistindo empate, a de `data_laudo` mais recente;
  - `classificar(resultado) = 'conforme'` → **`comprovado_valido`**
  - `= 'nao_conforme'` → **`reprovado`**
  - `= 'indeterminado'` → **`nao_comprovado`**
- instrumento existe, tem alguma verificação (histórico **ou** topo), mas nenhuma cobre a data →
  **`nao_comprovado`**
- instrumento existe e **não tem verificação alguma** — `Historico` vazio *e* par do topo inválido →
  **`sem_registro`**. Atenção: são os **14** instrumentos da §1.2, não os 311. Consultar apenas o
  `Historico` aqui produziria `sem_registro` para 297 instrumentos que têm verificação documentada, 225
  deles vigentes hoje — o erro que a §1.4.11 mede.

Sempre devolver, em `certificados_proximos`, o certificado imediatamente anterior e o imediatamente
posterior à data — é o que permite ao revisor humano ver o tamanho da lacuna.

Rebaixar `confianca` para `baixa` e anexar aviso quando: `metodo_match = 'local_municipio'`;
ou `status = 'nao_comprovado'` (aviso: *"ausência de certificado na base pública não comprova ausência de
verificação"*).

`security definer`, `search_path = public`, acessível apenas a `service_role`.

**Testes SQL** (`supabase/tests/`), com seed derivado do instrumento real do §1.3
(laudos 20/12/2021, 03/01/2023, 12/07/2024, 01/10/2025, cada um com 12 meses de validade):

| Data da infração | Esperado | Por quê |
|---|---|---|
| `2024-07-12` | `comprovado_valido` | borda inferior inclusiva |
| `2025-07-11` | `comprovado_valido` | borda superior inclusiva |
| `2025-07-12` | `nao_comprovado` | 1 dia após vencer, antes do laudo de out/2025 |
| `2024-03-01` | `nao_comprovado` | dentro da lacuna jan/2024 → jul/2024 |
| `2022-06-01` | `comprovado_valido` | certificado de dez/2021 |
| `2010-01-01` | `nao_comprovado` | anterior a todo o histórico |
| série inexistente | `sem_registro` | — |
| duas séries iguais em instrumentos distintos | `ambiguo` | as 2 colisões reais do RJ |
| `Historico: []` + par do topo cobrindo a data | `comprovado_valido`, `origem: topo`, `numero: null` | os 297 casos — **o teste que a versão anterior errava** |
| `Historico: []` + par do topo **não** cobrindo a data | `nao_comprovado` | par existe, mas não prova a data |
| `Historico: []` + par do topo cobrindo, `UltimoResultado: "Reparado"` | `nao_comprovado` | `Reparado` é indeterminado, nunca `reprovado` |
| `Historico: []` + `DataValidade: ""` no topo | `sem_registro` | os 14 casos reais |
| histórico **e** topo cobrindo a mesma data | `comprovado_valido` com `origem: historico` | preferir quem tem número de certificado |
| verificação com `Resultado: "Pendente"` cobrindo a data | `nao_comprovado` | nunca `reprovado` |

**Critério de aceite:** todas as linhas acima passando. As bordas de data, o caso `Pendente` e as quatro
linhas de `Historico: []` são o que mais quebra aqui.

---

### Fase 4 — Captura dos dados do medidor

Sem número de série, todo caso cai no fallback fraco da §2.3. Esta fase é o que faz a feature valer.

1. `src/pages/Form.tsx` — nova seção **"Dados do medidor de velocidade (se constarem na notificação)"**,
   exibida quando `descricaoInfracao`/`amparoLegal` indicarem excesso de velocidade (heurística por
   palavra-chave) **ou** quando o usuário marcar o checkbox "minha multa é de velocidade". Campos novos,
   **todos opcionais**:
   - `medidor_numero_serie`
   - `medidor_numero_inmetro`
   - `medidor_numero_certificado`

   **Só estes três são novos.** A versão anterior desta fase pedia também `velocidadeAferida`,
   `velocidadeConsiderada` e `velocidadeRegulamentada`: `velocidade_permitida` e `velocidade_aferida` **já
   existem** no formulário, em `form-submit` e na tabela (§4.3), e duplicá-las em camelCase criaria dois
   campos para o mesmo dado. Nomes em `snake_case`, seguindo a convenção recente do arquivo (§4.3).

   Microcopy dizendo **onde encontrar** cada um na notificação, e deixando claro que ficar em branco não
   impede o envio. Reutilize `form-input` / `form-label`; não introduza biblioteca de formulário nova.

2. Migration `alter table form_submissions add column …`, em `snake_case`.

3. Normalização em `normalizeData`: `trim` + `toUpperCase` + remover espaços internos.
   **Não remova hífens** sem antes conferir amostras reais — no RJ os números de série vão de `"2000065"`
   (só dígitos) a formatos alfanuméricos de fabricante.

**Critério de aceite:** envio funciona com os campos vazios (sem regressão) e preenchidos; valores chegam
normalizados ao banco; build e lint verdes.

---

### Fase 5 — Integração no fluxo

> **Fase reescrita em 03/09/2026.** A versão anterior integrava com n8n, que não existe mais (§4). O
> transporte ficou **mais simples**; o trabalho real migrou para o prompt da IA.

**Arquivos:** `supabase/migrations/<timestamp>_verificacao_medidor.sql`,
`supabase/functions/form-submit/index.ts` (estender, não reescrever), `pipeline/worker.py`.

**5.1 — A coluna**

```sql
alter table form_submissions add column verificacao_medidor jsonb;
```

Guarda o objeto da §0 íntegro. Não normalize em colunas: o consumidor é um prompt, e a auditoria consultável
vive em `radar_consultas_log`.

**5.2 — Em `form-submit`**, entre o `upsert` (`index.ts:366`) e o bloco `attempt_dispatch` (`:384`)

1. Não é infração de velocidade → `status: "nao_aplicavel"`, seguir normal.
2. Derivar `p_data_infracao` de `dataHora`; `municipio`/`local` de `localSentido`. Parsing conservador: se
   não der para extrair o município com confiança, passe `null` em vez de chutar. **Não** derive UF — é
   sempre RJ.
3. Chamar a RPC `verificar_medidor`.
4. Gravar o resultado em `form_submissions.verificacao_medidor` **e** em `radar_consultas_log`
   (upsert por `case_id`).

**Não existe passo 5.** A propagação é grátis: `GET /internal/cases/:caseId` faz `select("*")`
(`server/src/index.ts:164`), então a coluna chega ao worker dentro de `agg["case"]` sem código de transporte.
Era isto que a versão anterior gastava uma etapa inteira montando como "payload do n8n".

**A ordem importa:** a escrita precisa acontecer *antes* de `attempt_dispatch`, senão abre-se uma janela em
que o pipeline lê o caso sem a verificação. Se o caso já estiver `completed`/`failed`, `form-submit` retorna
cedo (`:286`) e a verificação não roda — está certo assim.

**5.3 — No pipeline**, duas mudanças em `pipeline/worker.py`

1. **`build_case_context` (`:141`)** faz hoje `f"{k}: {v}"` sobre tudo que não for nulo. Um `jsonb` cairia
   no prompt como um dict Python cru — ilegível para o modelo e um convite a alucinar campos. Trate a chave
   à parte: remova-a do laço genérico e renderize um bloco explícito em português, com status, confiança,
   método de match, datas e número do certificado (quando houver) e os avisos. Cuidado com o `lines[:200]`:
   o bloco novo entra **antes** do truncamento, não depois.
2. **`call_deepseek` (`:107`)** — o *system prompt* é genérico hoje. As regras da §5.4 entram aqui.

**5.4 — Regras de redação por status.** Só conectar se a Fase 0.5 tiver concluído pelo cenário favorável;
até lá, a coluna é gravada e auditada, mas **não** entra no prompt.

- `comprovado_valido` → **não levantar tese metrológica.** Informar internamente que o argumento está
  descartado; é uma economia, não uma perda.
- `reprovado` → tese forte, citando número do certificado, data do laudo e resultado.
- `nao_comprovado` → **pedido de exibição**: requerer que o órgão junte aos autos o certificado de
  verificação vigente na data da infração, informando que a consulta à base pública do INMETRO não
  localizou certificado cobrindo aquela data. **Jamais** afirmar que o radar estava sem verificação.
- `sem_registro`, `ambiguo`, ou `confianca: baixa` → mesma redação de `nao_comprovado`, sem citar
  números de certificado.
- `comprovado_valido` com `origem: "topo"` → a vigência pode ser afirmada, mas **sem citar número de
  certificado**, que a base não fornece nesse caso — ver §5.4 (mapa de resultado) e §1.4.11.

**Não-funcionais:**

- A verificação **nunca pode derrubar o envio**. `try/catch` com timeout de 3s; em qualquer falha, logue,
  siga com `status: "nao_aplicavel"` e `avisos: ["verificação indisponível"]`. O cliente pagou pela peça,
  não pela verificação.
- Idempotência: reenvio da mesma submissão não duplica linha em `radar_consultas_log` (chave: `case_id`).
- **Não tocar** no bloco `attempt_dispatch`: as duas assinaturas conviventes (`case_id` e `p_case_id`) são
  dívida técnica conhecida e frágil, e os callers de `form-submit` e `stripe-webhook` as tentam em ordem
  oposta. **Não tocar** no contrato do 202 (§4.1).
- O `dup_guard` (SHA-256 do payload do formulário) não inclui os campos do medidor. Se a Fase 4 os
  acrescentar ao hash, um reenvio que só corrija o número de série passa a ser tratado como submissão nova;
  se não acrescentar, essa correção é silenciosamente ignorada. **Decida explicitamente e registre no PR.**

**Critério de aceite:** teste cobrindo os seis status; teste provando que uma exceção na verificação ainda
devolve `200` com o dispatch disparado; e um caso ponta a ponta com os cinco processos locais no ar,
conferindo no log do worker que o bloco de verificação aparece no `text_context` enviado à DeepSeek.

---

### Fase 6 — Observabilidade e revisão humana

1. **Alerta de ingestão:** notificar se `record_count` cair mais de 20% em relação ao snapshot anterior
   (isso é problema seu ou corrupção na origem — investigar sempre).

   Sobre o alerta de frescor: a §1.1 diz que a fonte **não** regenera de forma confiável — em 03/09/2026 o
   arquivo estava três dias parado. Um alerta de ">48h sem snapshot novo" vai tocar por conta do INMETRO, não
   do seu pipeline, e alerta que toca por motivo alheio é alerta que se aprende a ignorar. Separe os dois:
   **falha de execução** (a função não rodou, ou rodou e deu erro) é alerta de verdade; **fonte parada**
   (executou, mas o `sha256` não mudou) é métrica, com limiar folgado — sugestão: 7 dias — e nunca
   bloqueante. O `unique (uf, sha256)` da Fase 1 já distingue os dois casos sem código extra.
2. **Fila de revisão:** view `radar_revisao_pendente` — casos com `confianca` em (`baixa`,`media`) ou
   `status` em (`ambiguo`,`sem_registro`,`nao_comprovado`) e `revisado_em is null`. Interface é o Supabase
   Studio nesta fase; **não construa painel agora**.
3. **Métricas que decidem o roadmap**, medidas mensalmente:
   - distribuição de `metodo_match` — se `numero_serie` responder por menos de ~30% dos casos, a feature é
     assistida, não automática;
   - distribuição de `status` — se `nao_comprovado` passar de 60%, revisite a §2 antes de continuar gerando
     tese;
   - taxa de deferimento dos recursos que usaram cada tese, quando o dado retornar do cliente. É a única
     métrica que diz se a feature funciona de verdade.

---

### Fase 7 — OCR (fora desta branch)

Só depois das Fases 0–6 em produção e da métrica 6.3 medida. Extrair `medidorNumeroSerie`,
`medidorNumeroInmetro`, `dataHora`, `localSentido` e velocidades da imagem/PDF da notificação, preenchendo
o formulário como **sugestão editável** — nunca gravando direto. Abrir issue, não implementar agora.

---

## 7. Riscos e decisões pendentes do Klaus

| # | Risco / decisão | Impacto | Encaminhamento |
|---|---|---|---|
| 1 | 55–67% dos instrumentos do RJ sem prova de vigência (medição corrigida, §2.1) | Define se a feature gera tese ou só tria | **Fase 0.5, bloqueante** — mas a §2.2 já mostra que a base omite verificações, o que torna o cenário conservador o mais provável |
| 1b | O `Historico` está comprovadamente incompleto: 297 instrumentos com verificação no topo e array vazio | Se a omissão também atinge instrumentos *com* histórico, as lacunas da §2.1 são artefato | Medir na Fase 0.5: os certificados das notificações reais aparecem no array, no topo, ou em lugar nenhum? |
| 2 | Quantas notificações do RJ realmente trazem o nº de série | Define se é automática ou assistida | Medir nos casos já em `form_submissions` **antes** da Fase 4 |
| 3 | Dispositivo do CONTRAN que obriga indicar o medidor na notificação | Usado como argumento na peça | **Não confirmado.** Verificar a redação vigente antes de citar em texto gerado |
| 4 | `LocalVerificacao` abreviado vs. endereço da notificação | Fallback por endereço é fraco | Já tratado: `local_municipio` nunca gera tese |
| 5 | ~~Credenciais n8n no bundle~~ | — | **Não se aplica mais**: o n8n saiu da arquitetura e `grep -rn "n8n" src/` não retorna nada (verificado em 03/09/2026) |
| 6 | Snapshot só contém instrumentos hoje cadastrados | Radar removido do RJ pode sumir da base | Snapshots diários versionados mitigam daqui para frente; o passado não se recupera |
| 7 | Snapshot diário custa ~1,35 GB/ano contra 1 GB de free tier | Bucket estoura em ~9 meses e a ingestão passa a falhar | Política de retenção na Fase 1. **O prazo (proposta: 90 dias + 1 por mês) é decisão do Klaus** — é um trade-off entre custo de storage e profundidade da prova histórica |
| 8 | A ingestão pode não caber no limite de CPU de uma Edge Function | Define se a Fase 2 vive na Edge, no Express ou no GitHub Actions | **Medir antes de escrever a Fase 2** (§5.1.1). A rota do Express herda a pendência 11 do `PROGRESSO.md` |

---

## 8. Definição de pronto

- [ ] `supabase db reset` reconstrói todo o schema do zero sem erro.
- [ ] `deno test` verde em `_shared/`; testes SQL verdes; `npm run build` e `npm run lint` verdes.
- [ ] Ingestão executada com sucesso ao menos duas vezes, a segunda sendo no-op; `cron.job` populado.
- [ ] Banco com ~1.971 instrumentos e ~9.652 verificações do RJ (~7.814 `historico` + ~1.838 `topo`).
- [ ] `docs/verificacao-radar-calibracao.md` escrito, com a decisão da Fase 0.5 explícita.
- [ ] Instrumento com `Historico: []` e par do topo vigente retorna `comprovado_valido`, não `sem_registro`
      (§1.4.11 — a regressão mais provável desta feature).
- [ ] RLS habilitada nas cinco tabelas; `radar_consultas_log` inacessível a `anon`.
- [ ] Bucket `evidencias` criado por migration — `supabase db reset` o recria sozinho, sem passo de Dashboard.
- [ ] Política de retenção implementada e testada, **incluindo a exceção que preserva snapshot citado como
      evidência em `radar_consultas_log`**.
- [ ] Tempo de CPU da ingestão medido e registrado no PR, com a decisão de runtime justificada nele (§5.1.1).
- [ ] Nenhum segredo novo em `VITE_*`; `SUPABASE_SERVICE_ROLE_KEY` não saiu do Supabase.
- [ ] Caso real ponta a ponta: formulário → `form-submit` → RPC → `form_submissions.verificacao_medidor` →
      `GET /internal/cases/:id` → bloco de verificação visível no prompt da DeepSeek, com
      `evidencia.sha256` preenchido.
- [ ] Falha simulada da verificação não impede o envio do formulário.
- [ ] `docs/verificacao-radar.md`: como rodar a ingestão manualmente, o que cada status significa, e o
      texto exato dos avisos legais.
- [ ] PR com os achados da Fase 0 e as divergências em relação a este plano.

---

## 9. Ordem de commits sugerida

```
1. chore(radar): fixture RJ (20 registros, 7 casos-limite) + baseline     [Fase 0]
2. docs(radar): calibração da base do INMETRO no RJ                       [Fase 0.5]
3. feat(radar): schema, RLS e bucket de evidências                        [Fase 1]
4. feat(radar): ingestão diária do RJ via edge function + pg_cron         [Fase 2]
5. feat(radar): RPC verificar_medidor + testes de borda                   [Fase 3]
6. feat(form): campos do medidor de velocidade                            [Fase 4]
7. feat(radar): verificação em form-submit + prompt da IA no pipeline     [Fase 5]
8. feat(radar): alertas de ingestão e view de revisão                     [Fase 6]
9. docs(radar): manual de operação e interpretação                        [DoD]
```

---

## Apêndice — Fontes

- Endpoint RJ: `https://servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json`
- Catálogo: https://dados.gov.br/dados/conjuntos-dados/portal-de-servicos-do-inmetro-nos-estados-psie
- Metadados oficiais (PDF): `https://servicos.rbmlq.gov.br/dados-abertos/metadados_medidores_velocidade.pdf`
- Consulta interativa (referência humana, **não automatizar**): https://servicos.rbmlq.gov.br/Instrumento
- Validação de certificado por código/QR (uso manual, Fase 0.5): https://servicos.rbmlq.gov.br/Certificado
- FAQ INMETRO: https://www.gov.br/inmetro/pt-br/acesso-a-informacao/perguntas-frequentes/metrologia-legal/medidor-de-velocidade-radar/como-saber-se-determinado-radar-esta-verificado

*Censo do arquivo do RJ e medições da §2.1 realizados em 2026-09-01; refeitos e corrigidos em 2026-09-03
sobre o mesmo arquivo (3.661.867 bytes, `Last-Modified: Tue, 01 Sep 2026 00:12:26 GMT`,
sha256 `4dcb3d35ee37cd60122d660319b00be215a49759b0f371cd59f4a6fde648fb9b`). O censo da §1.2 reproduziu-se
integralmente; a correção incide sobre o tratamento do par do topo (§1.4.11) e o que dele decorre em §2.1,
§2.2, §5.4 e nas Fases 0 a 3.*
