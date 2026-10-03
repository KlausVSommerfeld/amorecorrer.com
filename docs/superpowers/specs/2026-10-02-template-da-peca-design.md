# Template da peça — Design

*Escrito em 02/10/2026. Decidido em conversa com o Klaus na mesma data.*

## 1. O problema, e por que este desenho existe

O PDF que o cliente recebe não tem forma de peça. `build_pdf_bytes` (`pipeline/worker.py`) usa o estilo
padrão do reportlab, o título é o `case_id` (`Recurso — CASO_…`), o topo diz "Rascunho gerado para
apreciação" e o corpo é um bloco corrido que o modelo escreve de ponta a ponta — qualificação, fatos,
fundamentos e pedido —, só com o endereçamento e o fecho postos pelo código.

E o cliente **imprime, assina e protocola esse PDF como está** (decisão do Klaus). Então ele precisa
parecer, e ser, uma petição: sem marca nossa, com título, dados do auto à vista, seções e pedido certos.

Dois defeitos já vistos empurram na mesma direção — **a forma e o que é decisivo ficam no código, o
modelo redige**:

- o modelo escolhia o destinatário e endereçou uma defesa prévia à JARI (corrigido em 02/10/2026 com
  `peca.enderecamento`, que este desenho reaproveita como está);
- o modelo fazia a conta da velocidade e sustentou um inciso mais grave contra o cliente (corrigido em
  30/09/2026 com `velocidade.py`).

O pedido é a próxima peça decisiva: hoje um esquecimento ou um pedido mal formulado do modelo vai
direto ao órgão.

**O que o desenho entrega:** uma peça em A4 no estilo "Notificação e Resposta" — forma forense com
quadro de campos do auto —, em que o código escreve endereçamento, título, quadro, qualificação,
pedido e fecho, e o DeepSeek escreve só "Dos fatos" e "Dos fundamentos".

## 2. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Uso do PDF | **Peça final: o cliente imprime, assina e protocola** | Decisão do Klaus. Nada de marca, `case_id` ou "rascunho" na peça; o aviso de revisão vai para o e-mail. |
| Quem escreve o pedido | **O código** | Decisão do Klaus. Mesmo princípio do fecho, do endereçamento e do enquadramento. As teses do modelo seguem nos fundamentos; o arquivamento as cobre. |
| Advertência (art. 267) | **Pedido subsidiário automático** quando a infração é leve ou média, com a condição dos 12 meses escrita no pedido | Decisão do Klaus. Quem confere o histórico é o órgão, no próprio cadastro; uma pergunta no formulário só trocaria a redação para quem seria negado, e um "sim" por engano tiraria do cliente um pedido que o beneficiaria. |
| Como o modelo entrega fatos e fundamentos | **Texto com dois títulos fixos**, cortado pelo `peca.py`; sem títulos, seção única | Decisão do Klaus. Degrada sem derrubar o caso. JSON criaria um caminho novo para `failed`; duas chamadas dobrariam custo e perderiam coerência. |
| Visual | **Opção B, "Notificação e Resposta"** | Decisão do Klaus, sobre maquete: a forma forense com o filete e o quadro de campos rotulados do site — "um pouco de estilo" sem deixar de ser petição. |
| Hifenização | **Sim, português (`pyphen`)** | Justificado sem hifenização abre rios de espaço entre palavras. |
| Fontes | **TTFs versionados em `pipeline/fontes/`** | O repositório só tem `.woff` (web); o reportlab precisa de `.ttf`. Licença OFL permite. |
| Gênero | **Qualificação sem marca de gênero** | O formulário não pergunta. "CPF nº…", "com endereço na…", nada de "portador(a)". |

## 3. A peça, de cima a baixo

Quem escreve cada parte:

| Parte | Autor | Conteúdo |
|---|---|---|
| Endereçamento | código (existe) | `peca.enderecamento(case)` |
| Filete | código | linha fina sob o endereçamento |
| Título | código | "DEFESA PRÉVIA" / "RECURSO À JARI"; estágio não reconhecido → sem título |
| Quadro de campos | código | ver §3.1 |
| Qualificação | código | ver §3.2 |
| I – DOS FATOS | modelo | 1 a 2 parágrafos |
| II – DOS FUNDAMENTOS | modelo | 2 a 4 parágrafos |
| III – DO PEDIDO | código | ver §3.3, itens a), b), c) |
| "Nestes termos, pede deferimento." | código | sempre |
| Fecho | código (existe) | `peca.fecho(case)`: local, data em branco, assinatura, nome, CPF |
| Rodapé | código | "1/2" à direita; nada mais |

Sem os títulos das seções no rascunho, I e II viram uma seção só: **"I – DOS FATOS E DOS
FUNDAMENTOS"**, e o pedido passa a "II – DO PEDIDO".

Dado ausente vira linha em branco (`LINHA_EM_BRANCO`), como hoje.

### 3.1 Quadro de campos

Rótulo pequeno em caixa alta, valor em IBM Plex Mono:

- **Defesa prévia:** Auto de infração (`numero_auto`) · Placa (`placa`) · Data da infração (`data_infracao`).
- **Recurso à JARI:** Auto de infração · Notificação de penalidade (`notificacao_penalidade`) · Placa · Data da infração.
- **Estágio não reconhecido:** o quadro da defesa.

`data_infracao` é `timestamp` sem fuso — o relógio de parede do auto — e vai como `14/08/2026 07:52`,
sem conversão de fuso. Placa em caixa alta.

### 3.2 Qualificação

Defesa prévia:

> MARIANA SOUZA LIMA, CPF nº 529.982.247-25, CNH nº 04512345678, com endereço na Rua das Laranjeiras,
> 120, apto 302, CEP 22240-003, Rio de Janeiro/RJ, e-mail mariana@example.com, vem, respeitosamente,
> apresentar DEFESA PRÉVIA em face do Auto de Infração nº E123456789, pelos fundamentos a seguir expostos.

Recurso à JARI — muda só o fim:

> …vem, respeitosamente, interpor RECURSO contra a penalidade imposta na Notificação de Penalidade
> nº P987654321, referente ao Auto de Infração nº E123456789, pelos fundamentos a seguir expostos.

Estágio não reconhecido: "…vem, respeitosamente, apresentar ______________________ em face do Auto de
Infração nº …".

Regras: nome em caixa alta; CPF formatado (`_cpf`, que já existe); CEP como `22240-003`; cidade/UF
como no fecho. **A CNH sai inteira (com a vírgula) quando vazia** — quem recorre pode ser o
proprietário que não dirigia. Os demais ausentes viram linha em branco. Telefone não entra.

### 3.3 Pedido

Itens em ordem, cada um entrando só quando a condição vale. `X` = número do auto (ou linha em branco);
`N` = inciso da conta (`velocidade.py`).

| # | Condição | Texto |
|---|---|---|
| 1 | defesa, caso comum | o acolhimento desta defesa prévia, com o arquivamento do Auto de Infração nº X e a declaração de insubsistência do seu registro; |
| 1 | recurso, caso comum | o conhecimento e o provimento deste recurso, com o cancelamento da penalidade imposta e o arquivamento do Auto de Infração nº X; |
| 1 | estágio não reconhecido | o acolhimento desta peça, com o arquivamento do Auto de Infração nº X; |
| 1 | defesa, `sem_infracao` | o arquivamento do Auto de Infração nº X por inconsistência, nos termos do art. 281, § 1º, I, do CTB, uma vez que a velocidade considerada no próprio auto não supera a máxima permitida; |
| 1 | recurso, `sem_infracao` | o provimento deste recurso, com o cancelamento da penalidade imposta e o arquivamento do Auto de Infração nº X por inconsistência, nos termos do art. 281, § 1º, I, do CTB, uma vez que a velocidade considerada no próprio auto não supera a máxima permitida; |
| 1 | defesa, `desclassificacao` | a desclassificação da infração para o art. 218, N, do CTB, compatível com a velocidade considerada no próprio auto; |
| 1 | recurso, `desclassificacao` | o provimento deste recurso, para desclassificar a infração para o art. 218, N, do CTB, compatível com a velocidade considerada no próprio auto, com a readequação da penalidade; |
| 2 | `desclassificacao`, qualquer estágio | subsidiariamente, o arquivamento do Auto de Infração nº X por inconsistência, nos termos do art. 281, § 1º, I, do CTB; |
| último | cabe advertência (§3.4) | subsidiariamente, não havendo outra infração cometida nos últimos 12 (doze) meses, a aplicação da penalidade de advertência por escrito em substituição à multa, nos termos do art. 267 do CTB. |

Estágio não reconhecido com situação de velocidade usa os textos da defesa. A ordem da
desclassificação — desclassificar primeiro, arquivar subsidiariamente — é a aprovada na spec de
30/09/2026.

O último item termina em ponto; os demais, em ponto e vírgula. Letras a), b), c) na ordem em que
entram. Abre com "Diante do exposto, requer:".

### 3.4 Quando cabe a advertência

Cabe quando **a natureza da infração é leve ou média e a penalidade inclui multa**, lidas do
`ctb_infracoes.json` (`infracao`, `penalidade`) pelo `CTB.infracao(ref)` que o `consulta.py` já tem:

- com `desclassificacao`, vale a natureza do inciso **da conta** (auto no II, grave, desclassificado
  para o I, média → cabe);
- sem desclassificação, a do enquadramento reconhecido (`base.enquadramento`);
- enquadramento não reconhecido → **não cabe** (nada é adivinhado);
- `sem_infracao` não impede: o pedido subsidiário vale se a autoridade discordar da conta.

## 4. Componentes

### 4.1 `pipeline/peca.py` — o texto, puro

Continua sem dependências e testável fora do venv. Ganha:

- `@dataclass(frozen=True) Peca`: `enderecamento: str`, `titulo: str | None`,
  `campos: tuple[tuple[str, str], ...]`, `qualificacao: str`, `secoes: tuple[tuple[str, tuple[str, ...]], ...]`
  (título, parágrafos), `pedido: tuple[str, ...]` (itens já com letra), `fecho: str`, `nome_arquivo: str`,
  `titulo_documento: str`.
- `separar_secoes(rascunho) -> tuple[tuple[str, tuple[str, ...]], ...]`: depois de `limpar_markdown` e
  `remover_prefacio`, corta pelos títulos. Aceita numeração (`I –`, `1.`, `I)`), caixa baixa, dois
  pontos e as variantes "DO DIREITO" e "DOS FUNDAMENTOS JURÍDICOS" para fundamentos. Descarta o que
  vier antes de "DOS FATOS" (qualificação escrita pelo modelo) e tudo a partir de um título de pedido
  ("DO PEDIDO", "DOS PEDIDOS", "DO REQUERIMENTO"). Sem títulos → seção única; nesse caso, descarta o
  primeiro parágrafo se ele contiver o nome do cliente e "vem," nos primeiros 300 caracteres.
- `remover_pedido(paragrafos)`: tira, do fim, parágrafos que comecem por "Diante do exposto", "Ante o
  exposto", "Pelo exposto", "Por todo o exposto", "Isto posto" ou "Nestes termos" **e** contenham
  "requer" ou "deferimento"; e mantém o corte atual de tudo depois de "pede deferimento".
- `titulo(case)`, `campos(case)`, `qualificacao(case)`, `pedido(case, situacao_velocidade,
  inciso_da_conta, cabe_advertencia)` — cada um testável sozinho.
- `montar_peca(rascunho, case, situacao_velocidade, inciso_da_conta, cabe_advertencia) -> Peca`.
- `remover_enderecamento` e `enderecamento` ficam; `texto_da_peca` sai (o worker passa a usar
  `montar_peca`), e `cortar_depois_do_pedido` vira parte de `remover_pedido`.

Rascunho vazio depois da limpeza → `RespostaDoModeloInvalida` (de `prompt.py`), e o caso vai a
`failed`, como já acontece com resposta vazia.

**Nome do arquivo:** `defesa-previa-<auto>.pdf` / `recurso-jari-<auto>.pdf`, com o número do auto
reduzido a `[A-Za-z0-9-]`; sem auto ou sem estágio → `peca-<case_id>.pdf`.
**Título do documento** (metadado do PDF): "Defesa prévia — Auto nº X" / "Recurso à JARI — Auto nº X";
sem auto, sem o trecho do auto.

### 4.2 `pipeline/pdf_peca.py` — a página, novo

`gerar_pdf(peca: Peca) -> bytes`. Substitui `build_pdf_bytes`, que sai do worker.

- A4; margens 3 cm (esquerda), 2 cm (direita), 2,5 cm (topo), 2 cm (base).
- Corpo: Source Serif 4, 12 pt, entrelinha 18 pt, justificado, recuo de 1,25 cm na primeira linha,
  `hyphenationLang="pt_BR"`.
- Endereçamento em semibold, sem recuo, seguido de filete de 0,5 pt.
- Título: bold, caixa alta, espaçamento entre letras, alinhado à esquerda.
- Quadro: `Table` com borda de 0,5 pt, uma coluna por campo; rótulo IBM Plex Mono 6,5 pt em caixa alta
  cinza-escuro; valor IBM Plex Mono medium 9,5 pt.
- Títulos de seção: bold, com filete de 0,4 pt embaixo; o título não fica sozinho no pé da página
  (`keepWithNext`).
- Itens do pedido com recuo pendente.
- Fecho: local/data à direita do recuo, linha de assinatura e nome/CPF centralizados; o fecho não se
  parte entre páginas (`KeepTogether`).
- Rodapé: "página/total" (`1/2`), Source Serif 4, 9 pt, à direita, em toda página.
- Só preto (e cinza nos rótulos): a peça é impressa em casa.
- Metadados: `title = peca.titulo_documento`; sem `author`/`creator` nossos.
- Todo texto vindo do caso ou do modelo passa por `html.escape` antes do `Paragraph` (como hoje em
  `paragrafo_para_pdf`).

**Fontes:** `pipeline/fontes/` com `SourceSerif4-Regular.ttf`, `-Semibold.ttf`, `-Bold.ttf`,
`-It.ttf`, `IBMPlexMono-Regular.ttf`, `IBMPlexMono-Medium.ttf` e as licenças (`OFL-SourceSerif4.txt`,
`OFL-IBMPlexMono.txt`), baixados das releases oficiais (adobe-fonts/source-serif, IBM/plex), com o
`sha256` de cada arquivo registrado no `PROGRESSO.md`. `registrar_fontes()` roda uma vez por processo e
lança erro claro se algum arquivo faltar; o `main.py` a chama no startup, para o pipeline **acusar ao
subir**, não no meio de um caso pago.

**Dependência nova:** `pyphen` em `pipeline/requirements.txt` (versão fixada, como as outras). Instalação
no `.venv` de Windows pelo pip do próprio venv — nunca do WSL.

### 4.3 `pipeline/base_legal.py`

- `natureza(ctb, dispositivo) -> tuple[str, str] | None`: (`infracao`, `penalidade`) do
  `CTB.infracao(ref)`; `None` se não houver.
- `cabe_advertencia(ctb, enquadramento, inciso_da_conta) -> bool`: as regras do §3.4.
- `montar_base(ctb, amparo_legal, extras: tuple[str, ...] = ())`: os extras entram como os de
  `EXTRAS_POR_ARTIGO` (com remissões seguidas). O worker passa `("267",)` quando cabe advertência — o
  pedido cita o art. 267, e a invariante "nenhuma citação fora da base chega ao PDF" continua valendo.
  Com o 267 na base, o modelo também pode usá-lo nos fundamentos.

### 4.4 `pipeline/velocidade.py`

- `Bloco` ganha `inciso_da_conta: str | None` (o `pela_conta` de hoje; `None` em `sem_infracao`).
- A "Instrução para a redação" deixa de mandar **requerer** e passa a mandar **sustentar nos
  fundamentos** ("Sustente nos fundamentos que…; o pedido é escrito à parte, não o escreva."). Os
  números e a proibição de calcular percentual ficam.

### 4.5 `pipeline/prompt.py`

- O núcleo do system prompt troca "rascunhos de recurso de multa de trânsito" por **"defesas e recursos
  de multa de trânsito"**, e o cabeçalho do contexto troca "Dados do caso para o recurso:" por **"Dados
  do caso:"** — o enquadramento em "recurso" foi uma das causas da defesa endereçada à JARI
  (diagnóstico de 02/10/2026). `test_mantem_o_nucleo_antigo` é atualizado junto.
- A instrução de forma passa a ser: escreva **exatamente duas seções**, cada uma aberta pelo título em
  linha própria — `DOS FATOS` (1 a 2 parágrafos) e `DOS FUNDAMENTOS` (2 a 4) —; **não escreva**
  endereçamento, qualificação, pedido, "pede deferimento", local, data nem assinatura. Sai o "Produza 2
  a 4 parágrafos" e o "termine no pedido".
- `REGRA_BASE_LEGAL`, `REGRA_ENQUADRAMENTO`, `REGRA_SEM_ENQUADRAMENTO` e `REGRAS_RADAR` não mudam.
- `pedido_de_correcao` (refação da conferência) não muda: a peça recusada volta como texto.

### 4.6 `pipeline/worker.py`

Ordem nova no `run_dispatch_pipeline`:

1. `base = montar_base(ctb, amparo)`; `bloco_vel = bloco_velocidade(case, base.enquadramento)`.
2. `cabe = cabe_advertencia(ctb, base.enquadramento, bloco_vel.inciso_da_conta if bloco_vel else None)`
   (em `base_legal.py`; com inciso da conta, consulta `art. 218, <inciso>`; sem ele, o enquadramento);
   se cabe, `base = montar_base(ctb, amparo, extras=("267",))`.
3. Prompt e conferência como hoje.
4. `peca = montar_peca(draft, case, situacao, inciso, cabe)`; `pdf = gerar_pdf(peca)`.
5. Log: `peca case_id=… secoes=2|1 pedido_itens=N advertencia=sim|nao pedido_do_modelo_removido=sim|nao`
   — sem dados pessoais.

O anexo usa `peca.nome_arquivo`; o caminho no Storage (`<case_id>/<dispatch_key>.pdf`) não muda.

### 4.7 E-mail

Corpo novo (`intro` no worker e o texto fixo de `send_email_pdf`):

> Olá,
>
> Sua peça está pronta, em anexo, para você imprimir e protocolar:
>
> 1. Confira os dados e preencha à mão as linhas em branco.
> 2. Assine no espaço indicado.
> 3. Protocole no órgão de trânsito até o prazo que consta da sua notificação — no balcão, pelos
>    Correios ou pelo site do órgão, conforme ele aceitar.
>
> Revise o texto antes de protocolar: ele foi redigido com apoio de inteligência artificial a partir
> das informações que você enviou.
>
> Identificação do pedido: CASO_…
>
> Cordialmente,
> Amo Recorrer

O assunto (`MAIL_SUBJECT`) não muda.

## 5. Erros

| Situação | Comportamento |
|---|---|
| Rascunho sem os títulos das seções | Seção única "DOS FATOS E DOS FUNDAMENTOS"; log `secoes=1` |
| Modelo escreveu qualificação, pedido ou fecho | Cortado; log `pedido_do_modelo_removido=sim` |
| Rascunho vazio depois da limpeza | `RespostaDoModeloInvalida` → `failed` |
| Estágio não reconhecido | Sem título, qualificação com linha em branco, pedido genérico |
| Enquadramento não reconhecido | Sem advertência; o resto igual |
| Arquivo de fonte ausente | Erro no startup do pipeline |
| `pyphen` ausente | Erro no import do `pdf_peca` (é dependência fixada) |

Nenhuma questão de forma derruba um caso pago.

## 6. Testes

- **`test_peca`** (sem dependências):
  - cada linha da tabela do §3.3, nos dois estágios e no desconhecido; ordem e letras dos itens;
    ponto final só no último;
  - `cabe_advertencia` recebida como `True`/`False` muda só o último item;
  - qualificação nos dois estágios, com e sem CNH, com campos ausentes;
  - `campos` por estágio e a data `2026-08-14T07:52:00` → `14/08/2026 07:52`;
  - `separar_secoes`: títulos limpos, em negrito, numerados, em caixa baixa, "DO DIREITO", ausentes;
    qualificação antes de "DOS FATOS" descartada; seção "DO PEDIDO" cortada;
  - `remover_pedido` com "Diante do exposto, requer…" e sem ele (parágrafo de fundamento que começa por
    "Ante o exposto" mas não requer nada fica);
  - nome do arquivo e título do documento, com e sem auto;
  - trechos dos rascunhos reais de 02/10/2026 (caso fictício da Mariana, guardados hoje só no
    scratchpad da sessão) copiados para o teste como constantes: nada de conteúdo perdido além do que
    deve sair.
- **`test_base_legal`:** `natureza` do 218 I, II e III; `cabe_advertencia(ctb, enquadramento, inciso_da_conta)` com e sem desclassificação,
  com enquadramento não reconhecido; `montar_base(..., extras=("267",))` traz o 267.
- **`test_velocidade`:** o texto do bloco não manda mais "Requeira"; `inciso_da_conta` certo.
- **`test_prompt`:** os dois títulos exatos no prompt; proibição de pedido e qualificação; núcleo novo.
- **`test_pdf_peca`** (precisa de `reportlab` e `pyphen`; `skipUnless` quando ausentes, para o comando
  padrão fora do venv não quebrar): PDF começa com `%PDF`; as duas fontes estão embutidas; peça longa
  gera 2+ páginas com "1/2"/"2/2"; texto com `<` e `&` não quebra.
- **Rodada real:** três peças por estágio com o prompt novo e a montagem do worker; contar quantas
  trazem os dois títulos e quantas tiveram pedido removido.
- **PDFs de exemplo:** um por estágio (defesa com desclassificação + advertência; recurso comum),
  gerados pela função de produção e **abertos pelo Klaus antes do merge**.

## 7. Documentação e deploy

- `CLAUDE.md`: a invariante "a forma da peça é garantida por código" passa a listar quadro,
  qualificação e pedido; a regra do art. 267; o comando de testes ganha `test_pdf_peca` (e como rodá-lo
  com `PYTHONPATH` fora do venv); `pyphen` e `pipeline/fontes/` na seção do pipeline.
- `PENDENCIAS.md`: sai o item "Template da peça".
- `PROGRESSO.md`: sessão nova, com os `sha256` das fontes.
- **Sem deploy**: o pipeline não roda em produção (#11). O `.venv` de Windows precisa do `pip install -r
  requirements.txt` pelo próprio venv antes do próximo teste ponta a ponta.

## 8. Fora do escopo

- DOCX ou qualquer formato editável.
- Terceiro estágio (recurso ao CETRAN, art. 288).
- Pergunta sobre infrações nos últimos 12 meses no formulário.
- Logo, marca ou `case_id` na peça.
- Mudança no formulário, na Edge ou no banco.

## 9. Critério de pronto

- Toda peça gerada pelo worker sai com endereçamento, título, quadro, qualificação, seções, pedido do
  código, "pede deferimento", fecho e numeração — com ou sem os títulos no rascunho.
- Nenhuma peça traz pedido escrito pelo modelo.
- O pedido de advertência aparece exatamente quando §3.4 manda, e o art. 267 está na base nesses casos.
- Os testes da §6 passam; os PDFs de exemplo foram aprovados pelo Klaus.
