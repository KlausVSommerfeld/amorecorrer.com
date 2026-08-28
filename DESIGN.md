---
name: Amo Recorrer
description: A linguagem visual da notificação de autuação, virada contra ela — campo rotulado, filete, código monoespaçado e carimbo.
colors:
  verde-autuacao: "#186048"
  verde-autuacao-fundo: "#134D3A"
  verde-protocolo: "#006030"
  tinta-carimbo: "#155640"
  salvia-margem: "#609078"
  salvia-clara: "#A8C0A8"
  papel-talao: "#F0F0D8"
  vermelho-infracao: "#D83030"
  vermelho-prazo: "#BA2C2C"
  branco-folha: "#FFFFFF"
  grafite-texto: "#222222"
  verde-secundario-texto: "#3D5C4D"
  filete: "#CFDED6"
  contorno-campo: "#609078"
  faixa-verde: "#186048"
  faixa-verde-fundo: "#134D3A"
  faixa-tinta: "#FFFFFF"
  faixa-papel: "#F0F0D8"
  tinta-de-sombra: "#186048"
typography:
  display:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 6.2vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.6vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  lead:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 2.2vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.16em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  document:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
rounded:
  sharp: "0px"
  md: "2px"
  default: "4px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "64px"
  section-lg: "80px"
components:
  button-solid:
    backgroundColor: "{colors.verde-autuacao}"
    textColor: "{colors.branco-folha}"
    rounded: "{rounded.default}"
    padding: "12px 24px"
  button-solid-hover:
    backgroundColor: "{colors.verde-autuacao-fundo}"
    textColor: "{colors.branco-folha}"
  button-inverse:
    backgroundColor: "{colors.faixa-papel}"
    textColor: "{colors.faixa-verde}"
    rounded: "{rounded.default}"
    padding: "12px 24px"
  button-inverse-hover:
    backgroundColor: "{colors.salvia-clara}"
    textColor: "{colors.faixa-verde}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.verde-autuacao}"
    rounded: "{rounded.default}"
    padding: "12px 24px"
  button-disabled:
    backgroundColor: "{colors.papel-talao}"
    textColor: "{colors.verde-secundario-texto}"
    rounded: "{rounded.default}"
    padding: "12px 24px"
  input:
    backgroundColor: "{colors.branco-folha}"
    textColor: "{colors.grafite-texto}"
    rounded: "{rounded.default}"
    padding: "12px 16px"
  input-readonly:
    backgroundColor: "{colors.papel-talao}"
    textColor: "{colors.grafite-texto}"
    rounded: "{rounded.default}"
    padding: "12px 16px"
  field-label:
    textColor: "{colors.verde-secundario-texto}"
    typography: "{typography.label}"
  choice:
    backgroundColor: "{colors.branco-folha}"
    textColor: "{colors.grafite-texto}"
    rounded: "{rounded.default}"
    padding: "16px"
  choice-selected:
    backgroundColor: "{colors.papel-talao}"
    textColor: "{colors.grafite-texto}"
    rounded: "{rounded.default}"
    padding: "16px"
  alert-error:
    backgroundColor: "{colors.branco-folha}"
    textColor: "{colors.vermelho-infracao}"
    rounded: "{rounded.default}"
    padding: "16px"
  card:
    backgroundColor: "{colors.branco-folha}"
    textColor: "{colors.grafite-texto}"
    rounded: "{rounded.default}"
    padding: "20px"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-carimbo}"
    rounded: "{rounded.sharp}"
    padding: "6px 12px"
  skip-link:
    backgroundColor: "{colors.branco-folha}"
    textColor: "{colors.verde-autuacao}"
    typography: "{typography.label}"
    rounded: "{rounded.default}"
    padding: "8px 16px"
  theme-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.verde-secundario-texto}"
    typography: "{typography.label}"
    padding: "6px 0"
    height: "24px"
---

# Design System: Amo Recorrer

## Overview

**Creative North Star: "Notificação e Resposta"**

O sistema não ilustra o problema — ele o cita. A página é construída com o vocabulário visual do documento que o usuário tem na mão: campo rotulado em mono minúsculo, filete de 1px separando linhas, código monoespaçado, papel creme, carimbo. Quem chega já passou os últimos minutos lendo uma notificação de autuação; a interface fala a mesma língua, e é por isso que ela é lida como legítima antes de ser lida como site.

O caráter é **calmo sob pressão**. O usuário está com prazo, irritado e frequentemente no celular. Nada aqui encena a urgência que ele já sente: o cronômetro não pulsa, o vermelho aparece em três lugares e some, os botões não se mexem. A firmeza vem da estrutura — filete, rótulo, alinhamento — e não do volume. A segunda metade do caráter é **material e tátil**: os objetos que representam papel se comportam como papel. A réplica do auto tem rotação e sombra longa, a folha do recurso pousa por cima dela, o carimbo cai por último. Esses três momentos concentram toda a ousadia do sistema; o restante é filete, campo e tipografia.

A semântica de cor é o eixo moral da direção e não se negocia: **vermelho é a multa e o prazo; verde é o recurso e o protocolado**. Nada que o produto entrega aparece em vermelho, e nada que o órgão autuador cobra aparece em verde.

O sistema tem **dois temas**, e o escuro não é uma inversão: é a **segunda via**. O papel creme do talão vira via carbonada, o creme reaparece como tinta, e a faixa verde continua verde. A metáfora do impresso sobrevive à troca porque ela nunca dependeu de a página ser branca.

**Key Characteristics:**
- O documento como material: papel creme, filete, carimbo, sombra tingida de verde.
- Três famílias com fronteiras rígidas — grotesca institucional, mono para dado, serifa só dentro da peça.
- Rótulo mono em caixa alta como átomo repetido, copiado da notificação.
- Cantos de 4px ou nenhum; nenhuma bolha.
- Movimento reservado a uma única sequência, uma única vez, no load.
- Dois temas construídos da mesma paleta fechada — o claro é o impresso, o escuro é a via carbonada.
- Contraste AA verificado numericamente **nos dois temas** como condição de commit.

## Colors

A paleta inteira foi extraída do favicon (`public/favicon-v2-64.png`) e é **vinculante**: nenhum matiz novo entra no sistema, só papéis novos. Os valores vivem em `src/index.css` como triplas HSL sem função (`--primary: 160 60% 23.5%`), resolvidas por `hsl(var(--x))` no Tailwind; o frontmatter acima traduz para hex por portabilidade.

O frontmatter carrega o **tema claro**, que é o canônico. O tema escuro está descrito por extenso mais abaixo e usa exatamente os mesmos ângulos de matiz (160, 150, 120, 60 e 0) em outras luminosidades — a regra do matiz fechado vale igual nos dois.

### Primary
- **Verde Autuação** (#186048): a marca. Botão sólido, rodapé, borda superior da folha do recurso, nome do bloco no formulário, links das páginas legais, anel de foco, borda e `accent-color` da opção escolhida. É também a **fonte de toda sombra** do sistema, em opacidade baixa.
- **Verde Autuação Fundo** (#134D3A): estado hover do botão sólido e ponto final do único gradiente do site, na faixa de fechamento.
- **Verde Protocolo** (#006030): o verde mais fechado da paleta, reservado a confirmação e sucesso. Não é decorativo — só aparece quando algo deu certo.
- **Tinta de Carimbo** (#155640): exclusivo do carimbo `PROTOCOLADO`. Verde da marca aprofundado, nunca usado em texto corrido.
- **Faixa Verde** (#186048) e **Faixa Verde Fundo** (#134D3A): a superfície da faixa de fechamento e do rodapé, e o ponto final do único gradiente do site. No tema claro coincidem com Verde Autuação e Verde Autuação Fundo; existem separadas porque no escuro elas seguem caminhos opostos — a faixa continua verde e o botão clareia. Ver **A Regra da Faixa**.

### Secondary
- **Sálvia de Margem** (#609078): apoio sobre fundo claro. Nunca sobre verde — foi exatamente esse par que reprovou em contraste a 2,05:1 antes da correção.
- **Sálvia Clara** (#A8C0A8): hover do botão invertido, sobre fundo verde.

### Tertiary
- **Vermelho Infração** (#D83030): a multa. O filete de 3px no topo da réplica do auto, a borda do campo inválido, a mensagem de erro. Aparece pouco e sempre significando problema.
- **Vermelho Prazo** (#BA2C2C): o relógio correndo — cronômetro e valor da multa. Versão escurecida do anterior, para passar AA em texto. Substituiu um laranja (`38 92% 50%`) que nunca esteve na paleta.

### Neutral
- **Papel do Talão** (#F0F0D8): o creme do documento. É material, não fundo genérico: veste a réplica do auto, alterna com o branco para separar seções, preenche a opção escolhida e o campo preenchido pelo sistema, e vira a cor de texto e de botão sobre o verde.
- **Branco Folha** (#FFFFFF): a folha limpa. Fundo de página, de cartão, da peça gerada e do bloco de erro sobre a faixa verde.
- **Grafite** (#222222): texto principal. Não é preto puro.
- **Verde Secundário de Texto** (#3D5C4D): todo texto de apoio, rótulo e legenda. Escurecido de 47% para 30% de luminosidade porque o valor original reprovava a 3,15:1 sobre papel creme.
- **Filete** (#CFDED6): a linha de 1px que faz quase todo o trabalho de separação no sistema.
- **Contorno de Campo** (#609078): borda de input e de opção não escolhida. É a Sálvia de Margem no papel de contorno — mesmo valor, papel diferente. Era um cinza-verde claro (#D6E0DB) que dava 1,35:1 contra o branco: de toda a faixa da paleta, este é o único valor que passa nos 3:1 do SC 1.4.11 **e** continua passando sobre o papel creme do campo somente-leitura (3,65:1 e 3,15:1). Note que ele é mais escuro que a borda do próprio bloco de formulário: o campo é o que se opera, e por isso é ele que se delimita.
- **Papel da Faixa** (#F0F0D8) e **Tinta da Faixa** (#FFFFFF): o material claro que vive **sobre** a faixa verde — fundo do botão invertido, rótulos, filetes e texto principal do fechamento e do rodapé. No claro são o papel do talão e o branco da folha; no escuro continuam claros, enquanto o papel da página escurece.
- **Tinta de Sombra** (#186048): a cor de toda sombra do sistema. É token próprio, e não o verde da marca por referência, porque no tema escuro a sombra precisa fechar para quase preto enquanto o verde da marca clareia.

### O tema escuro

O escuro é a **via carbonada** do impresso. Três movimentos e nada mais: o fundo da página é o verde da marca no fundo do poço, o papel creme do talão vira carbono, e o creme volta como a tinta que escreve. A faixa verde permanece verde e permanece o bloco mais claro da tela; o que muda de lado é o botão, que clareia para a Sálvia Clara porque o verde da marca não se separa o bastante de um fundo escuro para virar botão (1,3:1).

| Papel | Claro | Escuro |
|---|---|---|
| Fundo da página | #FFFFFF | **#09100E** |
| Texto principal | #222222 | **#ECECDF** — o creme do talão virou tinta |
| Cartão / folha | #FFFFFF | **#141F1B** |
| Papel do talão | #F0F0D8 | **#1C2621** — a via carbonada |
| Texto de apoio | #3D5C4D | **#A9BCA9** |
| Ação (botão sólido) | #186048 | **#A9C6A9** com tinta #0B221B |
| Faixa verde | #186048 → #134D3A | **#1B4B3B → #133529** |
| Papel sobre a faixa | #F0F0D8 | **#E5E5D1** |
| Vermelho da multa | #D83030 | **#E56C6C** |
| Prazo / valor | #BA2C2C | **#E77474** |
| Carimbo | #155640 | **#AECBAE** |
| Filete | #CFDED6 | **#313F38** |
| Contorno de campo | #D6E0DB | **#5C7A6B** |
| Tinta de sombra | #186048 | **#020806** |

A classe `.dark` é decidida por um script inline no `index.html`, **antes da primeira pintura**: o `next-themes` só aplica a classe num efeito do React, e sem o script quem usa o sistema no escuro vê a página clara durante o carregamento. `color-scheme` acompanha, para que barra de rolagem, caret e controles nativos venham no tema certo.

Vinte e nove pares de contraste foram medidos na página viva, nos dois temas, sem nenhuma reprovação. O pior é o valor da multa sobre o papel do talão: 5,21:1 no claro, 5,30:1 no escuro.

### Named Rules

**A Regra da Via Carbonada.** O tema escuro é uma segunda via do mesmo documento, não a foto em negativo dele. Cada token escuro se justifica pelo papel que exerce — carbono, tinta, faixa — e não por ser o complemento aritmético do claro. Se um valor escuro só puder ser explicado como "o inverso do claro", ele está errado.

**A Regra da Faixa.** A faixa verde tem tokens próprios (`--band`, `--band-deep`, `--band-ink`, `--band-paper`) e nunca é pintada com `--primary`. Os dois papéis divergem: no escuro a faixa continua verde e o botão clareia. Pelo mesmo motivo, texto sobre a faixa usa `band-paper` e nunca o `paper` da página — este escurece junto com o tema e sumiria de cima do verde.

**A Regra dos Dois Lados.** Vermelho pertence ao órgão autuador — a multa, o prazo, o erro. Verde pertence ao usuário — o recurso, o protocolo, o sucesso. Um elemento nunca troca de lado para chamar atenção.

**A Regra do Eixo Invisível.** O eixo vermelho×verde **não existe** para quem tem daltonismo vermelho-verde, e é justamente o eixo moral desta direção. Medido por simulação dicromática: sob protanopia, o Vermelho Prazo e o Verde Protocolo caem em #5B5B2A e #585830 — **1,04:1 um do outro**, a mesma cor para todos os efeitos; sob deuteranopia, 1,73:1. Consequência: **nenhum estado deste sistema pode ser comunicado só pelo matiz.** Todo sinal vermelho ou verde carrega junto uma palavra ou um glifo — o asterisco no rótulo obrigatório, a frase sob o campo inválido, o "Pagamento confirmado" no trilho, o `:checked` no cartão de opção, o texto do carimbo. A semântica de cor é para quem a enxerga; para os outros, o texto tem de bastar sozinho.

**A Regra do Matiz Fechado.** A paleta está encerrada nos oito matizes do favicon. Uma necessidade nova se resolve com um papel novo ou uma luminosidade nova, nunca com um matiz novo. Um laranja e um cinza azulado já entraram por descuido e já foram removidos.

**A Regra do Neutro Enviesado.** Não existe cinza neutro neste sistema. Todo neutro é puxado para o verde da marca (matiz 150–160), inclusive bordas e texto secundário. Um `#E5E7EB` de biblioteca destoa visivelmente.

**A Regra do Par Verificado.** Toda combinação nova de texto sobre fundo passa por cálculo de contraste antes do commit. Duas falhas reais já existiram aqui e nenhuma foi visível a olho nu.

**A Regra do Alerta Opaco.** Uma superfície de erro a 10% de opacidade funciona sobre papel e desaparece sobre a faixa verde. Todo bloco de alerta que possa cair sobre fundo colorido fecha o fundo para branco (`.error-message--surface`) em vez de confiar na transparência. A regra vale para qualquer superfície sobre a faixa, não só para alertas: a faixa da oferta era uma moldura vazada, e com isso o preço riscado e o preço atual ficavam a 1,16:1 **um do outro** — ambos legíveis contra o verde, indistinguíveis entre si, justamente onde a diferença entre os dois é a informação. Fechada em papel, a distância volta aos 2,15:1 que o hero sempre teve.

## Typography

**Display Font:** Archivo Variable (com `system-ui`, `sans-serif`)
**Body Font:** Archivo Variable — mesma família, pesos diferentes
**Label/Mono Font:** IBM Plex Mono (com `ui-monospace`, `Menlo`)
**Document Font:** Source Serif 4 (com `Georgia`, `serif`)

Todas auto-hospedadas via `@fontsource`, importadas em `src/main.tsx` antes do CSS — nenhuma requisição a CDN no caminho crítico.

**Character:** Archivo é grotesca de sinalização: institucional, densa, com contraforma fechada, o tipo de letra que já aparece em placa e em formulário oficial. IBM Plex Mono carrega tudo que é dado inspecionável. Source Serif 4 existe para uma coisa só — o interior do documento gerado — e a fronteira entre as três é o que impede o sistema de virar um site genérico com fonte bonita.

### Hierarchy
- **Display** (800, `clamp(2.25rem, 6.2vw, 4.5rem)`, altura 0.98, entreletra -0.03em): só o título do hero. Uma ocorrência por site. Em viewport baixa cai para `clamp(1.75rem, 4.4vw, 2.5rem)`.
- **Headline** (800, `clamp(1.75rem, 3.6vw, 2.5rem)`, altura 1.1, entreletra -0.02em): título de seção, título de página interna e a faixa de fechamento. Os três compartilham exatamente o mesmo valor.
- **Title** (700, 1rem): etapa da trilha, pergunta do FAQ, subtítulo de página legal, nome da opção escolhível.
- **Lead** (400, `clamp(1.0625rem, 2.2vw, 1.25rem)`, altura 1.5, máx. 44ch): o parágrafo sob o título do hero.
- **Body** (400, 1rem, altura 1.625): texto corrido. Largura máxima entre 54ch e 72ch conforme o contexto — nenhum parágrafo do site corre livre.
- **Label** (400, 11px, caixa alta, entreletra 0.16em): o átomo. Rótulo de campo, sobretítulo de seção, aviso sob CTA, item de menu, rodapé, legenda da folha, contador e aviso de rascunho. Entreletra cai para 0.14em em navegação, rodapé e rótulo de formulário.
- **Data** (700, 1.5rem, `tabular-nums`): preço e cronômetro. Também placa, CPF, nº do auto, `case_id` e a data devolvida por extenso, em corpo menor.
- **Document** (400, 13.5px, serifa, justificado com `hyphens: auto`): o corpo da peça, dentro da prévia do PDF.

### Named Rules

**A Regra das Três Fronteiras.** Mono é para o que se confere: código, placa, número, dinheiro, tempo, rótulo. Serifa é para o que se protocola: só dentro do documento gerado e em citação do CTB. Grotesca é todo o resto. Serifa em cromo de página é erro.

**A Regra do Dígito Estável.** Qualquer número que muda sozinho na tela usa `tabular-nums`. Um cronômetro que reflui a linha a cada segundo é defeito, não detalhe.

**A Regra do Rótulo Pequeno.** O rótulo mono é minúsculo (11px), em caixa alta e muito espaçado. Ele não compete com o valor que anuncia — ele o classifica. **11px é piso, não sugestão:** a legenda da folha era a única exceção do sistema, a 10px, e não havia razão para ela ser menor que todos os outros rótulos. Não existe mais exceção.

**A Regra do Justificado Hifenizado.** Texto justificado sem hifenização é rio. A peça corre a 13,5px numa caixa de ~42ch no celular, e o português tem palavra longa demais para isso: "atribuindo-se-lhe a condução do veículo acima em" esticava a linha inteira. Todo bloco justificado do sistema declara `hyphens: auto` e conta com o `lang="pt-BR"` que o documento já traz. Se a hifenização não for aceitável num contexto, o que sai é a justificação — não o contrário.

**A Regra do Eco em Mono.** Todo dado que um controle nativo desenha no locale do navegador — data, hora, número — é devolvido logo abaixo em mono, escrito por extenso em pt-BR. O `datetime-local` num aparelho em inglês pede `mm/dd/yyyy` sob uma página `lang="pt-BR"`, e o erro de quem digita o dia no lugar do mês é invisível até chegar impresso na peça.

## Layout

Container único de 72rem (`max-w-6xl`), com respiro de 16px no celular, 24px a partir de 640px e 32px a partir de 1024px. O plugin `container` do Tailwind está **desligado** em `tailwind.config.ts` de propósito: havia duas regras `.container` competindo, e a vencedora dependia da ordem de saída do CSS.

São três cortes de largura em uso, todos padrão do Tailwind — **640px** (`sm`, empilhado → lado a lado em faixas curtas), **768px** (`md`, o corte principal: grid de formulário em duas colunas, trilha na horizontal, hero em duas colunas, barra de CTA some) e **1024px** (`lg`, o hero abre a coluna da réplica de 20rem para 25rem) — mais dois recortes que existem por defeito real observado no aparelho:

- **768–1023px:** a coluna de texto do hero fica com ~360px e as duas células da oferta lado a lado quebravam o preço em "R$" / "19,99". Nessa faixa a oferta volta a empilhar, como no celular.
- **`max-height: 560px`:** celular deitado. A condição é **só de altura** — um iPhone deitado tem 844px de largura e entra pelo desenho de tablet, escapando de qualquer guarda presa a `max-width`. Aqui o título do hero encolhe, o respiro vertical fecha e a barra de CTA volta mesmo acima de 768px.

O ritmo vertical é grande e regular: seções respiram 64px no celular e 80px no desktop, com 40px entre o cabeçalho da seção e seu conteúdo. Dentro dos blocos a escala é a padrão de 4px, com 16px e 24px fazendo quase todo o trabalho.

A estrutura de marcos é explícita: um `<header>` que contém **só** o masthead, um `<main id="conteudo">` que embrulha as cinco seções, e um `<footer>`. Cada seção se nomeia pelo próprio título via `aria-labelledby`. O `<h1>` fica dentro do `main`, nunca dentro do `header` — o título do conteúdo não mora na moldura. Um link "Pular para o conteúdo" abre a ordem de tabulação, fora da tela até receber foco.

No hero, a ordem de empilhamento no celular é **título → réplica do auto → oferta**: a assinatura aparece cedo, mas nunca empurra o título para fora da dobra. No desktop as duas faixas de texto se colam ao centro da coluna esquerda (`self-end` / `self-start`) para que a altura sobrando da réplica não abra um vão entre título e oferta.

### Named Rules

**A Regra do Filete Contínuo.** A trilha do "como funciona" é uma sequência, não cinco ilhas: um filete de 1px atravessa as cinco etapas inteiras — vertical no celular, horizontal no desktop — nascendo no centro do primeiro marcador e morrendo no do último. Por isso a trilha usa `gap: 0` e tira o espaço do padding interno: qualquer calha no grid parte o filete.

**A Regra da Medida.** Todo texto corrido tem teto de largura declarado (44ch no lead, 46ch no aviso de compra, 54ch na abertura de seção, 68ch na resposta do FAQ, 70–72ch nas páginas legais). Nenhuma linha atravessa o container inteiro.

**A Regra da Área Segura.** Qualquer barra grudada no fundo da viewport soma `env(safe-area-inset-bottom)` ao seu padding, e o `index.html` declara `viewport-fit=cover` — sem ele o `env()` devolve 0 e a barra fica sob o indicador de home. Vale para o CTA da home e para as ações do formulário.

**A Regra da Guarda por Altura.** Uma guarda de viewport baixa se declara por `max-height` sozinha. Prendê-la a `max-width` é o erro que já aconteceu aqui: o celular deitado tem largura de tablet, e a guarda nunca disparava. A guarda em CSS, porém, só abre a possibilidade: quem acende a barra é o JavaScript, e ele precisa cobrir **os dois lados da dobra** — o CTA do hero pode ter subido e saído por cima, ou pode nascer abaixo da tela e nunca ter sido visto. Cobrindo só o primeiro caso, o usuário deitado rolava por cima de um botão que nunca viu, sem nenhum CTA em tela no caminho.

**A Regra do Alvo Invisível.** O tamanho do alvo se decide pelo ponteiro, não pela largura da tela — um laptop com tela sensível erra o alvo de 29px tanto quanto um celular. Sob `pointer: coarse`, os alvos pequenos sobem para 44px; onde isso custaria dobra, a área cresce por um pseudo-elemento e o layout fica onde estava. Medido: subir a altura de verdade no cabeçalho levava o masthead de 65px para 125px em todo celular — sessenta pixels da primeira dobra pagos por dois links secundários. No rodapé, onde não há dobra a proteger, a altura sobe de verdade.

**A Regra do Conteúdo Nomeado.** Todo conteúdo mora dentro de um marco, e todo marco tem nome. Uma seção sem `aria-labelledby` não aparece na lista de regiões do leitor de tela; três botões com o mesmo rótulo em seções sem nome são três linhas idênticas na lista de controles. Nomear a seção resolve os dois de uma vez — é mais barato que reescrever o rótulo do botão.

## Elevation & Depth

**Plano por padrão; sombra só onde há papel.** Seções, cartões, blocos de formulário e a barra de navegação são planos e se separam por filete e por alternância de fundo — branco e papel creme. A sombra não é linguagem de interface neste sistema: ela é evidência de que aquele objeto representa uma folha física. Existem exatamente quatro superfícies sombreadas — a réplica do auto, a folha do recurso pousada sobre ela, a prévia do PDF e o recibo do envio — mais a barra de CTA, que projeta para cima porque está sobre o conteúdo.

Toda sombra sai de um token só, `--shadow` (`hsl(var(--shadow) / α)`), sempre com deslocamento longo e raio grande em opacidade baixa — sombra de folha sobre mesa, não de cartão flutuante. No claro esse token é o verde da marca; no escuro fecha para quase preto (#020806), porque a mesa mudou. Presa a `--primary`, como esteve, a sombra viraria um **halo claro** no tema escuro.

### Shadow Vocabulary
- **Papel assentado** (`0 1px 2px hsl(var(--shadow)/0.08), 0 18px 36px -24px hsl(var(--shadow)/0.45)`): a réplica do auto. Um contato duro de 1px e uma difusão longa.
- **Papel pousando** (`0 -1px 3px hsl(var(--shadow)/0.06), 0 24px 44px -28px hsl(var(--shadow)/0.7)`): a folha do recurso sobre a autuação. Mais funda e com um fio de luz para cima, porque ela está por cima de outra folha.
- **Documento em repouso** (`0 1px 2px hsl(var(--shadow)/0.08), 0 20px 40px -28px hsl(var(--shadow)/0.5)`): a prévia do PDF e o recibo do envio.
- **Barra sobreposta** (`0 -10px 28px -22px hsl(var(--shadow)/0.9)`): projeta para cima, sob a barra fixa de CTA.
- **Contato de botão** (`0 1px 2px hsl(var(--shadow)/0.18)`): o único caso em que a sombra não representa papel — um contato mínimo sob as variantes sólida e invertida. Era o `shadow-sm` preto do Tailwind, a última sombra preta do sistema; agora obedece ao mesmo token que as outras.

### Named Rules

**A Regra do Papel.** Se o elemento não representa uma folha, ele não tem sombra. Separação é trabalho do filete.

**A Regra da Sombra Tingida.** Sombra preta não existe neste sistema — não há mais exceção. Toda sombra sai de `--shadow`, e nenhuma se prende a um token que exista para outra coisa: um token de sombra acompanha a mesa, um token de marca acompanha a marca, e no dia em que a mesa escurece os dois precisam poder discordar.

## Shapes

A forma é a do impresso: **canto de 4px ou canto nenhum**. `--radius` vale 0.25rem e a escala do Tailwind foi remapeada em cima dele, o que produz uma consequência que o sistema aproveita: `rounded-sm` resolve para **0px** neste projeto, e é o que dá ao carimbo e à barra de progresso a aresta viva. O único elemento redondo do sistema é o marcador numerado da trilha, um círculo de 32px com borda de filete.

A linguagem de contorno é de uma espessura só: **1px de filete** em cartão, campo, opção escolhível, bloco e separador. As exceções são semânticas e todas de 2–3px: o filete vermelho de 3px no topo da réplica do auto (a tarja do talão), a borda verde de 3px no topo da folha do recurso (a resposta), a borda de 2px do carimbo e o contorno de foco de 2px. Espessura maior que 1px, neste sistema, sempre significa alguma coisa.

O valor que o sistema preencheu sozinho (cidade e estado via ViaCEP) usa **borda tracejada** — a única do sistema: o campo existe, mas o usuário não o digitou. O traçado é declaração de origem, não de bloqueio: quando a consulta falha, ou quando o usuário pede para corrigir, o mesmo dado volta a ser um campo de borda sólida como qualquer outro.

### Named Rules

**A Regra do Canto Duro.** Documento tem canto, não bolha. Nada passa de 4px, exceto o marcador circular da trilha. `rounded-xl`, `rounded-2xl` e `rounded-full` em cartão ou botão estão fora.

**A Regra da Espessura Significante.** 1px separa; 2–3px significa. Se uma borda ficou mais grossa sem carregar sentido, ela está errada. Uma consequência prática: seleção não engrossa borda — ela troca a cor da borda e preenche o fundo com papel creme.

**A Regra do Traço de Origem.** Borda tracejada quer dizer "isto veio do sistema, não de você". É o único traçado do projeto e não deve ser reaproveitado como decoração ou como estado desabilitado.

## Components

O caráter é **tátil e confiante**: os componentes têm peso de objeto e resolvem sozinhos, sem empilhar cor por cima de cor. Hoje esse peso está no material — papel, filete, sombra longa, aresta viva — e não em resposta ao toque: as transições são só de cor, 200ms. Um hover com deslocamento nos objetos de papel seria coerente com essa direção e ainda não existe; é a expansão natural desse eixo, não uma correção.

### Buttons
- **Shape:** canto de 4px, `inline-flex`, ícone e rótulo separados por 8px.
- **Sólido:** Verde Autuação com texto branco, respiro de 12px por 24px, peso 600, contato de sombra de 1px. Hover fecha para Verde Autuação Fundo.
- **Invertido:** para uso **sobre a faixa verde** — o papel do talão vira o botão. Fundo Papel da Faixa, texto Faixa Verde; hover vai para Sálvia Clara. O contorno de foco troca para o papel da faixa, senão o anel verde desaparece no fundo verde. Os tokens são os da faixa, não os da página: ele pertence à faixa e escurece ou clareia com ela.
- **Fantasma:** texto Verde Autuação sobre transparente, com borda de filete; hover pinta o fundo de papel creme.
- **Desabilitado:** fundo papel creme, texto Verde Secundário, sem sombra, cursor bloqueado.
- **Foco:** contorno de 2px na cor da marca, deslocado 2px. Nunca removido.

### Inputs / Fields
- **Style:** superfície de cartão (branca no claro, um tom acima da página no escuro), borda de 1px em Contorno de Campo, canto de 4px, respiro de 12px por 16px. Campos de código — placa, CPF, CEP, nº do auto, RENAINF — trocam para IBM Plex Mono com entreletra aberta.
- **Rótulo:** mono, 11px, caixa alta, entreletra 0.14em, 8px acima do campo.
- **Focus:** borda muda para Verde Autuação, mais anel de 2px deslocado 1px.
- **Erro:** a borda vermelha sai de `aria-invalid="true"`, não de classe condicional — o estado visual e o estado anunciado ao leitor de tela têm uma origem só. A mensagem aparece abaixo, 14px, em Vermelho Infração, e é ela que carrega o estado para quem não distingue a borda (ver **A Regra do Eixo Invisível**). Quando a mesma exigência vale para um grupo de campos, a frase aparece **uma vez** sob o grupo e troca de dica para erro no lugar, em vez de se repetir campo a campo.
- **Auxílio e eco:** a dica fica abaixo do campo em 12px de texto de apoio; quando o campo devolve um dado interpretado (a data por extenso), o eco troca para mono e grafite, porque é um valor a conferir e não um conselho.
- **Somente leitura:** borda tracejada e fundo papel creme, para valor que o sistema preencheu — sempre acompanhado de uma saída para editar à mão.
- **Contador:** só aparece perto do teto (a partir de 75% do limite), em mono de 11px com `tabular-nums`, alinhado à direita da dica. Contador permanente é ruído.
- **Contraste da borda:** 3,65:1 no claro e 4,08:1 no escuro, contra a superfície do campo — o campo não tem preenchimento próprio que o distinga da página, então é a borda que carrega inteira a informação "aqui há um controle", e ela precisa dos 3:1 do SC 1.4.11.

### A Opção (`.choice`)
Decisão de caminho que não cabe num campo de texto: cartão de 4px com o rádio nativo à esquerda, nome em grotesca 700 e uma frase de desempate abaixo, em 12px de texto de apoio. O rótulo inteiro é o alvo — 316×108 no celular, muito acima do piso de 24px. Em repouso, borda de Contorno de Campo sobre branco; escolhido, borda de Verde Autuação sobre papel creme, com o `accent-color` do rádio na cor da marca. O anel de foco vem do `:has()` sobre o rádio, para que o cartão inteiro anuncie o foco do controle que ele embrulha.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** branco sobre página branca, separado por borda de filete; o papel creme entra quando a seção inteira alterna.
- **Shadow Strategy:** nenhuma, salvo os quatro objetos de papel listados em Elevation & Depth.
- **Internal Padding:** 20px no celular, 24px a partir de 768px.
- **Legenda do bloco:** nome em mono verde à esquerda e um filete que atravessa até a borda direita — a tarja que separa as seções da notificação.

### Alerts
Bloco de 4px com borda de 1px na cor do assunto e o mesmo respiro do cartão. O erro é Vermelho Infração; a confirmação é Verde Protocolo. A primeira linha nomeia o que falhou em peso 600, a segunda explica em grafite, e a recuperação vem logo abaixo — nunca uma frase de erro sozinha. Sobre fundo colorido, a variante de superfície fecha o fundo em branco. Todo alerta carrega `role="alert"` e recebe foco quando nasce fora da dobra.

### Navigation
- Cabeçalho de uma linha, separado do conteúdo por filete: marca à esquerda em grotesca 800 caixa alta espaçada, links à direita em mono 11px caixa alta, e a alternância de tema fechando a fila. Hover leva o link do Verde Secundário para o Verde Autuação. Sem menu hambúrguer — no celular a mesma linha encolhe, com `flex-wrap` no cabeçalho e a marca em `whitespace-nowrap` para que o nome nunca se parta em duas linhas. De 390px para cima tudo cabe em uma linha; abaixo disso os links descem, e é a marca que fica inteira.
- O rodapé inverte tudo: a faixa verde ocupa a largura toda, links em Papel da Faixa que clareiam para a Tinta da Faixa no hover, e um contorno de foco em papel.

### O Link de Pulo (`.skip`)
Primeira parada da tabulação, fora da tela até receber foco: um cartão de 4px em fundo de página, rótulo mono de 11px em Verde Autuação, deslocado 6rem para cima e trazido de volta no `:focus`. Não usa `sr-only` — precisa voltar a ocupar espaço quando aparece — nem `display: none`, que o tiraria da ordem de tabulação. A transição é de `transform`, o que o mantém legível para quem tabula rápido.

### A Alternância de Tema (`.theme-toggle`)
Um botão, não um menu: só há dois destinos. O rótulo nomeia **para onde o clique leva** ("Escuro" / "Claro"), nunca onde o usuário está. Mono de 11px em caixa alta com um ícone de traço fino de 14px, alinhado com os links do masthead. Abaixo de 640px o rótulo sai da tela e continua sendo o nome acessível do botão — com ele visível, os links caíam para uma segunda linha e comiam 33px da primeira dobra do celular; `min-w-6`/`min-h-6` seguram o piso de 24px do alvo de toque quando sobra só o ícone. Enquanto o componente não montou, um espaço da mesma largura fica reservado, para o cabeçalho não pular.

### O Campo (`.field`) — componente-assinatura
O átomo de todo o sistema, copiado direto da notificação de autuação: rótulo mono minúsculo em caixa alta, valor logo abaixo em mono, filete separando do próximo. Ele monta a réplica do auto, a faixa de preço, o cabeçalho do documento, o recibo do envio e o "você vai precisar de" sob o CTA. Quando uma informação nova precisa aparecer, a primeira pergunta é se ela cabe num campo.

### O Carimbo (`.stamp`) — componente-assinatura
Retângulo de aresta viva com borda de 2px e texto mono em caixa alta com entreletra de 0.18em, em Tinta de Carimbo. Marca o que foi protocolado — hoje diz apenas `PROTOCOLADO`, porque a folha que ele carimba é a defesa da autuação e o carimbo não deve nomear a peça errada. Nunca é vermelho, nunca é preenchido, e não se repete: um carimbo por tela.

### A Réplica do Auto (`.notice`) — componente-assinatura
A única composição do sistema que se permite rotação, sobreposição e movimento. Papel creme rotacionado -1,5°, tarja vermelha de 3px no topo, a folha do recurso em serifa pousando por cima com borda verde de 3px, e o carimbo caindo no pé. A sequência de entrada roda **uma vez, no load**, encadeada por atraso: a notificação assenta (180ms), a folha desliza (240ms, atraso 180ms), o carimbo cai (200ms, atraso 420ms). Todas com `fill-mode: both`.

A compressão do carimbo é **geometria, não mola**: os keyframes vão de 1,6 a 0,96 e voltam a 1,0 — a escala nunca ultrapassa o tamanho final —, e cada trecho tem sua própria desaceleração exponencial (`cubic-bezier(0.16, 1, 0.3, 1)` na queda, `cubic-bezier(0.33, 1, 0.68, 1)` na recuperação). Medido com o relógio da animação sob controle: 63% da queda acontece nos primeiros 20ms dos 140 — ele chega rápido e freia no contato, como borracha em papel. A versão anterior somava um `y1 = 1,4` na curva **por cima** da compressão dos keyframes: dois overshoots empilhados, que é o que faz uma animação soar a mola de brinquedo.

### Named Rules

**A Regra da Variante Única.** Um botão resolve sua cor inteiramente na variante. Empilhar utilitário de cor sobre `.btn--*` está proibido: foi exatamente essa colisão — dois valores da mesma propriedade decididos pela ordem de saída do Tailwind — que a refatoração eliminou.

**A Regra do Estado Anunciado.** O estado visual sai do atributo de acessibilidade, não o contrário. Erro vem de `aria-invalid`, expansão vem do Accordion do Radix, seleção do cartão vem de `:has(:checked)` sobre o rádio nativo. Estado desenhado à mão que o leitor de tela não enxerga é regressão.

**A Regra da Superfície Nativa.** O que o navegador desenha também é do sistema: `accent-color` no rádio, `outline` de foco, `tabular-nums` no dado, `::selection` no texto e `color-scheme` na barra de rolagem, no caret e nos controles nativos. Deixar o azul do sistema operacional no único controle nativo da página é deixar um pedaço da tela fora do projeto — e, num sistema de dois temas, `color-scheme` é o que impede uma barra de rolagem clara de aparecer colada a uma página escura.

**A Regra do Hover Opcional.** Hover é um enfeite de quem tem ponteiro fino, nunca um requisito. Sob `hover: none` todo `:hover` volta ao repouso, porque no toque ele gruda: o cartão de opção ficava com a borda da marca depois do toque, fingindo uma seleção que não existia, até o usuário tocar em outro lugar. Quem anuncia seleção é `:has(:checked)`, e ele não depende do ponteiro.

**A Regra do Propósito Declarado.** Todo campo que coleta um dado **do próprio usuário** declara o seu propósito em `autocomplete` — é o que o SC 1.3.5 exige, e é o que permite ao navegador preencher e ao leitor de tela anunciar o que o campo quer. Vale inclusive para o campo de conferência: `off` num "repita o e-mail" esconde o propósito para proteger uma checagem que não precisava de proteção — se o navegador preencheu os dois, o usuário não digitou, e não havia erro de digitação a pegar. A exceção é o dado sem token na norma (CPF, CNH): aí o propósito não é exprimível, e a ausência é honesta.

**A Regra da Forma que Sobrevive.** No alto contraste do sistema o navegador descarta fundos, imagens de fundo e sombras, e substitui cor e texto pelos do sistema. Um elemento cuja forma depende só do preenchimento **desaparece** — medido: o botão principal virava texto solto no meio da página. Todo controle declara a própria borda em `@media (forced-colors: active)`, com cor de sistema (`ButtonBorder`), e a regra vive dentro do media query para não custar um pixel no modo normal. Cartão, campo, opção, alerta, carimbo e recibo já passam porque têm filete próprio; a checagem, ao criar uma superfície nova, é uma só — *ela ainda tem forma sem o fundo?*

**A Regra da Transição Nomeada.** Uma transição declara **quais** propriedades anima. `transition: all` num controle interativo pega o `outline` junto: o gatilho do FAQ vinha assim do shadcn e, por 150ms depois de cada foco, o anel era um traço de 3px quase preto — uma cor que não existe na paleta — antes de assentar no verde do sistema. O anel de foco nunca anima.

**A Regra do Movimento Único.** Existe uma animação no site: a sequência do hero, uma vez, no load. Sob `prefers-reduced-motion`, duração vai a 0.01ms **e o atraso a -1ms** — sem isso o usuário que pediu menos movimento ainda esperaria a sequência escalonada acontecer, sem vê-la.

## Do's and Don'ts

### Do:
- **Do** manter a paleta fechada nos oito matizes do favicon; resolva necessidades novas com papel ou luminosidade, nunca com matiz novo.
- **Do** respeitar a semântica: vermelho para a multa e o prazo, verde para o recurso e o protocolado.
- **Do** usar o filete de 1px como separador padrão, antes de considerar caixa ou sombra.
- **Do** enviesar todo neutro para o verde da marca (matiz 150–160) — bordas e texto secundário inclusive.
- **Do** aplicar `tabular-nums` em qualquer número que se atualize sozinho.
- **Do** devolver em mono, por extenso e em pt-BR, todo dado que um controle nativo desenha no locale do navegador.
- **Do** calcular o contraste de todo par novo de texto sobre fundo antes de commitar, **nos dois temas**; AA é piso, não meta.
- **Do** tirar toda sombra de `--shadow`, e todo material sobre a faixa verde dos tokens `band-*`.
- **Do** decidir a classe de tema antes da primeira pintura, por script inline — um efeito do React chega tarde demais e entrega um pisca claro a quem pediu escuro.
- **Do** manter todo conteúdo dentro de um marco e dar nome a cada seção; um link de pulo abre a ordem de tabulação.
- **Do** decidir o tamanho do alvo pelo ponteiro (`pointer: coarse`), e crescer a área por pseudo-elemento quando crescer a caixa custaria dobra.
- **Do** dar à borda de todo controle os 3:1 do SC 1.4.11 — quando o controle não tem preenchimento próprio, é ela que diz que ele existe.
- **Do** derivar o estado visual do atributo de acessibilidade (`aria-invalid`, Radix, `:has(:checked)`), nunca o inverso.
- **Do** tematizar as superfícies do navegador a partir da paleta: `accent-color`, anel de foco, seleção.
- **Do** usar `.btn` mais uma variante, deixando a variante resolver a cor sozinha.
- **Do** declarar largura máxima de leitura em todo texto corrido.
- **Do** dar a todo alerta uma recuperação na mesma caixa: a frase que nomeia a falha nunca fica sozinha.

### Don't:
- **Don't** trazer estética SaaS genérica: gradiente roxo-azul, glassmorphism, cartão com canto de 16px e sombra difusa, ilustração 3D. O único gradiente permitido é o verde da faixa de fechamento.
- **Don't** trazer fofura de fintech: ilustração de personagem, emoji em botão, canto arredondado grande, tom brincalhão. O assunto é uma multa.
- **Don't** empilhar utilitário de cor sobre uma variante de botão.
- **Don't** usar Sálvia de Margem (#609078) sobre o verde da marca — reprova em contraste a 2,05:1.
- **Don't** pôr serifa em cromo de página; ela pertence ao interior do documento gerado.
- **Don't** escrever rótulo mono abaixo de 11px; a última exceção do sistema foi eliminada e não volta.
- **Don't** dar sombra a elemento que não representa uma folha de papel, nem prender sombra a um token que existe para outra coisa — `--primary` vira halo claro no tema escuro.
- **Don't** pintar a faixa verde com `--primary`, nem escrever sobre ela com o `paper` da página: os dois seguem o tema e abandonam a faixa.
- **Don't** escrever `transition: all` em controle interativo — ele anima o anel de foco junto.
- **Don't** deixar `:hover` valer sob `hover: none`: no toque ele gruda e finge um estado que não existe.
- **Don't** derivar um valor do tema escuro por inversão aritmética do claro; cada token escuro se explica pelo papel que exerce.
- **Don't** passar de 4px de canto em botão ou cartão.
- **Don't** engrossar borda para indicar seleção; troque a cor e preencha com papel creme.
- **Don't** prender uma guarda de viewport baixa a `max-width` — o celular deitado tem largura de tablet.
- **Don't** confiar em superfície translúcida para alerta que possa cair sobre fundo colorido.
- **Don't** acrescentar animação fora da sequência do hero, e nunca fazer o cronômetro pulsar.
- **Don't** empilhar overshoot: se os keyframes já comprimem, a curva desacelera e não volta a passar do alvo.
- **Don't** criar superfície cuja forma dependa só do preenchimento — no alto contraste ela some.
- **Don't** reintroduzir cinza azulado de biblioteca (`#E5E7EB` e parentes) — já saiu uma vez.
