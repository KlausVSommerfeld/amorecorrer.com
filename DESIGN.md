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
  contorno-campo: "#D6E0DB"
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
    backgroundColor: "{colors.papel-talao}"
    textColor: "{colors.verde-autuacao}"
    rounded: "{rounded.default}"
    padding: "12px 24px"
  button-inverse-hover:
    backgroundColor: "{colors.salvia-clara}"
    textColor: "{colors.verde-autuacao}"
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
  field-label:
    textColor: "{colors.verde-secundario-texto}"
    typography: "{typography.label}"
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
---

# Design System: Amo Recorrer

## Overview

**Creative North Star: "Notificação e Resposta"**

O sistema não ilustra o problema — ele o cita. A página é construída com o vocabulário visual do documento que o usuário tem na mão: campo rotulado em mono minúsculo, filete de 1px separando linhas, código monoespaçado, papel creme, carimbo. Quem chega já passou os últimos minutos lendo uma notificação de autuação; a interface fala a mesma língua, e é por isso que ela é lida como legítima antes de ser lida como site.

O caráter é **calmo sob pressão**. O usuário está com prazo, irritado e frequentemente no celular. Nada aqui encena a urgência que ele já sente: o cronômetro não pulsa, o vermelho aparece em três lugares e some, os botões não se mexem. A firmeza vem da estrutura — filete, rótulo, alinhamento — e não do volume. A segunda metade do caráter é **material e tátil**: os objetos que representam papel se comportam como papel. A réplica do auto tem rotação e sombra longa, a folha do recurso pousa por cima dela, o carimbo cai por último. Esses três momentos concentram toda a ousadia do sistema; o restante é filete, campo e tipografia.

A semântica de cor é o eixo moral da direção e não se negocia: **vermelho é a multa e o prazo; verde é o recurso e o protocolado**. Nada que o produto entrega aparece em vermelho, e nada que o órgão autuador cobra aparece em verde.

**Key Characteristics:**
- O documento como material: papel creme, filete, carimbo, sombra tingida de verde.
- Três famílias com fronteiras rígidas — grotesca institucional, mono para dado, serifa só dentro da peça.
- Rótulo mono em caixa alta como átomo repetido, copiado da notificação.
- Cantos de 4px ou nenhum; nenhuma bolha.
- Movimento reservado a uma única sequência, uma única vez, no load.
- Contraste AA verificado numericamente como condição de commit.

## Colors

A paleta inteira foi extraída do favicon (`public/favicon-v2-64.png`) e é **vinculante**: nenhum matiz novo entra no sistema, só papéis novos. Os valores vivem em `src/index.css` como triplas HSL sem função (`--primary: 160 60% 23.5%`), resolvidas por `hsl(var(--x))` no Tailwind; o frontmatter acima traduz para hex por portabilidade.

### Primary
- **Verde Autuação** (#186048): a marca. Botão sólido, rodapé, borda superior da folha do recurso, nome do bloco no formulário, links das páginas legais, anel de foco. É também a **fonte de toda sombra** do sistema, em opacidade baixa.
- **Verde Autuação Fundo** (#134D3A): estado hover do botão sólido e ponto final do único gradiente do site, na faixa de fechamento.
- **Verde Protocolo** (#006030): o verde mais fechado da paleta, reservado a confirmação e sucesso. Não é decorativo — só aparece quando algo deu certo.
- **Tinta de Carimbo** (#155640): exclusivo do carimbo `RECURSO PROTOCOLADO`. Verde da marca aprofundado, nunca usado em texto corrido.

### Secondary
- **Sálvia de Margem** (#609078): apoio sobre fundo claro. Nunca sobre verde — foi exatamente esse par que reprovou em contraste a 2,05:1 antes da correção.
- **Sálvia Clara** (#A8C0A8): hover do botão invertido, sobre fundo verde.

### Tertiary
- **Vermelho Infração** (#D83030): a multa. O filete de 3px no topo da réplica do auto, a borda do campo inválido, a mensagem de erro. Aparece pouco e sempre significando problema.
- **Vermelho Prazo** (#BA2C2C): o relógio correndo — cronômetro e valor da multa. Versão escurecida do anterior, para passar AA em texto. Substituiu um laranja (`38 92% 50%`) que nunca esteve na paleta.

### Neutral
- **Papel do Talão** (#F0F0D8): o creme do documento. É material, não fundo genérico: veste a réplica do auto, alterna com o branco para separar seções e vira a cor de texto e de botão sobre o verde.
- **Branco Folha** (#FFFFFF): a folha limpa. Fundo de página, de cartão e da peça gerada.
- **Grafite** (#222222): texto principal. Não é preto puro.
- **Verde Secundário de Texto** (#3D5C4D): todo texto de apoio, rótulo e legenda. Escurecido de 47% para 30% de luminosidade porque o valor original reprovava a 3,15:1 sobre papel creme.
- **Filete** (#CFDED6): a linha de 1px que faz quase todo o trabalho de separação no sistema.
- **Contorno de Campo** (#D6E0DB): borda de input, meio tom mais escura que o filete.

### Named Rules

**A Regra dos Dois Lados.** Vermelho pertence ao órgão autuador — a multa, o prazo, o erro. Verde pertence ao usuário — o recurso, o protocolo, o sucesso. Um elemento nunca troca de lado para chamar atenção.

**A Regra do Matiz Fechado.** A paleta está encerrada nos oito matizes do favicon. Uma necessidade nova se resolve com um papel novo ou uma luminosidade nova, nunca com um matiz novo. Um laranja e um cinza azulado já entraram por descuido e já foram removidos.

**A Regra do Neutro Enviesado.** Não existe cinza neutro neste sistema. Todo neutro é puxado para o verde da marca (matiz 150–160), inclusive bordas e texto secundário. Um `#E5E7EB` de biblioteca destoa visivelmente.

**A Regra do Par Verificado.** Toda combinação nova de texto sobre fundo passa por cálculo de contraste antes do commit. Duas falhas reais já existiram aqui e nenhuma foi visível a olho nu.

## Typography

**Display Font:** Archivo Variable (com `system-ui`, `sans-serif`)
**Body Font:** Archivo Variable — mesma família, pesos diferentes
**Label/Mono Font:** IBM Plex Mono (com `ui-monospace`, `Menlo`)
**Document Font:** Source Serif 4 (com `Georgia`, `serif`)

Todas auto-hospedadas via `@fontsource`, importadas em `src/main.tsx` antes do CSS — nenhuma requisição a CDN no caminho crítico.

**Character:** Archivo é grotesca de sinalização: institucional, densa, com contraforma fechada, o tipo de letra que já aparece em placa e em formulário oficial. IBM Plex Mono carrega tudo que é dado inspecionável. Source Serif 4 existe para uma coisa só — o interior do documento gerado — e a fronteira entre as três é o que impede o sistema de virar um site genérico com fonte bonita.

### Hierarchy
- **Display** (800, `clamp(2.25rem, 6.2vw, 4.5rem)`, altura 0.98, entreletra -0.03em): só o título do hero. Uma ocorrência por site.
- **Headline** (800, `clamp(1.75rem, 3.6vw, 2.5rem)`, altura 1.1, entreletra -0.02em): título de seção, título de página interna e a faixa de fechamento. Os três compartilham exatamente o mesmo valor.
- **Title** (700, 1rem): etapa da trilha, pergunta do FAQ, subtítulo de página legal.
- **Lead** (400, `clamp(1.0625rem, 2.2vw, 1.25rem)`, altura 1.5, máx. 44ch): o parágrafo sob o título do hero.
- **Body** (400, 1rem, altura 1.625): texto corrido. Largura máxima entre 54ch e 72ch conforme o contexto — nenhum parágrafo do site corre livre.
- **Label** (400, 11px, caixa alta, entreletra 0.16em): o átomo. Rótulo de campo, sobretítulo de seção, aviso sob CTA, item de menu, rodapé. Entreletra cai para 0.14em em navegação e rodapé.
- **Data** (700, 1.5rem, `tabular-nums`): preço e cronômetro. Também placa, CPF, nº do auto e `case_id`, em corpo menor.
- **Document** (400, 13.5px, serifa, justificado): o corpo da peça, dentro da prévia do PDF.

### Named Rules

**A Regra das Três Fronteiras.** Mono é para o que se confere: código, placa, número, dinheiro, tempo, rótulo. Serifa é para o que se protocola: só dentro do documento gerado e em citação do CTB. Grotesca é todo o resto. Serifa em cromo de página é erro.

**A Regra do Dígito Estável.** Qualquer número que muda sozinho na tela usa `tabular-nums`. Um cronômetro que reflui a linha a cada segundo é defeito, não detalhe.

**A Regra do Rótulo Pequeno.** O rótulo mono é minúsculo (11px), em caixa alta e muito espaçado. Ele não compete com o valor que anuncia — ele o classifica.

## Layout

Container único de 72rem (`max-w-6xl`), com respiro de 16px no celular, 24px a partir de 640px e 32px a partir de 1024px. O plugin `container` do Tailwind está **desligado** em `tailwind.config.ts` de propósito: havia duas regras `.container` competindo, e a vencedora dependia da ordem de saída do CSS.

Breakpoints são os padrões do Tailwind e só três estão em uso: **640px** (`sm`, empilhado → lado a lado em faixas curtas), **768px** (`md`, o corte principal — grid de formulário em duas colunas, trilha na horizontal, CTA solta do rodapé) e **1024px** (`lg`, o hero abre em duas colunas com a réplica do auto ocupando a coluna direita inteira).

O ritmo vertical é grande e regular: seções respiram 64px no celular e 80px no desktop, com 40px entre o cabeçalho da seção e seu conteúdo. Dentro dos blocos a escala é a padrão de 4px, com 16px e 24px fazendo quase todo o trabalho.

No hero, a ordem de empilhamento no celular é **título → réplica do auto → oferta**: a assinatura aparece cedo, mas nunca empurra o título para fora da dobra. No desktop as duas faixas de texto se colam ao centro da coluna esquerda (`self-end` / `self-start`) para que a altura sobrando da réplica não abra um vão entre título e oferta.

### Named Rules

**A Regra do Filete Contínuo.** A trilha do "como funciona" é uma sequência, não cinco ilhas: um filete de 1px atravessa as cinco etapas inteiras — vertical no celular, horizontal no desktop — nascendo no centro do primeiro marcador e morrendo no do último. Por isso a trilha usa `gap: 0` e tira o espaço do padding interno: qualquer calha no grid parte o filete.

**A Regra da Medida.** Todo texto corrido tem teto de largura declarado (44ch no lead, 54ch na abertura de seção, 68ch na resposta do FAQ, 70–72ch nas páginas legais). Nenhuma linha atravessa o container inteiro.

**A Regra da Área Segura.** Qualquer barra grudada no fundo da viewport soma `env(safe-area-inset-bottom)` ao seu padding. Vale para o CTA da home e para as ações do formulário.

## Elevation & Depth

**Plano por padrão; sombra só onde há papel.** Seções, cartões, blocos de formulário e a barra de navegação são planos e se separam por filete e por alternância de fundo — branco e papel creme. A sombra não é linguagem de interface neste sistema: ela é evidência de que aquele objeto representa uma folha física. Existem exatamente quatro superfícies sombreadas — a réplica do auto, a folha do recurso pousada sobre ela, a prévia do PDF e o recibo do envio — mais a barra de CTA, que projeta para cima porque está sobre o conteúdo.

Toda sombra é **tingida de verde** (`hsl(var(--primary) / α)`), nunca preta, e sempre com deslocamento longo e raio grande em opacidade baixa — sombra de folha sobre mesa, não de cartão flutuante.

### Shadow Vocabulary
- **Papel assentado** (`0 1px 2px hsl(var(--primary)/0.08), 0 18px 36px -24px hsl(var(--primary)/0.45)`): a réplica do auto. Um contato duro de 1px e uma difusão longa.
- **Papel pousando** (`0 -1px 3px hsl(var(--primary)/0.06), 0 24px 44px -28px hsl(var(--primary)/0.7)`): a folha do recurso sobre a autuação. Mais funda e com um fio de luz para cima, porque ela está por cima de outra folha.
- **Documento em repouso** (`0 1px 2px hsl(var(--primary)/0.08), 0 20px 40px -28px hsl(var(--primary)/0.5)`): a prévia do PDF e o recibo do envio.
- **Barra sobreposta** (`0 -10px 28px -22px hsl(var(--primary)/0.9)`): projeta para cima, sob a barra fixa de CTA.
- **Contato de botão** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): o único preto do sistema, e o único caso em que a sombra não representa papel. Presente nas variantes sólida e invertida do botão.

### Named Rules

**A Regra do Papel.** Se o elemento não representa uma folha, ele não tem sombra. Separação é trabalho do filete.

**A Regra da Sombra Verde.** Sombra preta não existe neste sistema, exceto o contato de 1px do botão. A luz da página é verde porque a marca é verde.

## Shapes

A forma é a do impresso: **canto de 4px ou canto nenhum**. `--radius` vale 0.25rem e a escala do Tailwind foi remapeada em cima dele, o que produz uma consequência que o sistema aproveita: `rounded-sm` resolve para **0px** neste projeto, e é o que dá ao carimbo e à barra de progresso a aresta viva. O único elemento redondo do sistema é o marcador numerado da trilha, um círculo de 32px com borda de filete.

A linguagem de contorno é de uma espessura só: **1px de filete** em cartão, campo, bloco e separador. As exceções são semânticas e todas de 2–3px: o filete vermelho de 3px no topo da réplica do auto (a tarja do talão), a borda verde de 3px no topo da folha do recurso (a resposta), a borda de 2px do carimbo e o contorno de foco de 2px. Espessura maior que 1px, neste sistema, sempre significa alguma coisa.

O valor preenchido automaticamente (cidade e estado via ViaCEP) usa **borda tracejada** — a única do sistema: o campo existe, mas não é seu.

### Named Rules

**A Regra do Canto Duro.** Documento tem canto, não bolha. Nada passa de 4px, exceto o marcador circular da trilha. `rounded-xl`, `rounded-2xl` e `rounded-full` em cartão ou botão estão fora.

**A Regra da Espessura Significante.** 1px separa; 2–3px significa. Se uma borda ficou mais grossa sem carregar sentido, ela está errada.

## Components

O caráter é **tátil e confiante**: os componentes têm peso de objeto e resolvem sozinhos, sem empilhar cor por cima de cor. Hoje esse peso está no material — papel, filete, sombra longa, aresta viva — e não em resposta ao toque: as transições são só de cor, 200ms. Um hover com deslocamento nos objetos de papel seria coerente com essa direção e ainda não existe; é a expansão natural desse eixo, não uma correção.

### Buttons
- **Shape:** canto de 4px, `inline-flex`, ícone e rótulo separados por 8px.
- **Sólido:** Verde Autuação com texto branco, respiro de 12px por 24px, peso 600, contato de sombra de 1px. Hover fecha para Verde Autuação Fundo.
- **Invertido:** para uso **sobre fundo verde** — o papel do talão vira o botão. Fundo creme, texto Verde Autuação; hover vai para Sálvia Clara. O contorno de foco troca para creme, senão o anel verde desaparece no fundo verde.
- **Fantasma:** texto Verde Autuação sobre transparente, com borda de filete; hover pinta o fundo de papel creme.
- **Desabilitado:** fundo papel creme, texto Verde Secundário, sem sombra, cursor bloqueado.
- **Foco:** contorno de 2px na cor da marca, deslocado 2px. Nunca removido.

### Inputs / Fields
- **Style:** fundo branco, borda de 1px em Contorno de Campo, canto de 4px, respiro de 12px por 16px. Campos de código — placa, CPF, CEP, nº do auto, RENAINF — trocam para IBM Plex Mono com entreletra aberta.
- **Rótulo:** mono, 11px, caixa alta, entreletra 0.14em, 8px acima do campo.
- **Focus:** borda muda para Verde Autuação, mais anel de 2px deslocado 1px.
- **Erro:** a borda vermelha sai de `aria-invalid="true"`, não de classe condicional — o estado visual e o estado anunciado ao leitor de tela têm uma origem só. A mensagem aparece abaixo, 14px, em Vermelho Infração.
- **Somente leitura:** borda tracejada e fundo papel creme, para valor que o sistema preencheu.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** branco sobre página branca, separado por borda de filete; o papel creme entra quando a seção inteira alterna.
- **Shadow Strategy:** nenhuma, salvo os quatro objetos de papel listados em Elevation & Depth.
- **Internal Padding:** 20px no celular, 24px a partir de 768px.
- **Legenda do bloco:** nome em mono verde à esquerda e um filete que atravessa até a borda direita — a tarja que separa as seções da notificação.

### Navigation
- Cabeçalho de uma linha, separado do conteúdo por filete: marca à esquerda em grotesca 800 caixa alta espaçada, links à direita em mono 11px caixa alta. Hover leva o link do Verde Secundário para o Verde Autuação. Sem menu hambúrguer — no celular a mesma linha encolhe.
- O rodapé inverte tudo: fundo Verde Autuação inteiro, links em papel creme que clareiam para branco no hover, e um contorno de foco creme.

### O Campo (`.field`) — componente-assinatura
O átomo de todo o sistema, copiado direto da notificação de autuação: rótulo mono minúsculo em caixa alta, valor logo abaixo em mono, filete separando do próximo. Ele monta a réplica do auto, a faixa de preço, o cabeçalho do documento e o recibo. Quando uma informação nova precisa aparecer, a primeira pergunta é se ela cabe num campo.

### O Carimbo (`.stamp`) — componente-assinatura
Retângulo de aresta viva com borda de 2px e texto mono em caixa alta com entreletra de 0.18em, em Tinta de Carimbo. Marca o que foi protocolado. Nunca é vermelho, nunca é preenchido, e não se repete: um carimbo por tela.

### A Réplica do Auto (`.notice`) — componente-assinatura
A única composição do sistema que se permite rotação, sobreposição e movimento. Papel creme rotacionado -1,5°, tarja vermelha de 3px no topo, a folha do recurso em serifa pousando por cima com borda verde de 3px, e o carimbo caindo no pé. A sequência de entrada roda **uma vez, no load**, encadeada por atraso: a notificação assenta (180ms), a folha desliza (240ms, atraso 180ms), o carimbo cai (200ms, atraso 420ms, com um leve overshoot). Todas com `fill-mode: both`.

### Named Rules

**A Regra da Variante Única.** Um botão resolve sua cor inteiramente na variante. Empilhar utilitário de cor sobre `.btn--*` está proibido: foi exatamente essa colisão — dois valores da mesma propriedade decididos pela ordem de saída do Tailwind — que a refatoração eliminou.

**A Regra do Estado Anunciado.** O estado visual sai do atributo de acessibilidade, não o contrário. Erro vem de `aria-invalid`, expansão vem do Accordion do Radix. Estado desenhado à mão que o leitor de tela não enxerga é regressão.

**A Regra do Movimento Único.** Existe uma animação no site: a sequência do hero, uma vez, no load. Sob `prefers-reduced-motion`, duração vai a 0.01ms **e o atraso a -1ms** — sem isso o usuário que pediu menos movimento ainda esperaria a sequência escalonada acontecer, sem vê-la.

## Do's and Don'ts

### Do:
- **Do** manter a paleta fechada nos oito matizes do favicon; resolva necessidades novas com papel ou luminosidade, nunca com matiz novo.
- **Do** respeitar a semântica: vermelho para a multa e o prazo, verde para o recurso e o protocolado.
- **Do** usar o filete de 1px como separador padrão, antes de considerar caixa ou sombra.
- **Do** enviesar todo neutro para o verde da marca (matiz 150–160) — bordas e texto secundário inclusive.
- **Do** aplicar `tabular-nums` em qualquer número que se atualize sozinho.
- **Do** calcular o contraste de todo par novo de texto sobre fundo antes de commitar; AA é piso, não meta.
- **Do** derivar o estado visual do atributo de acessibilidade (`aria-invalid`, Radix), nunca o inverso.
- **Do** usar `.btn` mais uma variante, deixando a variante resolver a cor sozinha.
- **Do** declarar largura máxima de leitura em todo texto corrido.

### Don't:
- **Don't** trazer estética SaaS genérica: gradiente roxo-azul, glassmorphism, cartão com canto de 16px e sombra difusa, ilustração 3D. O único gradiente permitido é o verde da faixa de fechamento.
- **Don't** trazer fofura de fintech: ilustração de personagem, emoji em botão, canto arredondado grande, tom brincalhão. O assunto é uma multa.
- **Don't** empilhar utilitário de cor sobre uma variante de botão.
- **Don't** usar Sálvia de Margem (#609078) sobre o verde da marca — reprova em contraste a 2,05:1.
- **Don't** pôr serifa em cromo de página; ela pertence ao interior do documento gerado.
- **Don't** dar sombra a elemento que não representa uma folha de papel, nem usar sombra preta.
- **Don't** passar de 4px de canto em botão ou cartão.
- **Don't** acrescentar animação fora da sequência do hero, e nunca fazer o cronômetro pulsar.
- **Don't** reintroduzir cinza azulado de biblioteca (`#E5E7EB` e parentes) — já saiu uma vez.
