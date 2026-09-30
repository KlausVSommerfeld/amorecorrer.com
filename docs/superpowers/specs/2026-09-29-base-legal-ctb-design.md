# Base legal do CTB em toda peça, com conferência das citações — Design

*Escrito em 29/09/2026. Decidido em conversa com o Klaus entre 25 e 29/09/2026.*

## 1. O problema, e por que este desenho existe

O prompt deixa o DeepSeek citar qualquer norma de memória, e nada confere o que ele cita. Nas rodadas
reais desta semana ele:

- **acertou** o art. 90 do CTB (sinalização insuficiente) — conferido depois no texto oficial;
- **citou o art. 24 do Código Penal** (estado de necessidade) como aplicável "subsidiariamente" a uma
  infração de trânsito;
- **deturpou o § 2º do art. 280** na Fase 5, atribuindo a ele uma exigência de "aferição" que o texto
  não tem — e só parou quando o texto literal passou a ir no prompt.

Numa peça jurídica, uma citação errada é o ponto mais fácil de o órgão rebater, e o cliente não tem
como perceber. Este desenho faz duas coisas: **toda peça recebe o texto oficial dos artigos que pode
citar**, e **uma conferência em código impede que uma citação fora dessa base chegue ao PDF**.

**Por que o contexto pronto, e não uma ferramenta de consulta.** Um teste com código descartável em
26/09 comparou os dois caminhos em 6 casos no `deepseek-flash` (ver `PROGRESSO.md`, sessão de
26/09/2026). Nenhum dos dois inventou artigo ou citou lei externa, mas o **contexto pronto** trouxe o
art. 90 nos três casos de sinalização e o prazo do art. 281, § 1º, II no caso da notificação tardia; a
**ferramenta** não trouxe nenhum dos dois — a descoberta dependia da memória do modelo, e a consulta
por número devolvia só o caput.

**A matéria-prima já existe.** O Klaus construiu `CTB-compilado_files/`: um parser do compilado do
Planalto (`ctb_parser.py`), uma consulta que só usa a biblioteca padrão (`consulta.py`) e a saída
versionada (`saida/ctb.json`, com `sha256` da fonte e data de obtenção; 391 artigos, 364 vigentes,
2.066 dispositivos com status). 41 testes passam. O `contexto_peticao` monta o bloco normativo de um
caso em cerca de 7 mil tokens.

## 2. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Como a base chega ao modelo | **Contexto pronto** (`contexto_peticao`), não ferramenta | Resultado do teste de 26/09 (§1). |
| Onde o CTB mora | **O pipeline importa `CTB-compilado_files/consulta.py` e lê `saida/ctb.json`**, por caminho configurável (`CTB_DIR`) | Uma fonte da verdade: atualizar o CTB não exige cópia. Uma cópia dentro de `pipeline/` divergiria em silêncio — o mesmo tipo de erro que já derrubou o dispatch (precedência dos `.env`). |
| Citação recusada | **Refazer uma vez**, dizendo exatamente o que foi recusado; se falhar de novo, o caso vai a `failed`, sem e-mail | Decisão do Klaus. Um deslize do modelo não vira atendimento manual na primeira; uma citação ruim nunca chega ao cliente. |
| `amparo_legal` não reconhecido | **Só o rito**, sem o dispositivo enquadrado, e proibição de citar o artigo da infração | Decisão do Klaus. Nada é adivinhado: código de enquadramento ("7455-0"), texto livre e vazio não viram artigo. |
| Remissões dos textos entregues | **O código inclui o texto dos artigos remetidos** pelo dispositivo enquadrado (um nível) | No teste, as citações "fora da base" eram remissões (208 → 44-A; 165-A → 277, 270). Aceitar só o número deixaria o modelo citar o conteúdo de memória. Com o texto na base, a conferência pode ser estrita. |
| Artigos extras por infração | **Tabela no código, começando com `{"218": ["61"]}`** | Decisão do Klaus. O art. 61 (limites de velocidade) não está no pacote padrão e é central numa multa de velocidade. Itens novos só com aprovação dele. |
| Nível da conferência | **Artigo**, não inciso | O `contexto_peticao` entrega artigos inteiros; ir ao inciso exigiria interpretar "§ 1º, II" em texto livre, com muito falso positivo. |
| Trecho entre aspas que não bate literalmente | **Alerta no log, não recusa** | No teste, o único alerta foi falso positivo (caput + inciso citados juntos). A deturpação é coberta pelo texto literal na base e pela regra "só o que o texto diz". Se o log mostrar deturpação real, a recusa sobe. |
| Chave para ligar | **Nenhuma** | O pipeline não está em produção; não há comportamento antigo a preservar atrás de flag. |

**Escopo negativo, explícito.** Não entram: a ferramenta de consulta (caminho B) e uma busca de
descoberta; resoluções do CONTRAN (a "Res. 798/2020" citada no README do parser **não foi conferida** e
fica proibida — risco 3 do plano do radar); a tabela de códigos de enquadramento (código do auto →
dispositivo); qualquer mudança no parser ou no `consulta.py`; qualquer mudança no radar, no Express ou
na Edge.

## 3. A montagem da base — `pipeline/base_legal.py`

Módulo puro. Importa `consulta` do diretório `settings.ctb_dir` (padrão:
`<raiz do repositório>/CTB-compilado_files`).

**Carregamento:** `carregar_ctb(ctb_dir) -> CTB`, chamado uma vez e guardado. Arquivo ausente, JSON
inválido ou `meta.sha256` ausente → **lança `BaseLegalIndisponivel` (RuntimeError)**. O pipeline nunca
gera peça sem base. (Motivação concreta: em 29/09 um "Sim" digitado por engano no início do `ctb.json`
o tornou JSON inválido.)

**`montar_base(ctb, amparo_legal) -> BaseLegal`**, um dataclass com:

- `texto: str` — o bloco Markdown que vai ao modelo;
- `artigos: frozenset[str]` — números dos artigos cujo **texto** está no bloco (ex.: `{"218", "61",
  "90", "257", "280", …}`);
- `enquadramento: str | None` — a citação reconhecida (ex.: `"art. 218, I"`), ou `None`;
- `sha256: str`, `obtido_em: str` — da `meta` da base.

**Ordem de montagem:**

1. **Enquadramento.** `parse_ref(amparo_legal)` e `ctb.dispositivo(ref)`. Reconhecido **e** com
   status `vigente` → entra (dispositivo com ascendentes e sanção, e o artigo completo). Qualquer falha
   (`ReferenciaInvalida`, `KeyError`, `ValueError`, status diferente de `vigente`, `amparo_legal`
   vazio ou `None`) → `enquadramento = None` e o bloco segue sem ele.
2. **Remissões.** Com enquadramento, extrair "art. N" / "arts. N" (com sufixo `-A` etc.) do texto do
   dispositivo enquadrado e da sanção dele; cada artigo existente e vigente entra inteiro. **Um
   nível** — remissões dos artigos remetidos não são seguidas.
3. **Extras.** `EXTRAS_POR_ARTIGO = {"218": ["61"]}`, pela chave do artigo do enquadramento.
4. **Rito padrão.** `PROCESSUAIS_PADRAO` do `consulta.py` (90, 257, 280, 281, 281-A, 282, 282-A,
   284–290).

Sem repetição: cada artigo entra uma vez. Os itens 2–4 usam `ctb.contexto_peticao(enquadramentos=…,
extras=…)` sempre que possível, para não reimplementar a formatação; `artigos` é calculado a partir do
que foi de fato incluído.

## 4. A conferência — `pipeline/conferencia.py`

Módulo puro. **`conferir_citacoes(peca: str, base: BaseLegal, ctb) -> Resultado`**, com
`recusas: list[Recusa]` (cada uma: `trecho`, `motivo`) e `alertas: list[str]`.

**Recusa:**

1. **Artigo fora da base.** Toda menção "art. N", "artigo N", "arts. N e M", "arts. N, M e P",
   "arts. N a M" (o intervalo conta N e M) cujo N não esteja em `base.artigos`. Motivo: *"não consta
   da base normativa fornecida"*.
2. **Norma externa.** Menção a: Código Penal, Código Civil, Código de Processo, Constituição (e
   "CF"), "Lei nº X" com X diferente de 9.503, resolução, portaria, deliberação, instrução normativa,
   súmula, jurisprudência. Um "art. N" seguido, em até 60 caracteres, de uma dessas normas conta como
   desta regra, não da 1. Motivo: *"norma fora do CTB"*.
3. **Artigo inexistente ou não vigente no CTB** (rede de segurança). Motivo: *"não existe no CTB"* ou
   *"dispositivo {status}"*.

**Alerta (não recusa):** trecho entre aspas (≥ 25 caracteres) que, normalizado (minúsculas, sem
acento, pontuação colapsada), não aparece no texto normalizado da base.

**Não é citação:** "Código de Trânsito Brasileiro", "CTB", "Lei nº 9.503/1997" e variantes.

## 5. O fluxo no worker

Em `run_dispatch_pipeline`, entre `build_case_context` e o PDF:

1. `base = montar_base(ctb, case.get("amparo_legal"))`.
2. Mensagem do usuário: contexto do caso + `"\n\n"` + `base.texto`. System prompt:
   `SYSTEM_PROMPT_BASE` + `REGRA_BASE_LEGAL` (+ `REGRA_SEM_ENQUADRAMENTO` se `base.enquadramento is
   None`) + `REGRAS_RADAR` quando houver bloco do radar.
3. `peca = await call_deepseek(...)`; `resultado = conferir_citacoes(peca, base, ctb)`.
4. **Recusa → uma nova chamada** com a conversa inteira: sistema, usuário, a peça recusada como
   `assistant`, e um `user` montado por `pedido_de_correcao(recusas)`:
   *"Reescreva a peça inteira sem estas citações, mantendo o restante: 'art. 24 do Código Penal'
   (norma fora do CTB); 'art. 61' (não consta da base normativa fornecida)."* A nova peça é conferida
   de novo.
5. **Recusa de novo → `raise CitacaoForaDaBase(...)`** (RuntimeError), com as recusas na mensagem. O
   `except` existente leva o caso a `failed` via `notify_finish(False, error_detail=…)`, sem e-mail.
6. **Passou** → `texto_da_peca` → PDF → Storage → e-mail, como hoje.

**Regras de prompt novas** (em `pipeline/prompt.py`):

- `REGRA_BASE_LEGAL`: *" Base legal: use exclusivamente a base normativa do CTB fornecida junto com os
  dados do caso; cite apenas dispositivos que constem dela e apenas o que o texto deles diz. Não cite
  outras leis, códigos, resoluções, portarias nem jurisprudência."*
- `REGRA_SEM_ENQUADRAMENTO`: *" O dispositivo da infração não pôde ser confirmado: não cite o artigo
  da infração; defenda pelos dispositivos da base."*

**`call_deepseek`** ganha o parâmetro opcional `mensagens` (a conversa inteira, para o refazer). A
chamada normal não muda. `argumentos_da_chamada` passa a aceitar a lista de mensagens; raciocínio
desligado, `max_tokens=1200` e `temperature=0.4` continuam.

**Log por peça** (sem dados pessoais do cliente): `sha256` e `obtido_em` da base; enquadramento
reconhecido ou "não reconhecido"; `sorted(base.artigos)`; recusas da primeira tentativa; alertas.

**Não muda:** o contrato do 202; a guarda de resposta vazia/cortada; o `peca.py`; a chave do radar.

## 6. Testes

| Módulo | O que prova |
|---|---|
| `pipeline/test_base_legal.py` | "Art. 218, I, do CTB" → enquadramento `art. 218, I`, com 218, 61, 90, 257 e 280–290 em `artigos`; "Art. 208" traz o texto do 44-A; "Art. 165-A" traz 277 e 270; "7455-0", "", `None`, "Excesso de velocidade" → sem enquadramento, só rito, 218 fora; nenhum artigo duplicado no texto; `sha256`/`obtido_em` preenchidos; JSON inválido e diretório ausente → `BaseLegalIndisponivel` |
| `pipeline/test_conferencia.py` | a peça real do caminho A (caso 218, III) passa; "art. 24 do Código Penal", "Resolução nº 798/2020 do CONTRAN", "Lei nº 9.784/1999" recusados como norma externa; "art. 61" fora da base recusado; "arts. 280 e 281" e "arts. 284 a 290" lidos como artigos; "Código de Trânsito Brasileiro" e "Lei nº 9.503/1997" não recusados; caput + inciso entre aspas vira alerta, não recusa |
| `pipeline/test_prompt.py` | `REGRA_BASE_LEGAL` e `REGRA_SEM_ENQUADRAMENTO` no system prompt; `pedido_de_correcao` lista cada recusa com o motivo; `argumentos_da_chamada` aceita a conversa inteira mantendo raciocínio desligado |

**Verificação real** (DeepSeek e o worker de verdade, até o PDF): os 6 casos do teste de 26/09; um
com amparo "7455-0"; e um **provocado**, com justificativa que pede o Código Penal — para ver a
recusa, o refazer e o resultado final. PDFs abertos; log conferido.

## 7. Deploy e documentação

- **Plano do #11** (`docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md`): o Dockerfile
  do pipeline copia os `.py` um a um e já não trazia `prompt.py`, `verificacao.py` e `peca.py`. Passa a
  copiar todos os `.py` do pipeline (menos `test_*.py`) e a pasta `CTB-compilado_files/consulta.py` +
  `saida/ctb.json`, com `CTB_DIR` apontando para ela. Corrigido nesta entrega.
- **`config.py`**: `ctb_dir: str` com padrão na raiz do repositório.
- **`CLAUDE.md`**: invariante nova (toda peça recebe a base do CTB; nenhuma citação fora dela chega ao
  PDF); `CTB_DIR` na lista de variáveis; como atualizar o CTB (salvar a página, rodar o parser e os
  testes do parser — o `sha256` novo aparece no log das peças); os testes novos no comando do
  `unittest`.
- **`PENDENCIAS.md`**: sai a pendência de base legal; entram a tabela de códigos de enquadramento, o
  endereçamento à JARI (já registrado) e o destino da ferramenta B.
- **`PROGRESSO.md`**: entrada da sessão.

## 8. Critério de pronto

- Todos os testes Python verdes (`test_verificacao test_prompt test_peca test_base_legal
  test_conferencia`), `npm run radar:test` verde, worker compilando.
- Os 8 casos reais até o PDF, com nenhuma citação fora da base no texto final e o caso provocado
  mostrando recusa → refazer → peça limpa (ou `failed`, se falhar duas vezes).
- O plano do #11 corrigido.
