# Carga manual dos radares do RJ — Design

*Escrito em 22/09/2026. Decidido em conversa com o Klaus na mesma data.*

## 1. O problema, e por que este desenho existe

A feature de verificação do medidor (`PLANO-verificacao-radar-inmetro.md`) está com as Fases 0, 1 e 3
entregues e **inertes**: as cinco tabelas `radar_*` existem em produção com **0 linhas**, e a RPC
`verificar_medidor` — 24 testes pgTAP passando — nunca viu um dado real.

O que trava é a Fase 2, e a causa foi medida em 06/09/2026: **`servicos.rbmlq.gov.br` recusa o IP de saída
da Supabase**, com erro de TCP antes de qualquer handshake TLS, enquanto `dados.gov.br` e `www.gov.br`
respondem em milissegundos da mesma Edge Function. Não é distância nem rota: é allowlist ou recusa de ASN
de nuvem no firewall do RBMLQ. Isso é a **pendência 21** do `PROGRESSO.md`, e derruba junto o GitHub
Actions (IPs da Azure) e qualquer runtime hospedado não testado.

A §5.1.2 do plano já tinha deixado duas saídas escritas, sem escolher entre elas:

> (a) rodar a ingestão numa máquina em rede aceita — **inclusive a do próprio Klaus**, agendada —, ou
> (b) um proxy de saída em rede aceita, com o runtime na nuvem só consumindo.

**Este documento escolhe a (a), na sua forma mais simples: uma carga manual, disparada por comando, da
máquina do Klaus.** Verificado em 21/09/2026: um `GET` ao arquivo do RJ a partir do WSL responde `200` com
os 3.661.867 bytes. A rede dele é aceita.

Não é contorno do plano. É uma das duas opções que o plano deixou explicitamente em aberto.

## 2. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Formato da fonte | **JSON**, não XML | Todo o censo da §1.2, o fixture de 23 casos-limite, o achado dos 297 instrumentos da §1.4.11 e os 24 testes pgTAP foram construídos sobre a estrutura do JSON. O XML serve o mesmo dado e obrigaria a refazer essa verificação inteira por zero ganho. |
| Ambição | **Carga única, manual** | Decisão do Klaus. A fonte está congelada desde 01/09 (21 dias, bytes idênticos) — recorrência tem pouco a atualizar hoje. |
| Runtime | **Node 22, sem ferramenta nova** | Deno não está instalado no WSL, e a convenção "Deno 2.x" do plano existia para servir uma Edge Function que a §5.1.2 descartou. Verificado em 22/09: o Node 22.23.2 da máquina **faz type-stripping nativo**, roda `node --test` sobre `.ts` e importa `@supabase/supabase-js` normalmente — `tsx` era desnecessário e saiu. |
| Alvo | **Produção, com `--dry-run` antes** | A stack local está desligada e subi-la sob WSL é custoso (armadilha documentada no `CLAUDE.md`). As tabelas `radar_*` em produção estão zeradas e sem consumidor: um erro aqui não afeta cliente nenhum. |
| Escopo | **Fase 2 sem `pg_cron` e sem poda** | A poda depende da pendência 19 (prazo de retenção), ainda não decidida. O agendamento foi dispensado pela decisão de carga única. |

**Escopo negativo, explícito.** Não entram: `pg_cron`/`pg_net`, poda de retenção, agendamento na máquina do
Klaus, qualquer UF que não seja RJ, e qualquer alteração em `src/`, `server/`, `pipeline/`, nas Edge
Functions ou no schema. Nenhuma migration nova.

### 2.1 O risco que a carga única aceita

Prova que envelhece sem ninguém notar. Fica **mitigado por construção, não por vigilância**: o contrato de
saída da Fase 3 carrega `evidencia.capturado_em` e o snapshot guarda `last_modified`, então toda peça sai
com a data da captura que a sustenta. Não elimina o risco — torna-o visível no próprio documento gerado.

## 3. Arquitetura

```
   Máquina do Klaus (rede aceita pelo RBMLQ)
        │
        │  npx tsx scripts/ingest-radares-rj.ts
        │
        ├── GET servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json   (3,66 MB, 1 requisição)
        │
        ├──> Storage (bucket privado `evidencias`)
        │      radares/RJ/{YYYY-MM-DD}-{sha12}.json          ← a prova arquivada
        │
        └──> Postgres (produção)
               radar_snapshots → radar_instruments → radar_faixas
                                                   → radar_verificacoes
                                       │
                                       │  RPC verificar_medidor()  (já existe, Fase 3)
                                       v
                              resultado com evidência auditável
```

### 3.1 Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/lib/psie.ts` | criar | Núcleo puro: parsing e normalização. **Zero I/O.** |
| `scripts/lib/psie.test.ts` | criar | Testes do núcleo, via `node --test` (sem runner externo). |
| `scripts/ingest-radares-rj.ts` | criar | Entrypoint: CLI, rede, Storage, banco. A casca descartável. |
| `package.json` | editar | Apenas dois scripts npm: `radar:ingest` e `radar:test`. **Nenhuma dependência nova.** |

A divisão existe por um motivo operacional: **tudo o que erra em silêncio mora no núcleo puro** — uma data
lida como `MM/DD`, um `Reprovado` classificado como conforme —, e núcleo puro é o que se testa sem subir
infraestrutura. O entrypoint concentra o I/O e é o único arquivo que muda se a ingestão migrar para o VPS.

`psie.ts` é escrito apenas com APIs que **Node 22 e Deno compartilham** (Web Crypto, sem imports), para que
essa migração continue sendo troca de entrypoint.

**O núcleo mora em `scripts/lib/`, e não em `supabase/functions/_shared/` como o plano escreveu.** Decisão
do Klaus em 22/09/2026, e a razão é que `_shared/` significa "compartilhado entre Edge Functions" —
nenhuma Edge Function importaria este arquivo hoje, e a Edge de ingestão que o justificaria está
descartada pela §5.1.2. Deixá-lo lá seria plantar um placeholder em produção para um consumidor
hipotético. Quando a Edge Function existir, mover um arquivo puro e sem imports é trabalho de um minuto —
e nesse momento o diretório passará a dizer a verdade.

Isto é o `CLAUDE.md` se aplicando ao próprio plano: onde o documento e o código divergirem, o código
vence. Aqui o "código" é o fato medido de que a Edge não alcança a fonte.

## 4. O núcleo: `scripts/lib/psie.ts`

```ts
export const UF_ALVO = 'RJ'

export function parseBrDate(s?: string | null): string | null
export function parseIntOrNull(s?: string | null): number | null
export function classificarResultado(r?: string): 'conforme' | 'nao_conforme' | 'indeterminado'
export async function instrumentId(r: PsieRecord): Promise<string>
export async function normalize(r: PsieRecord, snapshotId: string): Promise<{
  instrument: InstrumentRow
  faixas: FaixaRow[]
  verificacoes: VerificacaoRow[]
}>
```

### 4.1 Regras que carregam peso jurídico

**Nenhum valor desconhecido vira `nao_conforme`.** A tabela da §5.4 do plano, implementada exatamente:

| `Resultado` na fonte | Classificação |
|---|---|
| `Aprovado` | `conforme` |
| `Reprovado` | `nao_conforme` |
| `Pendente` | `indeterminado` |
| `""` ou ausente | `indeterminado` |
| qualquer outro (`Reparado`, lixo) | `indeterminado` |

Afirmar "não conforme" sem base é o único erro deste subsistema capaz de criar problema numa peça
protocolada. O default é sempre `indeterminado`.

**`normalize` emite a verificação de origem `topo`.** Quando `DataUltimaVerificacao` e `DataValidade` são
ambas parseáveis, sai uma linha extra com `origem: 'topo'` e `numero_certificado: ''`. É o que impede os
**297 instrumentos** da §1.4.11 — que têm verificação declarada no topo e `Historico: []` — de serem
classificados como sem registro. Como `origem` entra na PK, a linha do topo coexiste com as do histórico
por construção, e a Fase 3 já sabe preferir a do histórico.

**`velocidade_nominal` com `"0"` vira `null`.** São 32 faixas no RJ. Nunca interpretar como limite de
0 km/h — o comentário já está na migration.

**`instrumentId` é determinístico e invariante à ordem das faixas** (§5.3):

```
sha256( SiglaUf | Municipio | LocalVerificacao | serie_1 | serie_2 | … )[:32]
        números de série únicos e não vazios das faixas, ordenados lexicograficamente
```

Risco aceito e a comentar no código: se o INMETRO corrigir a grafia de `LocalVerificacao`, o hash muda e o
instrumento entra como novo. Tolerável porque o histórico vive em `radar_verificacoes` e a consulta casa
por `numero_serie` / `numero_inmetro`, que sobrevivem à mudança de grafia.

### 4.2 Mapeamento campo a campo

Conferido contra o arquivo real de 21/09/2026 e contra `20260906000000_radar_inmetro_rj.sql`.

**Registro → `radar_instruments`**

| Fonte | Coluna | Transformação |
|---|---|---|
| — | `id` | `instrumentId(r)` |
| `SiglaUf` | `uf` | direto (sempre `RJ`) |
| `Municipio` | `municipio` | direto |
| `LocalVerificacao` | `local_via` | direto |
| — | `local_via_norm` | **coluna GERADA — nunca escrever** |
| `TipoMedidor` | `tipo_medidor` | direto |
| `Proprietario` | `proprietario` | direto |
| `DataUltimaVerificacao` | `data_ultima_verificacao` | `parseBrDate` |
| `DataValidade` | `data_validade` | `parseBrDate` |
| `UltimoResultado` | `ultimo_resultado` | direto (texto cru; a classificação é da Fase 3) |
| — | `snapshot_id` | o snapshot desta carga |
| — | `updated_at` | `NOW()` **escrito explicitamente**: o `DEFAULT` só vale no `INSERT`, e num `upsert` que atualiza linha existente a coluna ficaria congelada na data da primeira carga. |

**`Faixas[]` → `radar_faixas`**

| Fonte | Coluna | Transformação |
|---|---|---|
| — | `instrument_id` | FK |
| `NumeroFaixa` | `numero_faixa` | `?? ''` — **NOT NULL, entra na PK** |
| `NumeroInmetro` | `numero_inmetro` | direto |
| `NumeroSerie` | `numero_serie` | direto |
| `Sentido` | `sentido` | `?? ''` — **NOT NULL, entra na PK** |
| `VelocidadeNominal` | `velocidade_nominal` | `parseIntOrNull` (`"0"` → `null`) |

**`Historico[]` → `radar_verificacoes` (`origem: 'historico'`)**

| Fonte | Coluna | Transformação |
|---|---|---|
| — | `instrument_id`, `origem` | FK, `'historico'` |
| `NumeroCertificado` | `numero_certificado` | `?? ''` — **NOT NULL, entra na PK** |
| `NumeroEnsaio` | `numero_ensaio` | direto |
| `Ano` | `ano` | `parseIntOrNull` — mesma função; um `"0"` aqui também vira `null`, o que é o desejado (ano zero não é ano) |
| `DataLaudo` | `data_laudo` | `parseBrDate` — **NOT NULL** |
| `DataValidade` | `data_validade` | `parseBrDate` — **NOT NULL** |
| `TipoServico` | `tipo_servico` | direto |
| `Resultado` | `resultado` | direto (texto cru) |

**Par do topo → `radar_verificacoes` (`origem: 'topo'`)**: `numero_certificado = ''`,
`numero_ensaio = null`, `data_laudo = parseBrDate(DataUltimaVerificacao)`,
`data_validade = parseBrDate(DataValidade)`, `resultado = UltimoResultado`. Emitida **apenas** se as duas
datas forem parseáveis.

### 4.3 Descarte defensivo

`data_laudo` e `data_validade` são **`NOT NULL`**. Uma entrada de histórico cujas datas não parseiem não
pode ser inserida: é **descartada, com aviso no log e contagem no relatório final**.

Medido no arquivo real de 21/09: **as 7.814 entradas de histórico têm as duas datas parseáveis — zero
descartes.** A regra existe porque a fonte pode mudar, não porque hoje morde.

## 5. O entrypoint: `scripts/ingest-radares-rj.ts`

```bash
npm run radar:ingest -- --dry-run    # não escreve nada
npm run radar:ingest                 # carga real; pede confirmação
npm run radar:ingest -- --yes        # carga real, sem prompt
```

Fluxo. **A ordem importa: as FKs exigem `snapshot → instruments → faixas/verificações`.**

1. **Ambiente.** Carregado pelo próprio Node, com `--env-file-if-exists=.env --env-file-if-exists=.env.local` (medido em 22/09: o último arquivo ganha, arquivo ausente não derruba, e **variável real de ambiente vence o arquivo** — a semântica do pipeline, não a do Express da pendência 26). Isto substitui o `dotenv`, que não precisou ser instalado. Carrega `.env` e depois `.env.local` com override — a regra que o `CLAUDE.md` documenta.
   Exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **apenas na carga real**; ausentes, aborta com
   mensagem clara. **`--dry-run` roda sem credencial nenhuma**, porque não toca banco nem Storage — o que
   o torna utilizável para conferir a fonte a qualquer momento, inclusive por quem não tem a chave.
2. **Confirmação do alvo.** Imprime o `project ref` extraído de `SUPABASE_URL` e pede confirmação
   (`--yes` pula). Custa uma linha e elimina a classe de erro mais cara disponível aqui: gravar no projeto
   errado. Sob `--dry-run`, nem cliente de banco é construído.
3. **Busca.** `GET` no endpoint com `User-Agent: amorecorrer.com/1.0 (+amorecorrer@gmail.com)`. O plano escreveu
   `contato@amorecorrer.com`, **endereço que não existe** — a pendência 25 registra que o domínio não tem
   caixa e que o contato oficial é o Gmail. Anunciar contato inválido a um órgão público é pior que não
   anunciar. Guarda o
   header `Last-Modified`.
4. **`sha256` sobre os bytes brutos** — é este valor que será citado como prova. Nunca sobre a string
   reserializada.
5. **Sanidade, antes de qualquer escrita.** Aborta sem persistir nada se: o corpo não parseia como array;
   `records < 1500` (o RJ tem 1.971 — queda abaixo disso indica truncamento na origem); menos de 80% dos
   registros têm ao menos uma faixa.
6. **`normalize`** em todos os registros; monta o relatório de contagens.
7. **`--dry-run` termina aqui**, imprimindo o relatório.
8. **Idempotência** — ver §5.1.
9. **Upload do bruto** para `evidencias/radares/RJ/{YYYY-MM-DD}-{sha12}.json`.
10. **`insert` em `radar_snapshots`** (`source_url`, `last_modified`, `sha256`, `storage_path`, `bytes`,
    `record_count`) → `snapshot_id`.
11. **Upserts em lotes de 500**, nesta ordem: `radar_instruments` (conflito em `id`), `radar_faixas`
    (conflito na PK), `radar_verificacoes` (conflito na PK, `ignoreDuplicates: true` — histórico
    metrológico é imutável).
12. **Relatório final:** linhas gravadas por tabela, descartes, bytes, ms.

### 5.1 Idempotência, com uma correção sobre o plano

A Fase 2 manda encerrar se `(RJ, sha256)` já existe em `radar_snapshots`. **Sozinha, essa regra tem um
buraco:** se a carga falhar no meio, o snapshot já estará gravado e toda re-execução vira no-op, deixando
as tabelas incompletas para sempre — e, pior, silenciosamente.

A checagem, portanto, compara **também** `radar_snapshots.record_count` com o `count(*)` real de
`radar_instruments`. Divergiu, prossegue com a carga. Como todo upsert é por chave determinística,
reprocessar é seguro e barato.

### 5.2 Colisões de chave dentro do mesmo lote

Um `upsert` em lote com duas linhas de mesma PK falha com *"ON CONFLICT DO UPDATE command cannot affect row
a second time"* — erro duro, que aborta o lote inteiro. O script **deduplica por PK antes de enviar cada
lote**, contando o que removeu.

Medido no arquivo real de 21/09: **zero colisões** nas três chaves — `radar_instruments.id`,
`(instrument_id, numero_faixa, sentido)` e `(instrument_id, origem, numero_certificado, data_laudo)`. A
dedupe é seguro contra mudança da fonte, não remendo para um defeito conhecido.

## 6. Testes

Núcleo puro, com `node --test` via `tsx`, sobre `tests/fixtures/medidores_RJ.json` (23 casos-limite que a
Fase 0 já commitou):

- **`parseBrDate`** — `"12/07/2024"` → `"2024-07-12"`; **`"13/01/2026"`** (dia > 12: a prova de que não
  está lendo `MM/DD`); e `""`, `null`, `"2026-08-04"`, `"31/02/2026"` → `null`.
- **`classificarResultado`** — a tabela da §4.1 inteira, incluindo `"Reparado"` e `"XYZ"` →
  `indeterminado`. **Nenhuma entrada desconhecida pode virar `nao_conforme`.**
- **`instrumentId`** — estável entre chamadas e **invariante à ordem do array `Faixas`**.
- **`normalize`** — histórico devolvido **ordenado por `data_laudo`**; `VelocidadeNominal: "0"` → `null`;
  registro sem `Faixas` e sem `Historico` não quebra.
- **Origem `topo`** — `Historico: []` com par válido devolve **exatamente uma** verificação, `origem: 'topo'`,
  `numero_certificado: ''`; registro com histórico devolve `historico.length + 1`; `DataValidade: ""` no
  topo devolve **nenhuma** linha de origem `topo`.
- **Descarte defensivo** — entrada de histórico com `DataLaudo` inválida é descartada e contada.

## 7. Critério de aceite

1. **Testes do núcleo verdes.**
2. **`--dry-run` reproduz o censo, exatamente:** 1.971 instrumentos, 3.346 faixas, 7.814 verificações de
   origem `historico` e 1.838 de origem `topo` — **9.652 verificações**. Os quatro números foram medidos no
   arquivo real em 21/09/2026, e o arquivo de hoje é byte a byte o de 03/09 (`sha256 4dcb3d35…648fb9b`).
   Qualquer desvio é bug do nosso lado, não novidade da fonte.
3. **A carga real popula produção** com esses números, e o arquivo bruto aparece no bucket `evidencias`.
4. **Segunda execução é no-op.**
5. **`verificar_medidor` devolve resultado real** para um número de série tirado do próprio arquivo. É o
   que fecha o ciclo: prova que a RPC de 06/09, que nunca viu um dado, funciona.

## 8. O que continua em aberto depois disto

- **Pendência 21** — de onde uma ingestão *recorrente* buscaria o arquivo. Este design não responde; escolhe
  conviver. O teste de alcance por `curl` a partir do VPS continua valendo um minuto quando ele existir.
- **Pendência 19** — prazo de retenção dos snapshots. Sem poda, nada força a decisão agora.
- **Fase 0.5** — a calibração contra 8 a 10 notificações reais do RJ segue bloqueada: `form_submissions`
  tem 0 linhas. Esta carga **não** a destrava, mas é pré-requisito dela: sem dado nas tabelas não há o que
  calibrar.
- **Fases 4 e 5** — captura dos dados do medidor no formulário e a coluna
  `form_submissions.verificacao_medidor`, que não existe em migration nenhuma. É o próximo passo natural
  depois desta carga.
