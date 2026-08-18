# Progresso do projeto

Diário cronológico do Amo Recorrer, para dar contexto rápido a sessões futuras.

**Divisão de papéis entre os dois documentos de contexto:**

| Arquivo | Responde |
|---|---|
| `CLAUDE.md` | *Como o sistema funciona hoje* — arquitetura, comandos, invariantes, armadilhas. Estado atemporal. |
| `PROGRESSO.md` (este) | *O que aconteceu, quando e por quê* — marcos, decisões, o que ficou pendente. Histórico. |

Quando um fato deixa de ser "novidade" e vira "como as coisas são", ele migra para o `CLAUDE.md`.

## Convenção para atualizar

Ao fim de uma sessão que mudou algo relevante:

1. Atualize a seção **Estado atual** (ela é sempre reescrita, nunca acumulada).
2. Acrescente uma entrada no topo de **Registro de sessões**, no formato:

```markdown
### AAAA-MM-DD — Título curto do que foi feito

**Feito:** o que mudou, em uma ou duas frases.
**Arquivos:** os caminhos principais tocados.
**Verificação:** como foi confirmado que funciona (build, testes, screenshots, números).
**Ficou de fora:** o que foi deliberadamente adiado, e por quê.
```

3. Mova para **Pendências e decisões em aberto** qualquer escolha que dependa do Klaus.

Não registre aqui o que o `git log` já conta sozinho. O valor deste arquivo está no *porquê* e no que **não** está no código.

---

## Estado atual

*Atualizado em 2026-08-15.*

- **Branch de trabalho:** `feature/env-supabase-form-submit-checkout`, sincronizada com `origin`.
- **`main` está 34 commits atrás**, parada em `a3b2142` (2025-10-29). Todo o trabalho desde novembro de 2025 — pagamento, Edge Functions, pipeline, redesenho — vive só na feature branch. **Merge para `main` nunca aconteceu.**
- **20 arquivos modificados e 9 novos, nada commitado** (redesenho das Fases 0–4 e o preço cheio, mais alterações anteriores em `stripe-webhook` e um snippet SQL que já estavam na árvore).
- **O redesenho "Notificação e Resposta" está completo** — Fases 0 a 4. Todas as páginas usam o mesmo casco, a mesma tipografia e os mesmos tokens.
- **O site não para mais de vender depois de 30 minutos.** O fim da promoção agora só tira a moldura promocional; o CTA continua ativo.
- **Funciona ponta a ponta** em ambiente local com os 5 processos de pé (Supabase, functions serve, Vite, Express, FastAPI): checkout Stripe → webhook → formulário → pipeline → PDF no Storage → e-mail → `confirm_dispatch`.
- **Sem suíte automatizada.** A verificação é manual, via os 4 scripts PowerShell em `tests/edge-functions/`.

---

## Registro de sessões

### 2026-08-15 — Formulário e páginas de retorno (Fase 4)

**Feito:** o redesenho chegou às páginas internas. Com isso o plano "Notificação e Resposta" está executado de ponta a ponta.

- **Formulário reagrupado nos quatro blocos do auto** — Identificação, Veículo, Autuação, Sua versão —, cada um numa `fieldset` com o nome em mono e um filete atravessando até a borda. Antes eram dois blocos genéricos ("Dados Pessoais", "Dados do Auto") com 20 campos empilhados sem hierarquia; agora o preenchimento vira transcrição, na mesma ordem do papel.
- **Teclado e autocomplete certos:** CPF, CEP, telefone, CNH e velocidades abrem teclado numérico (`inputMode="numeric"`); nome, e-mail, telefone, CEP e endereço têm `autoComplete`; a placa é mono, caixa alta, `maxLength={7}`, sem autocorreção.
- **Erros acessíveis:** cada campo ganhou `aria-invalid` e `aria-describedby` apontando para a mensagem, e a borda vermelha passou a sair do próprio atributo (`.form-input[aria-invalid='true']`) em vez de `className` condicional. Ao falhar a validação, o foco vai para o **primeiro campo com erro na ordem da tela**.
- **Cidade/UF apareceram.** O ViaCEP já preenchia os dois em silêncio; agora há um campo somente-leitura mostrando o que ele achou.
- **Rail de progresso** ("Passo 2 de 2 · pagamento confirmado") e **CTA grudado no rodapé no mobile** — `position: sticky` dentro do formulário, não `fixed`: quando o formulário acaba, o botão solta e nada fica flutuando sobre o rodapé.
- **Tela de acompanhamento pós-envio:** o sucesso era uma tarja verde e o formulário continuava lá, vazio. Virou um recibo que substitui o formulário, com o `case_id` em mono, o e-mail de destino, o prazo e o que fazer se não chegar.
- **Casco compartilhado:** `PageShell` (masthead + rodapé) agora envolve formulário, `/cancel`, `/terms`, `/privacy` e o 404. A 404 estava em inglês, com `bg-gray-100` e link azul — fora do sistema inteiro.

**Arquivos:** `src/components/{Masthead,PageShell}.tsx` (novos), `src/pages/{Form,Cancel,Terms,Privacy,NotFound,Home}.tsx`, `src/index.css`.

**Verificação:** build e lint sem erros novos; console limpo. Fluxo completo exercitado no navegador com a chamada do `form-submit` interceptada: validação vazia → 13 mensagens de erro, 14 campos com `aria-invalid`, foco em `nomeCompleto`; preenchimento → ViaCEP devolveu "Rio de Janeiro · RJ" no campo somente-leitura; envio → recibo com o `case_id` correto. Screenshots das cinco páginas em 1280 px e do formulário em 390 px, sem rolagem horizontal. 15 pares de cor medidos: o menor é **4,79:1** (mensagem de erro em vermelho sobre branco, 14 px) — passa AA.

**Ficou de fora:** o `.hero__note` virou `.note` porque passou a ser usado fora do hero. O redirecionamento automático de 3 segundos do `/cancel` foi mantido como estava — é comportamento, não visual, e ninguém pediu para mudar.

### 2026-08-15 — Preço cheio fora da promoção

**Feito:** criado o segundo preço no Stripe e ligado ao checkout, fechando a pendência aberta na Fase 2 — agora o "de R$ 39,99" riscado corresponde a um preço que existe e é cobrado.

- **Stripe (sandbox `acct_1RrARw…`, test mode):** `price_1U4sHvPyoFJoyBNVXVcDJObB` — R$ 39,99, à vista, BRL, no mesmo produto `prod_SucRdXW6ce9o20`. O `default_price` do produto **continua** sendo o de R$ 19,99. Nada foi criado em live: a conta live é outra (`acct_1RrARg…`) e nem tem esse produto.
- **`create-checkout-session`:** nova env var opcional `STRIPE_PRICE_ID_FULL`. O corpo do POST aceita `pricing: "promo" | "full"`; só o literal `"full"` promove o preço, e só se a variável existir — qualquer outra coisa cai no promocional, que é o lado seguro do erro. A faixa usada vai para `metadata.pricing_tier` da sessão (e daí para `stripe_sessions.metadata`).
- **Frontend:** `createCheckout(pricing)` manda o campo; a home passa `full` quando o cronômetro zerou. O estado expirado voltou a mostrar **R$ 39,99** sem tarja promocional e sem cronômetro — que era o que o plano original pedia e que na Fase 2 eu não podia entregar sem mentir sobre o valor.

**A regra não é verificável no servidor.** O cronômetro vive no `sessionStorage`, então quem limpar a sessão paga R$ 19,99 para sempre. O Klaus escolheu essa opção sabendo disso; a alternativa oferecida foi um prazo global de campanha numa env var, que a Edge conferiria contra o próprio relógio.

**Arquivos:** `supabase/functions/create-checkout-session/index.ts`, `supabase/.env.local` (+ `.example`), `src/lib/checkout.ts`, `src/pages/Home.tsx`, `CLAUDE.md`.

**Verificação:** o preço foi lido de volta da API (ativo, `one_time`, `unit_amount: 3999`, BRL, produto certo). No navegador, com a rota do checkout interceptada: promoção ativa → tela mostra "R$ 39,99 riscado / R$ 19,99" e o corpo enviado é `{"pricing":"promo"}`; promoção expirada → tela mostra "R$ 39,99", sem cronômetro, e o corpo é `{"pricing":"full"}`. Build e lint sem erros novos.

**Não verificado:** a Edge Function **não foi executada**. O Docker não estava de pé nesta máquina, então `supabase functions serve` não subiu, e o MCP do Stripe só expõe GET para checkout sessions. Falta rodar um checkout real de ponta a ponta com `npx supabase functions serve --env-file supabase/.env.local` e conferir na sessão do Stripe que `amount_total` é 3999 e `metadata.pricing_tier` é `full`.

**Ficou de fora:** o preço em live. Quando for a hora, é preciso criar produto **e** os dois preços na conta `acct_1RrARg…` e rodar `npx supabase secrets set STRIPE_PRICE_ID_FULL=…` no projeto remoto.

### 2026-08-15 — Home (Fase 3)

**Feito:** as quatro seções abaixo do hero saíram da gramática de infoproduto e entraram na do documento.

- **"Como funciona"** virou uma **trilha com filete contínuo** — cinco marcadores em mono costurados por uma linha (vertical no mobile, horizontal no desktop), em vez de cinco círculos verdes soltos. A numeração ficou porque a ordem é informação.
- **"O que você recebe"** virou o **preview da peça**: a primeira página do recurso em Source Serif 4, cortada no meio por `mask-image`, com o cabeçalho para a JARI e a citação do art. 280 do CTB. Ao lado, três campos (arquivo, entrega, resumo) no lugar dos três cards com emoji.
- **FAQ** passou a usar o **Accordion do shadcn** (Radix), que já era dependência. Saiu o `useState` à mão com a seta `↓` literal; entraram `aria-expanded`, navegação por teclado e o chevron em traço fino.
- **Rodapé enxuto** (`Rodape.tsx`): contatos com ícone `lucide-react` em traço fino, aviso legal legível e uma linha de base com o filete. Os contatos agora **só renderizam se a variável de ambiente existir** — sem `VITE_WHATSAPP_URL`, o link antigo apontava para a string `undefined`.
- A faixa "Pronto para começar?" virou `.closer`: eyebrow, título, campo de preço e CTA, alinhados à esquerda como o resto do site.

**Uma remoção de conteúdo:** o card **"HTML da peça (opcional)"** saiu. O pipeline entrega PDF por e-mail (`pipeline/` → reportlab → SMTP); não há HTML no fluxo. Se isso for oferta real e não aspiração, precisa voltar — e ser implementado.

**Arquivos:** `src/components/{ComoFunciona,RecursoPreview,Rodape}.tsx` (novos), `src/components/FAQ.tsx` (reescrito), `src/pages/Home.tsx`, `src/index.css`.

**Verificação:** `npm run build` passa; `npm run lint` mantém os mesmos 9 erros pré-existentes; console sem erros. Screenshots de página inteira em 1280 e 390 px, `scrollWidth == clientWidth` em 390 px. FAQ testado por teclado: `aria-expanded` alterna com Enter, foco visível, resposta revelada. 22 pares de cor medidos no navegador — o menor é **6,47:1** (papel sobre o verde da faixa e do rodapé); o aviso legal saiu de branco a 70% de opacidade para papel opaco.

**Correção do registro anterior:** a entrada da Fase 2 dizia que `bg-accent/20` não gerava transparência. Está errado — o Tailwind emite `hsl(var(--accent) / .2)`, que é CSS válido porque os tokens guardam `H S% L%`. A nota foi removida.

**Ficou de fora:** Fase 4 (formulário, tela de acompanhamento pós-envio, `/cancel`, `/terms`, `/privacy` e 404 herdando o mesmo casco). O `Rodape` e o masthead ainda vivem só na home — as outras páginas continuam com o cabeçalho e o rodapé antigos.

### 2026-08-15 — Hero assinatura (Fase 2)

**Feito:** o hero deixou de ser um bloco verde centralizado e virou a réplica do documento. Três entregas:

- **`<NotificacaoHero />`** — a notificação de autuação em papel creme (órgão, placa, art. 218, valor em vermelho), a folha do recurso pousando por cima em serifa, e o carimbo **RECURSO PROTOCOLADO** caindo por último. A sequência do plano roda uma vez no load, com os keyframes que a Fase 0 já tinha deixado prontos.
- **`Countdown` redesenhado** — mono tabular, vermelho da paleta, sem `animate-pulse`, dentro de um campo rotulado "prazo da promoção". Virou `<time>` com `dateTime` e rótulo acessível.
- **Fim do botão morto** — passados os 30 minutos, o CTA continua ativo; some a tarja "de R$ 39,99" e some o cronômetro. Também entrou um **CTA fixo no rodapé no mobile**, que aparece depois que o CTA do hero sai da tela.

Duas decisões que se afastam do plano, ambas registradas em "Pendências":

1. O plano pedia que a promoção expirada virasse **"linha de preço cheio ainda clicável"**. Como o checkout cobra sempre o `STRIPE_PRICE_ID` de R$ 19,99, exibir R$ 39,99 seria informar um preço que não é o cobrado. O estado expirado mostra R$ 19,99 sem moldura promocional. Cobrar de verdade os R$ 39,99 exige um segundo preço no Stripe e lógica em `create-checkout-session` — mudança de backend, fora do escopo do redesenho.
2. O token `--stamp` **passou de vermelho para verde** (`160 60% 21%`, o verde da marca aprofundado). A semântica da direção é explícita: vermelho é a multa e o prazo, verde é o recurso e o protocolado. Carimbo vermelho sobre um documento já marcado de vermelho apagava justamente a virada de jogo que o hero existe para mostrar.

**Arquivos:** `src/components/NotificacaoHero.tsx` (novo), `src/hooks/use-promo.ts` (novo), `src/components/Countdown.tsx`, `src/pages/Home.tsx`, `src/index.css`, `.gitignore`.

**Verificação:** `npm run build` passa; `npm run lint` mantém os mesmos 9 erros pré-existentes, nenhum nos arquivos novos; console do navegador sem erros. Screenshots em 1280 e 390 px, e `scrollWidth == clientWidth` em 360 px (sem rolagem horizontal). Os 19 pares de cor do hero medidos no navegador: o menor é **5,21:1** (valor da multa em vermelho sobre o papel) — todos passam AA para texto normal. Percurso por teclado com anel de foco visível em todos os alvos. Com `prefers-reduced-motion: reduce` emulado, carimbo e folha chegam no estado final (`opacity: 1`, `rotate(-6deg)`, `animation-duration: 0.00001s`) — a guarda global ganhou também `animation-delay: -1ms`, sem o qual a sequência ainda entrava escalonada.

**Ficou de fora:** Fases 3 e 4 (home e formulário). O `.hero-gradient` migrou para a faixa "Pronto para começar?", que continua com o layout antigo — reformulá-la é Fase 3.

### 2026-08-14/15 — Mapa do repositório e redesenho visual (Fases 0–1)

**Feito:** três entregas. (1) Criado o `CLAUDE.md` com arquitetura, comandos e armadilhas. (2) Plano de direção visual **"Notificação e Resposta"** — a página passa a usar a linguagem do documento que combate, com a paleta do favicon preservada e ressemantizada (vermelho = a multa e o prazo, verde = o recurso e o protocolado). (3) Execução das Fases 0 e 1 do plano.

O que a Fase 0–1 entregou:

- **Tipografia**, a mudança de maior impacto — o site inteiro era `system-ui`. Entraram três famílias auto-hospedadas via `@fontsource`: **Archivo** (display/UI), **IBM Plex Mono** (placa, artigo do CTB, nº do auto, `case_id`, cronômetro) e **Source Serif 4** (reservada ao interior do documento gerado).
- **Tokens** — `--paper`, `--rule` e `--stamp` novos; `--warning` deixou de ser um laranja fora da paleta; neutros de borda saíram do azulado para viés verde; `--radius` de `0.5rem` para `0.25rem`.
- **Botões** — `.btn` + variantes `--solid`/`--inverse`/`--ghost`/`--disabled`, eliminando a colisão `btn-primary bg-white text-secondary`.
- **Oito defeitos pré-existentes corrigidos**, incluindo `lang="en"` num site pt-BR, `.container` definido duas vezes (Tailwind + `index.css`), e ausência de guarda de `prefers-reduced-motion`.

**Arquivos:** `CLAUDE.md`, `src/index.css` (reescrito), `tailwind.config.ts`, `index.html`, `src/main.tsx`, `src/pages/{Home,Form,Cancel}.tsx`, `package.json`.

**Verificação:** `npm run build` passa; `npm run lint` sem erros novos (os 9 existentes são todos pré-existentes); screenshots de home e formulário em desktop e mobile 390px, sem rolagem horizontal; e os 11 pares de cor em uso conferidos numericamente contra WCAG AA.

Duas falhas reais de contraste foram achadas e corrigidas — a segunda só apareceu ao rodar os números, não na leitura do código:

| par | antes | depois |
|---|---|---|
| preço riscado sobre o hero verde | **2,05:1** | 6,47:1 |
| `muted-foreground` sobre papel | **3,15:1** | 6,41:1 |

A segunda afetava o corpo de texto de todos os cards e de todas as respostas do FAQ.

Também apareceu um defeito que a leitura estática não tinha revelado: o CTA do hero era `bg-primary` **sobre o hero verde** — botão verde em fundo verde, visível apenas pela sombra. Agora usa a variante invertida.

**Ficou de fora:** Fases 2–4 do plano (hero assinatura, home, formulário reagrupado). O `Countdown` mantém o `animate-pulse` por ser escopo da Fase 2 — a guarda global de `prefers-reduced-motion` já o neutraliza para quem pediu menos movimento. O bloco `.dark` foi mantido apesar da recomendação de remoção, por ser decisão do Klaus.

**Referência:** plano completo com paleta, escala tipográfica, wireframes e a lista do que foi descartado — https://claude.ai/code/artifact/5329f2e3-e84d-429b-8a70-2024e1706f13

---

## Marcos anteriores

Reconstruídos do histórico de commits. Datas são do commit, não de deploy.

| Período | Marco |
|---|---|
| **Set 2025** | MVP da landing page sobre o stack `vite_react_shadcn_ts`; primeira conexão com Supabase. |
| **Out 2025** | Identidade visual própria — saída dos assets do Lovable, favicon v2 e a paleta que o projeto usa até hoje. Último commit que chegou à `main`. |
| **Nov 2025** | Integração de pagamento: `createCheckout()`, envio do formulário para a Edge Function, migração para `import.meta.env`, primeiras Edge Functions. |
| **Dez 2025** | Supabase local completo e testado; CORS nas Edge Functions; migrations idempotentes após o primeiro deploy remoto; página de cancelamento e persistência do `case_id`; scripts de teste das Edge Functions. Correção de timeout de CPU. |
| **Jan 2026** | Checkout passa a usar produto do catálogo (`STRIPE_PRICE_ID`) em vez de produto dinâmico; formulário ganha os campos do auto de infração; FKs `stripe_session_id`/`case_id` acertadas e ordem das migrations ajustada para evitar referência circular; `payment_status` migra para `stripe_sessions`; lookup de CEP via ViaCEP. |
| **Mai 2026** | Refatoração do pipeline de `generated_documents`: contrato do `202`, trabalho pesado assíncrono e `confirm_dispatch` fechado pela API Express. |
| **Jun 2026** | `stripe-webhook` reescrito para INSERT-se-novo / PATCH-seletivo, preservando o `id` da linha e a FK `dispatches.stripe_session_id`. |
| **Ago 2026** | Documentação de contexto (`CLAUDE.md`) e redesenho visual, Fases 0–1. |

---

## Pendências e decisões em aberto

Ordenadas pelo custo de continuar adiando.

1. **`main` está 34 commits atrás.** Todo o produto vive numa feature branch há nove meses. Quanto mais tempo passa, mais caro fica o merge.
2. **O preço cheio existe só no sandbox** e a regra que escolhe entre os dois é decidida pelo navegador — quem limpar o `sessionStorage` paga R$ 19,99 para sempre. Duas frentes em aberto: replicar produto e preços na conta live, e decidir se a urgência vira um prazo global de campanha (verificável no servidor) ou continua por visitante.
3. **Autenticação bearer está desligada.** O bloco de validação está comentado em `create-checkout-session` e `form-submit`, com `verify_jwt = false`. Toda a infra existe e não é usada; hoje `form-submit` é protegida só por whitelist de origem e existência do `case_id`.
4. **Duas assinaturas de `attempt_dispatch` convivem** (`case_id` e `p_case_id`). Consolidar exige saber qual versão está viva no projeto remoto.
5. **Dark mode órfão.** `next-themes` instalado, nada monta a classe `.dark`. Implementar o toggle ou remover o bloco.
6. **Sem fila durável no pipeline.** Se o processo morrer entre o `202` e o `finish`, o caso fica preso em `generating` sem retry.
7. **O redesenho acabou; falta o merge.** Fases 0–4 entregues e nada commitado. Ver o item 1.
8. **"HTML da peça" é oferta ou aspiração?** O card que prometia uma versão HTML saiu na Fase 3 porque o pipeline só entrega PDF. Decidir entre implementar ou deixar fora.
