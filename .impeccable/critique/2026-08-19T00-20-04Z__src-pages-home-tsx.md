---
target: src/pages/Home.tsx
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-19T00-20-04Z
slug: src-pages-home-tsx
---
Method: dual-agent (A: revisão de design isolada · B: detector + evidência de navegador isolada).

## Design Health Score

| # | Heurística | Nota | Achado-chave |
|---|-----------|:---:|-----------|
| 1 | Visibilidade do status | 1 | `handlePaymentClick` sem `disabled`/spinner/`aria-busy`; 1–4s de tela inerte no único ponto de conversão |
| 2 | Correspondência com o mundo real | 3 | Vocabulário exemplar, mas o hero pareia `PRAZO DE DEFESA · 30 dias` com peça endereçada à JARI |
| 3 | Controle e liberdade | 2 | Nada reversível; preço dobra sozinho sem caminho de volta; link "formulário" leva não-pagante a tela que só rejeita no submit |
| 4 | Consistência e padrões | 3 | `ComoFunciona` crava R$ 19,99 fixo; `.faq` rompe o rail esquerdo (~100px); nenhum landmark `<main>` |
| 5 | Prevenção de erros | 1 | Sem guarda de duplo-clique (dois `case_id`, duas sessões Stripe); e-mail coletado só após o pagamento |
| 6 | Reconhecimento vs. memorização | 3 | Réplica do talão é excelente; lista de dados exigidos colapsada no accordion, depois dos CTAs |
| 7 | Flexibilidade e eficiência | 2 | `.cta-bar` é acelerador real; falta porta de retorno para quem já pagou |
| 8 | Estética e minimalismo | 4 | Nenhum elemento supérfluo; `.doc` com `mask-image` entrega o produto sem adjetivo |
| 9 | Recuperação de erros | 1 | `alert()` com status HTTP cru e corpo do servidor; zero recuperação |
| 10 | Ajuda e documentação | 2 | FAQ honesto mas depois dos dois CTAs, colapsado, ausente nos 3600px da captura mobile |
| **Total** | | **22/40** | **Baixo da faixa típica (20–32)** |

Nenhuma heurística `n/a`.

## Veredito de especificidade

Linguagem visual de altíssima especificidade servindo uma arquitetura de persuasão genérica. O `<NotificacaoHero />` é uma tese visual, não um mockup; o átomo `.field`, o `.track` costurado por filete e a `.doc` cortada por máscara são autorais e defensáveis linha a linha. O esqueleto de conversão (hero+arte, cinco passos, faixa colorida, accordion, CTA fixo) é padrão de categoria, e o cronômetro de 30min em `sessionStorage` é o clichê mais gasto do e-commerce brasileiro. A ousadia está toda gasta na dobra.

### Varredura determinística

O detector CLI vinha DEGRADED (faltavam htmlparser2, css-select, css-tree, domutils); foi consertado instalando os pacotes no cache do plugin. Ainda assim 0 achados, por motivo estrutural: `detector/cli/main.mjs:109` só manda `.html`/`.htm` para o engine HTML — `.tsx` cai no matcher regex, e como a estilização vive em Tailwind + `src/index.css`, não há o que casar. Canário `.tsx` deliberadamente péssimo devolveu 0 achados. **O CLI estático é cego para este codebase.**

Contorno: bundle de browser injetado na página real. 17 nós / 25 achados. Relevantes: `all-caps-body` ×5 (`.eyebrow`, `.note` com 56 caracteres a 11px, `.doc__heading`, `.doc__meta`, `.doc__caption`), `gpt-thin-border-wide-shadow` ×3 (objetos de papel — rejeitado, é a Regra do Papel do DESIGN.md), `kicker-above-heading` ×4, `justified-text` ×2 (sem `hyphens`), `undersized-ui-text` ×1 (`.doc__caption` a 10px), `bounce-easing` ×1 (`stamp-drop`). Cinco falsos positivos verificados, incluindo `ai-color-palette "Cyan gradient"` (os dois stops são matiz 160°, o verde da marca) e `text-occlusion` (badge do próprio detector).

### Evidência de navegador

Contraste: 20 pares medidos, **todos passam AA** (6,03:1 a 15,91:1), inclusive sobre o gradiente verde medido contra os dois stops. Teclado: 15 focáveis, ordem = ordem visual, zero armadilha, todos com `:focus-visible` real (anéis de 6,47:1 a 15,91:1). Console: 0 erros. Mobile 390×844: sem rolagem horizontal, sem corte, sem sobreposição. Animação do hero: nenhum elemento preso em opacidade 0; sequência encerra em 620ms. Falhas: nenhum landmark `<main>`, `h1` dentro de `<header class="hero">`, sem skip link, 5 alvos de toque abaixo do piso de 24px do SC 2.5.8.

## O que está funcionando

1. O `<NotificacaoHero />` é uma ideia, não uma ilustração: encena multa → peça → protocolado num objeto só, em ordem temporal, sem gerar rolagem horizontal (medido: scrollWidth 390 = innerWidth 390).
2. `RecursoPreview` mostra o produto em vez de descrevê-lo — a única prova honesta disponível num pré-lançamento onde prova social está proibida.
3. Foco por teclado e contraste melhores que os da maioria dos produtos pagos.

## Problemas prioritários

**[P0] O botão de pagar não tem estado.** Sem `disabled`/pendência/`aria-busy`; duplo toque em 4G gera dois `case_id` e duas sessões Stripe; falha vira `alert()` com HTTP cru. Correção: estado `enviando` + `.btn--disabled` + guarda de reentrada; erro inline humano com botão de repetir. → /impeccable harden

**[P0] "Sem garantia" e a lista de dados exigidos só existem depois do CTA.** Colapsados no accordion abaixo dos dois CTAs; o sobretítulo "ANTES DE PAGAR" é literalmente falso; contraria o Princípio 3 do PRODUCT.md e expõe a risco de CDC. Correção: duas linhas de 13–14px sob cada CTA; lista de dados entre a oferta e o botão; mover o FAQ para antes do `.closer`. → /impeccable clarify

**[P1] Erro de domínio no elemento mais visto.** `PRAZO DE DEFESA · 30 dias` (defesa prévia, órgão autuador) pareado com peça à JARI (art. 281). O público não sabe distinguir os estágios — pode protocolar a peça errada e perder o prazo. Correção: decidir qual peça o produto gera e alinhar hero/preview/FAQ; enquanto isso, remover a etiqueta do talão. → decisão de produto

**[P1] O preço muda sozinho e a página se contradiz.** Oferta vira R$ 39,99 sem aviso enquanto `ComoFunciona` afirma R$ 19,99 em texto fixo; `sessionStorage` torna a urgência descobrivelmente falsa. Correção: derivar o preço de uma constante única; estado explícito de expiração; prazo global de campanha em env var conferido pela Edge. → /impeccable clarify

**[P1] E-mail de entrega coletado depois do pagamento, sem rede de segurança.** Typo = pagou e não recebe, sem conta, sem segunda via, com reembolso indefinido. Correção: avisar sob o CTA, exigir confirmação no formulário, considerar coletar na Home como `customer_email`. → /impeccable harden

**[P2]** Dobra mobile sem preço nem CTA (réplica ocupa ~55% da altura; `.cta-bar` só entra depois que o CTA sai da tela). **[P2]** Nenhum `<main>`, `h1` dentro do `banner`, sem skip link. **[P2]** Cinco alvos de toque abaixo de 24px (marca do masthead, "Termos" e "Privacidade" ×2).

## Red flags por persona

**Motorista de app no celular:** dobra sem preço nem botão; preço e cronômetro tipograficamente idênticos lado a lado; duplo toque por falta de feedback; chega ao Stripe sem saber que precisará de CPF, endereço e artigo do CTB nem que não há garantia; sem porta de retorno "já paguei".

**Motorista comum sem repertório jurídico:** JARI, art. 281, órgão autuador, peça — nenhum termo definido antes do CTA; a página nunca diz onde se protocola nem que o protocolo é ato dele; `R$ 293,47` em vermelho é o número mais destacado da dobra e pode ser lido como preço do serviço.

**Motorista em risco de suspensão:** o único cronômetro conta o desconto, não o prazo dele; o prazo real aparece como dado fictício num exemplo; descobre "não há garantia" no rodapé, depois de dois botões de pagar.

## Observações menores

`og:image` é o favicon 64×64 com `summary_large_image` (card quebrado no WhatsApp); faltam `og:url`, `og:locale`, `canonical`. Preço lido como "R$ 39,99R$ 19,99" sem marcar o vigente. `.on-green .price__from` some contra o preço vigente sobre o verde. ~200px de vazio acima do `h1` em 1440×900; `.closer` com dois terços vazios à direita. `.faq` rompe o rail esquerdo. Mensagem de erro do `/form` sem acentos e com `case_id` cru. `.dark` órfão no `index.css`. Dois warnings de React Router v7.

## Perguntas

1. Se a urgência real é o prazo do usuário, por que o único relógio conta o desconto?
2. E se "sem garantia — e você sabe disso antes de pagar" fosse copy do hero, em vez de rodapé?
3. Por que o e-mail é a última coisa pedida, se é a única de que a entrega depende?
4. E se o `RecursoPreview` mostrasse o artigo que o visitante escolher?
