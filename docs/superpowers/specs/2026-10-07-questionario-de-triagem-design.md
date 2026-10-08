# Questionário de triagem — Design

*Escrito em 07/10/2026. Decidido em conversa com o Klaus na mesma data. É o projeto 1 de 3: a consulta
ao radar antes do pagamento (projeto 2) e a defesa em nome do condutor (projeto 3) terão specs
próprias.*

## 1. O problema, e por que este desenho existe

Hoje o cliente sai da página inicial direto para o Stripe e só depois do pagamento encontra um formulário
longo, onde decide sozinho coisas que mudam a peça: o estágio do caso, quem dirigia, se tem uma versão
própria. O teste ponta a ponta de 07/10/2026 mostrou o custo disso. O cliente respondeu que outra
pessoa dirigia, contou no relato que era o filho, e a peça repetiu "seu filho dirigia o veículo". Uma
pergunta feita antes, no lugar certo, teria orientado o caminho.

A ideia do Klaus é um **questionário antes do pagamento**, com dois objetivos:

- **resolver antes as dúvidas que mudam a peça:** estágio, prazo, quem dirigia, relato;
- **aumentar a conversão pelo princípio da coerência:** quem investiu tempo e atenção respondendo tende a
  concluir, e um questionário que entrega valor faz o serviço parecer mais completo.

O valor entregue é real e calculado pelo código, nunca prometido. Pelos números do auto, o questionário
mostra o que a defesa vai pedir e qual pedido tem mais chance de ser aceito; pela lei, o que o cliente
ganha ao recorrer dentro do prazo. O efeito de coerência só é legítimo enquanto o questionário não
sugerir um resultado que não existe.

## 2. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Escopo deste projeto | **Triagem e formulário enxuto.** A consulta ao radar e a defesa em nome do condutor ficam para os projetos 2 e 3 | Decisão do Klaus. O radar depende de pendências da tese (`RADAR_TESE_ATIVA`, avisos legais, ingestão), e a defesa em nome do condutor depende de conferir o rito do CONTRAN. |
| Campos antes do pagamento | **A triagem e os dados do auto que geram diagnóstico:** estágio, data-limite, quem dirigia, se é multa de radar, enquadramento, velocidades e versão | Decisão do Klaus (opção C). Os números longos de copiar (nº do auto, RENAINF, série do medidor) entram depois que o cliente decidiu. |
| Nunca desencorajar | **O caso neutro também vende**, mostrando o que a defesa sustenta e o que a lei garante a quem recorre | Decisão do Klaus. Conferido no CTB: a penalidade só vem depois da defesa julgada (art. 282), o recurso à JARI suspende (art. 285), os pontos só vão ao RENACH esgotados os recursos (art. 290, p. único), e nada bloqueia o licenciamento enquanto o processo corre (art. 284, § 3º). |
| Prazo vencido | **Não vende a peça daquele estágio e explica o caminho que resta** | Decisão do Klaus. A lei diz que o recurso intempestivo não tem efeito suspensivo e é arquivado (art. 285, §§ 1º e 5º). Na defesa prévia vencida, o processo segue: a notificação de penalidade abre prazo novo para a JARI (art. 282, § 4º). |
| Prazo | **A data-limite impressa na notificação**, não "há quantos dias chegou" | É a data que a lei manda constar dela (arts. 281-A e 282, § 4º); contar a partir da chegada da carta seria menos exato. |
| Data-limite | **Gravada** em `form_submissions.data_limite_protocolo`, e o e-mail diz "protocole até dd/mm/aaaa" | Decisão do Klaus. |
| Relato | **Duas opções exclusivas.** "Quero contar o que aconteceu" abre o texto livre com perguntas-guia; "Não tenho uma versão própria — quero a defesa pelos dados do auto" tem um "?" que explica o efeito | Decisão do Klaus. O caminho do relato até a peça, validado em 150 peças, não muda. |
| Onde ficam as respostas antes do pagamento | **No navegador.** O diagnóstico vem de uma cópia em TypeScript do `velocidade.py`, presa a ele por casos de teste compartilhados | Decisão do Klaus (opção A). Nada é gravado de quem não compra. |
| Contador de funil | **Fora deste projeto, registrado no `PENDENCIAS.md`** | Decisão do Klaus. Falta escolher onde gravar os eventos. |
| Ordem do pedido na peça | **Sempre a) arquivamento, b) desclassificação subsidiária, c) advertência subsidiária** | Decisão do Klaus. Reverte a ordem da spec de 30/09/2026 (desclassificação primeiro): na peça se pede mais do que se espera obter. |
| Destaque no diagnóstico | **O pedido com mais chance de ser aceito aparece em destaque, sem desmerecer os outros** | Decisão do Klaus. |

## 3. O fluxo

```
Página inicial ──(botões de compra)──► /questionario
   1. Estágio
   2. Data-limite ──(vencida)──► tela de prazo vencido (sem pagamento)
   3. Quem dirigia
   4. É multa de radar? → enquadramento [+ velocidades]
   5. Sua versão
   ──► tela de resumo (diagnóstico, garantias da lei, preço) ──► Stripe ──► /form
```

`/form` passa a pedir os dados pessoais e os dados do auto que faltam (órgão autuador, nº do auto, nº da
notificação de penalidade, RENAINF, placa, marca/modelo, data e hora, local, expedida em, descrição da
infração e números do medidor), mais o bloco **"Suas respostas"**: o questionário preenchido e
editável. Quem chega a `/form` sem ter passado pelo questionário (link antigo, outro aparelho,
armazenamento bloqueado) encontra o bloco vazio e preenche tudo ali. O contrato com a `form-submit` é o
mesmo nos dois caminhos.

## 4. As telas e os textos

Uma pergunta por tela, com um indicador "Passo N de 5", botão "Continuar" (`.btn--solid`) e "Voltar"
(`.btn--ghost`). As telas usam o `PageShell` e os átomos do design system (`.choice`, `.field`,
`.form-label`, `.form-hint`, `.form-error`). O erro de cada passo sai de `aria-invalid`, como no
formulário.

### 4.1 Passo 1 — Estágio

- Pergunta: **"Em que estágio está o seu caso?"**
- Os dois cartões de `ESTAGIOS` (`Form.tsx`), com os mesmos valores, nomes e descrições. A dica é "Está
  escrito no alto do papel que você recebeu." e o erro, "Escolha o estágio do seu caso."
- Os valores **são os mesmos rótulos exatos** que `peca.py` reconhece (`DEFESA_PREVIA`, `RECURSO_JARI`).
  Para que o questionário e o formulário nunca divirjam, `ESTAGIOS` sai de `Form.tsx` e vai para um
  módulo compartilhado (`src/lib/estagios.ts`).

### 4.2 Passo 2 — Data-limite

- Pergunta: **"Qual é a data-limite que consta da sua notificação?"**
- Campo de data. A dica muda com o estágio:
  - defesa prévia: "Na notificação de autuação, é a data-limite para apresentar defesa prévia ou
    indicar o condutor.";
  - recurso à JARI: "Na notificação de penalidade, é a data-limite para recorrer — a mesma do
    vencimento da multa."
- Erro: "Informe a data que está impressa na notificação."
- **Vencida** é a data-limite anterior a hoje, em datas sem hora (o próprio dia da data-limite ainda
  vale). Data vencida leva à tela de prazo vencido (§4.7).

### 4.3 Passo 3 — Quem dirigia

- Pergunta: **"Era você quem dirigia o veículo no momento da infração?"**
- Opções: "Sim, eu dirigia" / "Não, outra pessoa dirigia". Erro: "Marque uma das opções."
- Na defesa prévia, com "Não", aparece logo abaixo:
  > **Indique quem dirigia.** Você tem até 30 dias, contados da notificação da autuação, para indicar
  > ao órgão de trânsito o condutor, pelo meio que consta da notificação. Sem a indicação, a
  > responsabilidade pela infração passa a ser sua (art. 257, § 7º, do CTB). A indicação é feita à
  > parte e não substitui a defesa.

### 4.4 Passo 4 — Enquadramento e velocidades

- Pergunta: **"A multa é de radar, por excesso de velocidade?"**, com "Sim" / "Não".
- Com qualquer resposta: o campo **"Enquadramento (amparo legal)"**, com placeholder "Art. 218, II, do
  CTB" e a dica "Copie como está na notificação, no campo do enquadramento ou do amparo legal."
  Opcional: sem ele não há diagnóstico de velocidade.
- Com "Sim": **velocidade permitida, aferida e considerada** (km/h), opcionais, com as mesmas regras do
  formulário de hoje: só dígitos, até 3, e a considerada não pode passar da aferida.

### 4.5 Passo 5 — Sua versão

- Pergunta: **"Você quer contar o que aconteceu?"**
- Opção 1: **"Quero contar o que aconteceu"**. Ela abre o texto livre (até 4000 caracteres, como hoje),
  com as perguntas-guia acima do campo:
  > Algumas perguntas que ajudam: havia placa de velocidade no trecho? Você conhece a via? Houve alguma
  > emergência? Conte só o que você viveu ou viu, com as suas palavras — se não tiver certeza de algo,
  > diga isso.
- Opção 2: **"Não tenho uma versão própria — quero a defesa pelos dados do auto"**, com um botão "?"
  que abre um popover acessível (shadcn `Popover`, funciona com toque):
  > Sem uma versão própria, a defesa se apoia só nos dados do auto: o enquadramento, os números, a
  > consistência do auto e os requisitos que a lei exige dele. Quando você não sabe dizer o que levou à
  > autuação, essa costuma ser a escolha mais segura: um relato vago ou incerto não ajuda e pode
  > enfraquecer a defesa.
- Erro, sem escolha: "Escolha uma das opções." Com a opção 1 e o texto vazio: "Conte o que aconteceu ou
  escolha a defesa pelos dados do auto."

### 4.6 Tela de resumo

Quatro blocos, nesta ordem:

1. **Seu caso.** Estágio e "faltam N dias para a data-limite (dd/mm/aaaa)"; com 0 dias, "a data-limite
   é hoje".
2. **O que a defesa vai pedir.** Os pedidos na ordem da peça (§5), em linguagem simples, e o destaque:
   - **arquivamento** (a considerada não passa da permitida):
     > A defesa pede o arquivamento do auto: a velocidade considerada no próprio auto não passa da
     > permitida. **Pelos números do seu auto, este é o pedido com mais chance de ser aceito.**
   - **desclassificação** (o auto enquadrou num inciso mais grave do que a conta dá):
     > A defesa pede, em ordem: (a) o arquivamento do auto; (b) se ele for negado, a desclassificação
     > para o inciso {conta} do art. 218[; (c) a advertência no lugar da multa]. **Pelos números do seu
     > auto, o pedido com mais chance de ser aceito é a desclassificação** — os outros continuam no
     > pedido e podem ser acolhidos.
   - **neutro com inciso I** (infração média):
     > A defesa pede, em ordem: (a) o arquivamento do auto; (b) a advertência no lugar da multa. **Se
     > você não teve outra infração nos últimos 12 meses, a advertência é o pedido com mais chance de
     > ser aceito** — a lei diz que ela deverá ser aplicada nesse caso (art. 267) —, e o arquivamento
     > continua no pedido.
   - **neutro sem destaque** (inciso II ou III sem desclassificação, enquadramento fora do art. 218 ou
     ausente):
     > A defesa pede o arquivamento do auto, com base na consistência do auto e nos requisitos que a
     > lei exige dele.
   - O item da advertência "[; (c) …]" só entra quando o inciso final é o I (o da conta, na
     desclassificação; o do auto, no neutro). Na desclassificação para o I, acrescenta-se ao destaque:
     "Se você não teve outra infração nos últimos 12 meses, depois da desclassificação cabe ainda a
     advertência (art. 267)."
   - Com "Não, outra pessoa dirigia", o texto da advertência diz "a advertência no lugar da multa, caso
     você venha a ser considerado responsável", como na peça.
3. **O que a lei garante a quem recorre dentro do prazo:**
   - defesa prévia:
     > - A multa ainda não foi aplicada: ela só pode ser depois que a defesa for julgada (art. 282).
     > - Os pontos só vão para a sua CNH se a decisão final for contra você (art. 290).
     > - O licenciamento e a transferência do veículo não ficam bloqueados por ela enquanto o processo
     >   corre (art. 284, § 3º).
   - recurso à JARI:
     > - O recurso suspende a penalidade até ser julgado (art. 285).
     > - Os pontos só vão para a sua CNH se a decisão final for contra você (art. 290).
     > - O licenciamento e a transferência do veículo não ficam bloqueados por ela enquanto o processo
     >   corre (art. 284, § 3º).
     > - Você pode pagar a multa com 20% de desconto até o vencimento e recorrer mesmo assim; se o
     >   recurso for aceito, o valor volta corrigido (arts. 284, § 2º, e 286, § 2º).
4. **Preço e botão.** O mesmo cronômetro promocional e a mesma escolha de preço de hoje (`use-promo`,
   `createCheckout`), com o botão para o Stripe e o link "Revisar respostas", que volta ao passo 1.

Nota fixa ao pé da tela, em `.form-hint`: **"O resultado depende da análise do órgão; nenhuma defesa tem
resultado garantido."**

### 4.7 Tela de prazo vencido

- Defesa prévia:
  > **O prazo da defesa prévia passou, mas o processo não acabou.** Quando a multa for aplicada, você
  > vai receber a notificação de penalidade, com um prazo novo — de pelo menos 30 dias — para recorrer
  > à JARI (art. 282, § 4º). Volte aqui quando ela chegar: o recurso apresentado dentro do prazo
  > suspende a penalidade até ser julgado.
- Recurso à JARI:
  > **O prazo para recorrer à JARI passou.** Um recurso apresentado fora do prazo não suspende a multa e
  > é arquivado (art. 285, §§ 1º e 5º), então não vamos cobrar por uma peça que não teria efeito.
  > Confira a data com atenção: se você digitou errado, volte e corrija.
- Botões: "Corrigir a data" (volta ao passo 2) e "Voltar ao início".

## 5. A peça: a nova ordem do pedido

Em `peca.pedido`, para o caso de desclassificação (os outros casos já começam pelo arquivamento e não
mudam):

| Ordem | Defesa prévia | Recurso à JARI |
|---|---|---|
| a) | o arquivamento do Auto de Infração nº X por inconsistência, nos termos do art. 281, § 1º, I, do CTB; | o provimento deste recurso, com o cancelamento da penalidade imposta e o arquivamento do Auto de Infração nº X por inconsistência, nos termos do art. 281, § 1º, I, do CTB; |
| b) | subsidiariamente, a desclassificação da infração para o art. 218, N, do CTB, compatível com a velocidade considerada no próprio auto; | subsidiariamente, a desclassificação da infração para o art. 218, N, do CTB, compatível com a velocidade considerada no próprio auto, com a readequação da penalidade; |
| c) | a advertência, quando couber, como hoje (condicional se outra pessoa dirigia) | idem |

O código escreve o pedido; nenhum texto vai ao modelo. A conferência não se aplica (as citações do
pedido já estão na base: arts. 218, 267 e 281).

## 6. Os dados

### 6.1 No navegador (`src/lib/questionario.ts`)

```ts
type RespostasQuestionario = {
  versao_formato: 1;
  estagio: string;                 // um dos valores de ESTAGIOS, ou ''
  data_limite: string;             // 'AAAA-MM-DD', ou ''
  cliente_conduzia: '' | 'sim' | 'nao';
  multa_de_radar: '' | 'sim' | 'nao';
  amparo_legal: string;
  velocidade_permitida: string;    // dígitos, como no formulário
  velocidade_aferida: string;
  velocidade_considerada: string;
  versao: '' | 'propria' | 'sem_versao';
  justificativa: string;
};
```

- Gravadas em `localStorage['questionario_atual']` a cada passo. Ao voltar a `/questionario`, o
  cliente continua de onde parou.
- No clique para pagar, depois que `createCheckout` devolve o `case_id` (ele já o devolve e já o
  guarda), as respostas são **copiadas para `localStorage['questionario_<case_id>']`**. Duas compras
  seguidas no mesmo navegador nunca trocam as respostas.
- `/form?case_id=…` lê `questionario_<case_id>` e preenche "Suas respostas". O rascunho do formulário
  (`rascunho_form_<case_id>`), se existir, prevalece campo a campo, porque é mais recente.
- Depois do envio com sucesso, as duas chaves (`questionario_<case_id>` e `questionario_atual`) são
  apagadas.
- Toda função de gravação recebe o armazenamento como parâmetro (um `Storage` ou equivalente), para os
  testes rodarem fora do navegador. Armazenamento bloqueado ou cheio: o questionário segue só na
  memória, e o formulário cai no caminho de quem não fez o questionário. Nenhuma falha de gravação
  impede o pagamento.
- Um objeto lido com `versao_formato` diferente de 1, ou malformado, é descartado.

### 6.2 Do navegador ao banco

Todas as respostas vão em colunas que já existem, menos a data-limite:

| Resposta | Coluna |
|---|---|
| estágio | `especie_documento` |
| quem dirigia | `cliente_conduzia` (`'sim'` → `true`, `'nao'` → `false`) |
| enquadramento | `amparo_legal` |
| velocidades | `velocidade_permitida`, `velocidade_aferida`, `velocidade_considerada` |
| versão própria + texto | `justificativa` |
| sem versão | `justificativa = null` |
| data-limite | **nova:** `data_limite_protocolo` |

`multa_de_radar` não vai ao banco: só decide se o questionário pede as velocidades.

### 6.3 Migration

`supabase/migrations/20261007000000_data_limite_protocolo.sql`, no molde de
`20261005000000_cliente_conduzia.sql`:

```sql
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS data_limite_protocolo date;

COMMENT ON COLUMN public.form_submissions.data_limite_protocolo IS
  'Data-limite impressa na notificação (defesa prévia ou recurso), informada pelo cliente no questionário ou no formulário. Usada no e-mail ("protocole até dd/mm/aaaa"). NULL em casos anteriores ao campo e quando a Edge recebe valor inválido.';
```

`date`, e não `timestamptz`: é uma data de calendário impressa no papel, não um instante (mesmo
raciocínio de `data_infracao`).

### 6.4 Edge (`form-submit`)

- `campos.ts` ganha `dataLimiteProtocolo(valor: unknown): string | null`: só uma string `AAAA-MM-DD`
  que seja data de calendário válida passa; o resto vira `null`, sem recusar o envio.
- Gravada nos dois ramos pelo `updateFields`; **fora do `dup_guard`**, pela regra do hash.

### 6.5 Pipeline

- `peca.pedido`: a nova ordem (§5).
- `corpo_do_email`: com `data_limite_protocolo`, o passo 3 vira "3. Protocole no órgão de trânsito até
  dd/mm/aaaa, a data-limite que consta da sua notificação — no balcão, pelos Correios ou pelo site do
  órgão, conforme ele aceitar." Sem a data, o texto de hoje.
- O worker não muda: o caso inteiro já chega a `corpo_do_email` e `pedido`. `data_limite_protocolo`
  entra em `CAMPOS_INTERNOS` (`prompt.py`): não tem papel na redação, e uma data a mais no contexto
  compete com a data da infração.

## 7. O diagnóstico (`src/lib/diagnostico.ts`)

Espelho em TypeScript da decisão que o pipeline toma, só para o art. 218:

1. **Inciso do auto**, lido do enquadramento com a mesma gramática de `parse_ref`
   (`CTB-compilado_files/consulta.py`): aceito só o art. 218 sem sufixo, sem parágrafo e sem alínea,
   com inciso I, II, III ou sem inciso. Qualquer outra coisa (outro artigo, texto livre, código como
   "7455-0") significa "fora do art. 218": sem diagnóstico de velocidade.
2. **Situação**, como `velocidade.bloco_velocidade`:
   - sem velocidade permitida ou considerada (inteiros positivos), ou com a considerada maior que a
     aferida: sem diagnóstico;
   - excesso = (considerada − permitida) / permitida, em aritmética exata (sem ponto flutuante:
     comparar `100 × (considerada − permitida)` com `20 × permitida` e `50 × permitida`);
   - excesso ≤ 0: **arquivamento**;
   - inciso da conta I (≤ 20%), II (≤ 50%), III (> 50%); com inciso do auto mais grave que o da conta:
     **desclassificação**; senão, **neutro**.
3. **Pedidos e destaque**, como no §4.6, com a advertência quando o inciso final é o I.

**Paridade com o pipeline:** `tests/compartilhados/velocidade.json` lista casos com `amparo_legal`,
velocidades e o resultado esperado (`situacao`: `arquivamento` | `desclassificacao` | `neutro` |
`nenhum`, mais `inciso_do_auto` e `inciso_da_conta`). O mesmo arquivo roda:

- no Python (`pipeline/test_diagnostico_paridade.py`), pelo caminho real do worker: `montar_base` para
  o enquadramento e `bloco_velocidade` para a situação;
- no TypeScript (`src/lib/diagnostico.test.ts`, coberto pelo `npm run radar:test`), pelo
  `diagnostico.ts`.

Os casos cobrem, no mínimo: "Art 218, II, CTB", "art. 218, inciso I", "218 III", "Art. 218 do CTB" (sem
inciso), "art. 218, II, a" (alínea, inexistente), "218, § 1º", "Art. 230, V" (outro artigo), "7455-0",
texto livre e vazio; os limites exatos de 20% e 50% (96/80 é I; 97/80 é II; 120/80 é II; 121/80 é III);
considerada igual à permitida (arquivamento) e maior que a aferida (nenhum).

## 8. O formulário (`src/pages/Form.tsx`)

- Os campos que o questionário cobre passam para o fieldset novo **"Suas respostas"**, no topo, antes
  de "Identificação", preenchido com `questionario_<case_id>` e editável: estágio, data-limite, quem
  dirigia, enquadramento, velocidades, versão e relato.
- Campo novo de data-limite, com a mesma dica do §4.2, obrigatório.
- A opção de versão (duas opções exclusivas, com o "?") substitui o campo único de hoje. O relato só é
  obrigatório com "Quero contar o que aconteceu".
- "Sem versão" envia `justificativa: null`.
- O fieldset "Autuação" fica com o que o questionário não pede: órgão, nº do auto, nº da notificação,
  data e hora, local, expedida em, descrição e números do medidor.
- Depois do envio com sucesso, apaga as chaves do questionário (§6.1).

## 9. A página inicial (`src/pages/Home.tsx`)

- Os botões de compra (topo e fechamento) navegam para `/questionario` em vez de chamar
  `iniciarCheckout`.
- A lógica de checkout (`iniciarCheckout`, com o preço promocional e o tratamento de erro do
  `createCheckout`) passa para a tela de resumo, num hook compartilhado
  (`src/hooks/use-checkout.ts`), para não haver duas cópias.

## 10. Erros

- Armazenamento bloqueado: o questionário funciona em memória; o formulário abre vazio (§6.1).
- Falha do `createCheckout` na tela de resumo: o mesmo tratamento de erro de hoje, na própria tela, sem
  perder as respostas.
- Data-limite inválida digitada: erro no passo 2; na Edge, vira `null`.
- `/form` com `questionario_<case_id>` malformado: descartado, caminho sem questionário.
- Nenhum caminho novo para `failed` no pipeline.

## 11. Testes

- **Paridade** (§7): o arquivo de casos compartilhado, no Python e no TypeScript.
- **`src/lib/questionario.test.ts`:**
  - dias restantes e vencimento (hoje vale, ontem venceu), sem depender do fuso;
  - a cópia por `case_id`;
  - duas compras seguidas sem misturar respostas;
  - armazenamento que lança exceção;
  - objeto com outra `versao_formato` descartado;
  - a limpeza depois do envio.
- **`src/lib/diagnostico.test.ts`:** pedidos e destaque em cada situação, com e sem advertência, com
  "sim" e "não" no condutor.
- **`supabase/functions/form-submit/campos.test.ts`:** `dataLimiteProtocolo` com data válida, data
  impossível (`2026-02-30`), formato errado, número e ausente.
- **`pipeline/test_peca.py`:** a nova ordem na defesa e no recurso; os testes que fixam a ordem antiga
  são atualizados primeiro, para falharem antes da mudança; e o passo 3 do e-mail com e sem data.
- **`pipeline/test_prompt.py`:** `data_limite_protocolo` em `CAMPOS_INTERNOS`.
- **No navegador (Playwright):**
  - o questionário completo nos quatro diagnósticos, até o botão do Stripe, sem pagar;
  - as duas telas de prazo vencido;
  - o "?" abre e fecha com teclado e com clique;
  - `/form` preenchido a partir das respostas;
  - `/form` sem questionário;
  - o relato opcional com "sem versão".
- **Sem rodada no DeepSeek:** nada muda no que o modelo recebe. A ordem do pedido e o e-mail são
  escritos pelo código, e o caminho sem relato já foi validado.
- `npm run lint` e `npm run build` limpos.

## 12. Documentação e deploy

- **`CLAUDE.md`:**
  - o fluxo novo (página inicial → questionário → Stripe → formulário);
  - a invariante de que `diagnostico.ts` espelha `velocidade.py` e `parse_ref` pelos casos
    compartilhados, e quem mudar um lado muda o outro e o arquivo de casos;
  - a nova ordem do pedido;
  - nove migrations;
  - `ESTAGIOS` em `src/lib/estagios.ts`, com a mesma exigência de bater com `DEFESA_PREVIA` e
    `RECURSO_JARI`.
- **`PENDENCIAS.md`:**
  - saem as perguntas-guia e a opção "não tenho versão própria";
  - entram os projetos 2 (consulta ao radar antes do pagamento) e 3 (defesa em nome do condutor),
    ligado à pendência do cliente que dirigia sem ser dono.
- **`PROGRESSO.md`:** a sessão.
- **Deploy**, na ordem de sempre: `npx supabase db push`, depois
  `npx supabase functions deploy form-submit`. O pipeline segue local até o #11; o front entra no ar
  com a hospedagem do frontend (`PENDENCIAS.md`).

## 13. Fora do escopo

- A consulta ao radar antes do pagamento (projeto 2).
- A defesa em nome do condutor e os dados de quem dirigia (projeto 3). Até lá, com "não", a peça sai em
  nome do cliente, sem dizer quem dirigia (a correção da peça do teste de 07/10, que repetiu "seu filho
  dirigia", é tratada à parte; ver `PENDENCIAS.md`).
- O contador de funil.
- Perguntas fechadas no lugar do relato livre.
- Lembrete por e-mail para quem caiu na tela de prazo vencido.

## 14. Critério de pronto

- todos os testes do §11 passando, com o lint e o build limpos;
- a paridade Python × TypeScript verde no arquivo de casos;
- as verificações de navegador do §11 feitas;
- a migration e a `form-submit` publicadas e conferidas pelo conector;
- um teste ponta a ponta pela rota B: questionário, pagamento e formulário enxuto, com a peça trazendo
  o arquivamento em a) e o e-mail com "protocole até dd/mm/aaaa";
- a documentação do §12 atualizada.
