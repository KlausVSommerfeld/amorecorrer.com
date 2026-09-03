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

*Atualizado em 2026-09-03.*

- **Branch de trabalho:** `feat/ajuste-frontend-claudecode`, **36 commits à frente de `main`**, que segue parada em `a3b2142` (2025-10-29). Todo o produto — pagamento, Edge Functions, pipeline, redesenho — vive só na feature branch. **Merge para `main` nunca aconteceu.**
- **O redesenho "Notificação e Resposta" está completo** — Fases 0 a 4. Todas as páginas usam o mesmo casco, a mesma tipografia e os mesmos tokens.
- **O site não para mais de vender depois de 30 minutos.** O fim da promoção agora só tira a moldura promocional; o CTA continua ativo.
- **O fluxo funciona ponta a ponta em ambiente local, com a peça redigida pela IA** — verificado em 03/09/2026 por dois caminhos independentes, não presumido: um roteiro de 23 verificações via API (checkout → webhook assinado → formulário → dispatch → PDF no Storage com SHA-256 conferido → idempotência → CORS) e a jornada real no navegador, com ViaCEP, validação e recibo. `document_status = completed`, `dispatches.status = sent`.
- **A redação por IA está provada.** Com `DEEPSEEK_API_KEY` carregada, o PDF sai com peça própria (3168 bytes contra 1957 do placeholder), citando os dados do formulário, o art. 218 I do CTB e a Resolução CONTRAN 798/2020.
- **O e-mail é o que falta, e o bloqueio não é de código:** o Resend recusa com `550 — domínio amorecorrer.com não verificado`. Transporte, TLS e credenciais funcionam; falta verificar o domínio em resend.com/domains. Em `production`, enquanto isso, todo caso pago termina em `failed`.
- **Falta para produção:** verificar o domínio no Resend, endereço estável do pipeline (o `DISPATCH_PIPELINE_URL` aponta para um túnel efêmero morto) e o bucket `generated-recursos` versionado, hoje passo manual de Dashboard.
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
| **Ago 2026** | Documentação de contexto (`CLAUDE.md`) e redesenho visual, Fases 0–1. Endurecimento do formulário, auditoria técnica da home e passada de acabamento: tema escuro, landmarks, card social e limpeza de dependências mortas. |

---

## Pendências e decisões em aberto

Ordenadas pelo custo de continuar adiando.

1. **`main` está 36 commits atrás** (conferido em 31/08/2026). Todo o produto vive numa feature branch há dez meses. Quanto mais tempo passa, mais caro fica o merge.
2. **O preço cheio existe só no sandbox** e a regra que escolhe entre os dois é decidida pelo navegador — quem limpar o `sessionStorage` paga R$ 19,99 para sempre. Duas frentes em aberto: replicar produto e preços na conta live, e decidir se a urgência vira um prazo global de campanha (verificável no servidor) ou continua por visitante.
3. **Autenticação bearer está desligada.** O bloco de validação está comentado em `create-checkout-session` e `form-submit`, com `verify_jwt = false`. Toda a infra existe e não é usada; hoje `form-submit` é protegida só por whitelist de origem e existência do `case_id`.
4. **Duas assinaturas de `attempt_dispatch` convivem** (`case_id` e `p_case_id`). Consolidar exige saber qual versão está viva no projeto remoto.
5. ~~**Dark mode órfão.**~~ **Resolvido em 26/08/2026:** toggle implementado e `.dark` reescrito a partir da paleta (ver a entrada da sessão abaixo).
6. **Sem fila durável no pipeline.** Se o processo morrer entre o `202` e o `finish`, o caso fica preso em `generating` sem retry.
7. **O redesenho acabou; falta o merge.** Fases 0–4 entregues e já commitadas na feature branch — o que continua faltando é o merge para `main`. Ver o item 1.
8. **"HTML da peça" é oferta ou aspiração?** O card que prometia uma versão HTML saiu na Fase 3 porque o pipeline só entrega PDF. Decidir entre implementar ou deixar fora.
9. ~~**O disco `C:` está cheio.**~~ **Resolvido em 01/09/2026** — e o alvo não era o `C:`: o que estava cheio por dentro era o `docker_data.vhdx` (33,8 GB). `docker system prune -a --volumes` liberou 8,65 GB internos e a stack voltou a subir. Ver a entrada da sessão.
10. **O projeto Supabase da nuvem está pausado** (`tsdzvxgkokrjqayxukud`, status `INACTIVE` — projeto pausado perde o DNS). Retomar, ou assumir que o desenvolvimento segue só no conjunto local.
11. **`DISPATCH_PIPELINE_URL` aponta para um túnel `trycloudflare` morto.** Esses endereços são efêmeros e morrem junto com o processo do túnel. Ou se sobe um túnel novo a cada sessão, ou se adota um endereço estável (Cloudflare Tunnel nomeado, ou o pipeline publicado). **É o item que falta para produção.** Em teste local, `http://host.docker.internal:8000/hooks/dispatch` resolve, porque a Edge roda em container e não enxerga o `127.0.0.1` do host.
14. **O bucket `generated-recursos` não está versionado.** É criado à mão no Dashboard, então toda stack recriada do zero falha no upload do PDF com `Bucket not found` — aconteceu em 01/09/2026. Vale uma migration ou script de setup.
15. ~~**A redação por IA nunca foi testada de ponta a ponta.**~~ **Resolvida em 03/09/2026 quanto à IA:** com a chave carregada, o DeepSeek redigiu peça própria e verificável (3168 bytes contra 1957 do placeholder), citando os dados do formulário e a legislação. A outra metade — o e-mail — não passou, e virou a pendência 16.
16. **O domínio `amorecorrer.com` não está verificado no Resend.** Descoberto em 03/09/2026: com `PIPELINE_ENV=production`, o envio é recusado no estágio DATA com `550 — The amorecorrer.com domain is not verified`, e com o remetente de teste `onboarding@resend.dev` a conta só aceita entregar em `klaus.velando@gmail.com`. Conexão, STARTTLS, AUTH e destinatário passam: **as credenciais estão certas, falta a verificação de domínio em resend.com/domains.** É bloqueio de produção — enquanto durar, todo caso pago gera o PDF, guarda no Storage e termina em `document_status = failed`.
17. **`VITE_STRIPE_PUBLISHABLE_KEY` é uma chave `pk_live_…` órfã.** Convive com um `sk_test_…` no mesmo arquivo e não é consumida em lugar nenhum de `src/`. Inofensiva hoje só por não ter consumidor; remover ou trocar pela chave de teste encerra o risco.
12. **Rotacionar a chave `service_role`.** Ela está em texto puro em `server/.env` e `pipeline/.env` (fora do git, verificado), mas foi impressa no transcript da sessão de 31/08 por um comando de inspeção mal filtrado. Nada saiu da máquina; rotacionar é barato e encerra a dúvida.
13. **Dois conjuntos completos de `.env` convivem** — os `.env.local` (local) e os `.env` (nuvem), cada um com seu próprio segredo HMAC. Foi essa duplicação que criou a armadilha corrigida em 31/08. Enquanto os dois existirem, qualquer divergência de precedência entre serviços volta a quebrar o fluxo em silêncio. Decidir qual é o canônico e apagar ou renomear o outro.


---

## Sessão de 26/08/2026 — `/impeccable polish` na home

Passada de acabamento sobre os achados da auditoria (`/impeccable audit src/pages/Home.tsx`, mesma sessão: 14/20).

**Acessibilidade**
- `<main id="conteudo">` envolvendo as cinco seções; o `<header>` voltou a ser só o masthead, e o `<h1>` saiu de dentro do banner.
- Link "Pular para o conteúdo", visível ao receber foco.
- Cada seção nomeada por `aria-labelledby` — o que também desambigua os três botões "Gerar meu recurso" na lista de controles do leitor de tela.
- `transition-all` do `AccordionTrigger` virou `transition-colors`: ele animava o `outline`, e por 150ms o anel de foco do FAQ era um traço de 3px quase preto. A seta ganhou `aria-hidden`.

**Tema escuro** (pendência 5, aberta desde o redesenho)
- `next-themes` montado em `App.tsx`; alternância em `src/components/AlternarTema.tsx` (só ícone abaixo de 640px, com o rótulo como nome acessível); script inline no `index.html` decide a classe **antes da primeira pintura**, senão quem usa o sistema no escuro veria a página clara durante o carregamento.
- `.dark` reescrito a partir da paleta: o papel creme do talão vira **via carbonada** e o creme volta como tinta. Nenhum matiz novo — só os ângulos 160/150/120/60/0 em outras luminosidades.
- Quatro tokens novos (`--band`, `--band-deep`, `--band-ink`, `--band-paper`) separam a faixa verde de `--primary`: no escuro a faixa precisa continuar verde enquanto o botão clareia para se destacar do fundo. `--shadow` faz o mesmo pelas sombras, que presas a `--primary` viravam halo claro no escuro. No tema claro os cinco tokens valem exatamente o que valiam antes — nenhuma mudança visual.
- `color-scheme` e `::selection` passam a sair da paleta.
- 29 pares de contraste medidos na página viva, nos dois temas: **zero reprovações**. O pior é `.notice__valor` a 5,21:1 (claro) / 5,30:1 (escuro).

**Card social e SEO**
- `public/og-cover.png` 1200×630 desenhado na direção e renderizado a partir do próprio design system (antes o `og:image` era o favicon de 64px sob `summary_large_image`, descartado por WhatsApp e Facebook).
- `og:url`, `og:locale`, `og:site_name`, `og:image:width/height/alt`, `canonical`, `theme-color` por esquema; `public/sitemap.xml` e a linha `Sitemap:` no `robots.txt`.
- A `meta description` parou de cravar R$ 19,99 (o preço vira R$ 39,99 quando a promoção expira). `twitter:site="@amorecorrer"` removida — o perfil não existe.

**Peso**
- `@tanstack/react-query`, `<Toaster />`, `<Sonner />` e `TooltipProvider` estavam montados e nunca eram usados: saíram. `src/App.css` (starter do Vite) e 2,9 MB de imagens não referenciadas em `public/` também.
- Bundle: **538,1 → 434,9 KB** (gzip 160,2 → 128,3 KB, −20%); `dist/` de **4,4 → 1,6 MB**. O aviso de chunk acima de 500 KB sumiu.

**Outros**
- A barra fixa de CTA agora acende também quando o botão do hero nasce **abaixo** da dobra — no celular deitado (844×390) havia uma faixa inteira de rolagem sem nenhum CTA visível.
- Sobre a faixa verde, a oferta virou um cartão de papel: o preço riscado e o atual estavam a 1,16:1 um do outro (ambos legíveis contra o verde, indistinguíveis entre si). Agora 2,15:1 no claro e 1,69:1 no escuro.
- `hyphens: auto` na peça justificada — a 13,5px numa caixa de 42ch o português abria rios.

**Fica em aberto**
- `--input` no tema claro (`150 14% 86%`) dá **1,35:1** contra o branco: a borda dos campos do formulário não alcança os 3:1 do SC 1.4.11. No escuro já nasce em 3,59:1. Corrigir no claro escurece visivelmente todos os campos do `/form` — é decisão de desenho, não de acabamento.
- `DESIGN.md` e `.impeccable/design.json` ficaram desatualizados: não descrevem o tema escuro nem os cinco tokens novos. Rodar `/impeccable document`.
- Sem divisão por rota: `Form`, `Terms`, `Privacy` e `Cancel` continuam no chunk inicial da landing (`/impeccable optimize`).
- `usePromo` mantém **três** `setInterval` de 1s vivos — um por consumidor —, e a home inteira re-renderiza a cada segundo por 30 minutos (`/impeccable optimize`).


---

## Sessão de 26/08/2026 — `/impeccable optimize`

Medido antes e depois no build de produção, celular 390×844, CPU a 4×, rede a ~1,6 Mbps / 150 ms de latência, mediana de 3 passadas com contexto de navegador limpo em cada uma.

| Métrica | Antes | Depois |
|---|---|---|
| FCP / LCP | 1460 ms | **1424 ms** |
| **CLS** | **0,1836** | **0** |
| TBT | 265 ms | **219 ms** |
| Maior tarefa | 315 ms | **269 ms** |
| JS transferido | 129 KB | **83 KB** |
| Total transferido | 283 KB | **237 KB** |
| Chunk principal | 434,9 KB (gzip 128,3) | **221,3 KB (gzip 73,6)** |
| CPU em 10 s parado | 42,1 ms | **21,7 ms** |
| — só script | 25,2 ms | **6,4 ms** |

**1. O SDK do Supabase saiu do caminho crítico** — o maior item, e o menos óbvio. A análise do sourcemap mostrou 496 KB de fonte (`auth-js`, `realtime-js`, `storage-js`, `postgrest-js`) no chunk da landing, para uma coisa só: `getAuthHeaders()` aguardava `getAccessToken()`. Só que não existe `signIn` em lugar nenhum do projeto, `ensureAnonymousSession()` devolve `null` por definição, e o cabeçalho resultante era **sempre** `Bearer <anon key>` — uma variável de ambiente. `getAuthHeaders()` virou síncrona; as funções que realmente precisam de sessão (`getSession`, `refreshSession`, `signOut`, `onAuthStateChange`) importam o cliente dinamicamente e continuam disponíveis para quando a autenticação bearer for religada. **Verificado com interceptação de rede:** o checkout ainda envia `apikey`, `Authorization: Bearer <anon>` e `content-type` — os mesmos três cabeçalhos, byte por byte.

**2. CLS de 0,1836 → 0.** As fontes auto-hospedadas só eram descobertas depois que o CSS baixava e era analisado; chegavam ~1,9 s depois do início e o `font-display: swap` refluía a página inteira. Um plugin de build em `vite.config.ts` injeta `<link rel="preload">` para as duas faces latinas que pintam a primeira dobra (Archivo variável e IBM Plex Mono 400). Só essas duas: pré-carregar as 25 faces trocaria um problema por outro.

**3. Divisão por rota.** `Form`, `Terms`, `Privacy`, `Cancel` e `NotFound` viraram `React.lazy`. O formulário ganha um `<link rel="prefetch">` injetado no mesmo plugin — e o prefetch é obrigatório porque o usuário chega em `/form` **vindo do Stripe, já tendo pagado**, o pior momento possível para esperar download. Foi tentado antes com `import()` em `requestIdleCallback` e medido pior: `import()` baixa **e executa**, custando ~300 ms de TBT na primeira dobra. `rel="prefetch"` deixa os bytes no cache em prioridade mínima sem rodar uma linha.

**4. `usePromo` com um relógio só** (pendência da auditoria). Eram três `setInterval` de 1 s — um por consumidor — e, como `Home` lia um valor derivado de `msLeft`, cada tique re-renderizava a página inteira. Agora o relógio vive fora do React e `useSyncExternalStore` corta o re-render na origem: `usePromoExpirada()` devolve um booleano que o React descarta por igualdade, então só o `Countdown` re-renderiza a cada segundo. Verificado: a virada da promoção ainda propaga para os quatro lugares (preço do hero, cronômetro, etapa 01 da trilha, preço do fechamento), **com a página aberta e sem recarregar**.

**Fica em aberto**
- `tailwind-merge` são 72,5 KB de fonte no chunk principal (11%), para o `cn()` do shadcn. Trocá-lo por `clsx` puro mexe num utilitário compartilhado por toda a pasta `components/ui/`; o ganho estimado é de ~8 KB gzip. Não foi feito: risco de regressão maior que o ganho, e a auditoria não apontou nenhum sintoma.
- `@remix-run/router` + `react-router` + `react-router-dom` somam 308 KB de fonte e agora são o maior item do bundle. Sem alternativa sem trocar de roteador.


---

## Sessão de 26/08/2026 — `colorize` + `polish` + `adapt`

Fecha os achados da re-auditoria (19/20).

**Contorno de campo (P2, SC 1.4.11).** `--input` era `150 14% 86%` (#D6E0DB): **1,35:1** contra o branco, onde a norma pede 3:1 da borda de um controle — e o campo não tem preenchimento próprio para carregar essa informação no lugar dela. Testada toda a faixa da paleta: só a **Sálvia de Margem** (`150 20% 47.1%`, #609078) passa nos dois lugares onde o campo aparece — **3,65:1** sobre o branco e **3,15:1** sobre o papel creme do somente-leitura. Os intermediários (#6C9D85) passavam no branco e reprovavam no creme. Nenhum valor novo entrou: é cor já nomeada da paleta, em papel novo. No escuro o token subiu junto, para **4,08:1**. A espessura continua 1px — aqui a borda delimita, não significa. `.choice` usa o mesmo token e acompanhou.

O `<p class="form-readonly">` foi conferido e **não** entra na regra: é texto, não controle, e tem preenchimento creme próprio. Segue com o traço de 1,39:1, que declara origem e não delimita controle.

**Higiene (P3).**
- `src/hooks/use-auth.tsx` apagado — estava morto e era a única porta de volta dos 496 KB do SDK do Supabase, porque importava o cliente **estaticamente**.
- `app/cancel/page.tsx` apagado (e o diretório `app/` com ele): era um arquivo do Next.js App Router — `"use client"`, `next/navigation` — dentro de um projeto Vite, importando um pacote que nem é dependência daqui. Nunca entrou no build; aparecia no lint e confundia quem procurasse a página de cancelamento, que é `src/pages/Cancel.tsx`.
- O comentário do `--primary-dark` dizia `/* #006030 */`; a tripla computa **#134D3A**, e #006030 é o `--success`. Corrigido.
- `.form-input` passou de `bg-background` para `bg-card`, alinhando com `.choice`: no claro os dois são brancos, mas no escuro o campo ficava na cor da página enquanto o cartão de opção ficava um tom acima.

**Adaptação ao ponteiro.** O tamanho do alvo passou a sair do **ponteiro**, não da largura da tela — um laptop com tela sensível erra o alvo de 29px tanto quanto um celular.
- Sob `pointer: coarse`, **zero de 16 alvos** ficam abaixo de 44×44 (antes eram sete, entre 29 e 36px).
- No cabeçalho a área cresce por pseudo-elemento (`inset: -8px -6px`), não por altura: a primeira versão subia a altura de verdade e levava o masthead de 65px para **125px** em todo celular — sessenta pixels da dobra pagos por dois links secundários. Com a expansão invisível o masthead fica nos mesmos 65px e o alvo vai a 61×45.
- No rodapé e no link de pulo, onde não há dobra a proteger, a altura sobe de verdade.
- Sob `hover: none`, todo `:hover` volta ao repouso. No toque ele grudava: o cartão de opção ficava com a borda da marca depois do toque, fingindo uma seleção que não existia. Verificado com toque real: o cartão tocado fica marcado (borda da marca) e o irmão volta ao contorno de campo.
- Com ponteiro fino nada mudou: masthead em 65px, links em 49×29, hover funcionando.

**Ordem no CSS.** Os dois blocos de media query nasceram no meio do arquivo e seriam **ignorados**: `.btn--solid:hover` e `.masthead__brand` têm a mesma especificidade das regras que eles sobrescrevem, e nesse empate quem decide é a ordem. Foram movidos para o fim da camada `components`, com o motivo escrito no lugar.

**Verificação final:** 296 medições de contraste (home e formulário × claro e escuro), **zero falhas**; detector limpo; zero erro de console; `prefers-reduced-motion` intacto; lint sem problema nos arquivos tocados.

`DESIGN.md` e o sidecar foram atualizados junto: o Contorno de Campo virou #609078, a "exceção conhecida" saiu, e entraram duas regras novas — **A Regra do Alvo Invisível** e **A Regra do Hover Opcional** (29 no total).


---

## Sessão de 26/08/2026 (tarde) — `colorize` + `clarify` + `polish`

**Simulação de daltonismo (colorize).** O eixo semântico desta direção é vermelho contra verde, e ele nunca tinha sido testado. Simulação dicromática (Viénot, Brettel & Mollon 1999, severidade total) sobre a paleta:

| Par | Normal | Protanopia | Deuteranopia |
|---|---|---|---|
| Vermelho Prazo × Verde Protocolo | 1,28:1 | **1,04:1** | 1,73:1 |
| Vermelho Infração × Verde Autuação | 1,56:1 | 1,26:1 | 2,13:1 |

Sob protanopia a multa e o protocolado ficam em #5B5B2A e #585830 — **a mesma cor, para todos os efeitos**. Auditadas todas as ocorrências: **nenhum estado do sistema depende só do matiz**. O asterisco é glifo, o campo inválido traz frase, o trilho diz "Pagamento confirmado" por escrito, o cartão de opção anuncia por `:checked`, o carimbo tem texto. Nada a corrigir no código; o achado virou **A Regra do Eixo Invisível** no DESIGN.md, com os números, para que ninguém introduza um sinal só-cor no futuro. Confirmado de passagem que `--success` **não** é órfão (usado em `Form.tsx:922`).

**Copy de validação (clarify).** Dezesseis mensagens reescritas. As de campo vazio diziam "X é obrigatório" — repetiam o rótulo, que já traz o asterisco, e o cabeçalho, que já explica o asterisco; gastavam a única linha disponível para não informar nada. Agora cada uma diz **o que fazer** e, nos campos do auto, **de onde copiar**, que é a informação que o usuário de fato não tem:

- `Nome completo é obrigatório` → `Escreva seu nome completo, sem abreviar.`
- `E-mail inválido` → `Confira o e-mail: parece faltar o @ ou o domínio.`
- `CPF deve ter 11 dígitos` → `O CPF tem 11 dígitos. Confira se não faltou nenhum.`
- `Órgão autuador é obrigatório` → `Copie o órgão autuador do topo da notificação.`
- `Justificativa é obrigatória` → `Conte o que aconteceu: é esta parte que a peça vai defender.`

Essa última corrigiu também uma **inconsistência de vocabulário**: o rótulo na tela é "O que aconteceu?", e o erro falava de "justificativa" — palavra que não existe em lugar nenhum da interface.

**A regra dos três identificadores aparecia duas vezes.** O bloco do auto já tinha um parágrafo único que troca de dica para erro, mas o campo RENAINF, que vive no bloco anterior, imprimia a mesma frase por conta própria — e as duas versões estavam redigidas de formas diferentes. Agora existe uma constante `REGRA_IDENTIFICADORES`, a frase aparece **uma vez** na tela, e o RENAINF aponta para ela por `aria-describedby`. O que muda no erro é a cor, o `aria-invalid` e o foco — não o texto.

**Verificação.** 310 medições de contraste (home e formulário × claro e escuro), **zero falhas** — incluindo um estado nunca medido antes, o formulário **com os erros na tela**: 4,79:1 no claro e 6,13:1 no escuro. As 14 mensagens renderizam, o foco vai para o primeiro campo inválido, nada transborda a 390px e a mais longa ocupa duas linhas. Detector limpo, zero erro de console, lint limpo nos arquivos tocados.

**Não mexido, com o motivo.** O `textarea` tem `maxLength`, então o ramo "texto acima do limite" só é alcançável por rascunho restaurado — a mensagem foi melhorada (diz quantos caracteres cortar) mas continua sendo defesa em profundidade. E o campo Telefone não valida comprimento: a máscara guia, mas `(11) 9` passa. É lacuna de `harden`, não de `clarify`.


---

## Sessão de 26/08/2026 (noite) — `/impeccable harden`

**Tela em branco no caminho de quem pagou.** Defeito que eu mesmo abri na divisão por rota: sem `ErrorBoundary`, um `import()` que falha derruba a árvore inteira. Medido antes da correção em `/form`: **1 nó no `<body>`, texto vazio, nada clicável**. O gatilho não é hipotético — basta um deploy enquanto o usuário está no Stripe para o `index.html` em cache apontar para um chunk que já foi apagado.

Duas camadas de correção:
- `lazyComRetentativa()` em `App.tsx`: uma retentativa após 400ms cobre oscilação de rede (verificado: com uma falha, o formulário carrega e o usuário não vê nada). Se a segunda também falhar, recarrega **uma vez** — que é a única coisa que resolve o caso do deploy, porque só assim vem um `index.html` novo. A marca em `sessionStorage` impede o laço de recarga infinito; sem armazenamento, não recarrega (assume que já tentou).
- `src/components/FalhaDeRota.tsx`: um `ErrorBoundary` que renderiza dentro do `PageShell`, com `role="alert"`, o botão de recarregar, o link de suporte e — o mais importante — **o número do caso lido direto da URL**, porque nessa tela o usuário já pagou e esse número é o que permite achar o pedido dele. Nenhuma causa é afirmada: a rede pega tanto o chunk ausente quanto qualquer erro de renderização.

**Armazenamento bloqueado derrubava o site inteiro.** Descoberto por este mesmo passe, ao simular cookies/dados de site bloqueados (política corporativa, aba privada agressiva): nesse modo o **acesso** a `localStorage` lança, não só a gravação.
- `src/lib/caseId.ts` gravava o `case_id` sem guarda — e derrubava a **home**, uma página que não precisa de armazenamento para nada. Reescrito com leitura e escrita protegidas.
- `Form.tsx` lia `form_token` e `stripe_session_id` sem guarda — derrubava a **página de quem pagou**. Agora, sem armazenamento, o token vale só para esta sessão de página: o envio funciona igual, apenas a deduplicação entre recargas deixa de existir.
- Verificado depois: home e formulário renderizam, cronômetro corre, validação funciona, zero erro de página.

**Validações que faltavam.**
- **Telefone**: só havia `.trim()`, então `(11) 9` passava e ia gravado. É o único canal de contato quando o e-mail digitado errado devolve a mensagem. Agora exige 10 ou 11 dígitos com DDD.
- **Velocidades**: campos livres sem teto — "999" ia inteiro para a peça. Agora `maxLength=3` e recusa acima de 400 km/h. Os dois campos não tinham `aria-invalid` nem parágrafo de erro e não estavam em `FIELD_ORDER`: o erro seria definido e nunca mostrado. Corrigido.

**Não mexido, com o motivo.** `expedidaEm` é texto livre ("NA ou NP expedida em") e aceita "março de 2026" tanto quanto "12/03/2026" — transformá-lo em campo de data é decisão de produto, não de robustez, e eu não sei o tipo da coluna. `cnh` segue sem formato: é opcional e não sustenta nenhuma parte da peça.

**Verificação:** quatro cenários adversos (chunk ausente, oscilação de rede, armazenamento bloqueado na home e no formulário), layout da tela de falha conferido em 1280 e 390 — cartão alinhado ao masthead, sem rolagem horizontal. Detector limpo, lint limpo, `tsc` limpo. Bundle: 223,2 KB (gzip 74,1), +2 KB pela rede de segurança.

`DESIGN.md` não mudou: a tela de falha é feita inteira de componentes que já existiam (`.error-message--surface`, `.field`, `.btn--solid`).


---

## Sessão de 26/08/2026 (madrugada) — `polish` + `animate`

Fecha os dois achados da terceira auditoria (20/20).

**O CTA sumia no alto contraste do sistema (P2).** Verificado com `forced-colors: active`: "Gerar meu recurso" virava **texto solto no meio da página**, sem forma, sem borda, sem nada que dissesse que era um botão. A causa é do modo: o navegador substitui fundo e cor pelos do sistema e descarta sombras e imagens de fundo — um botão que dependia só do preenchimento perdia o corpo.

```css
@media (forced-colors: active) {
  .btn { border: 1px solid ButtonBorder; }
}
```

`ButtonBorder` é cor de sistema e sobrevive ao modo forçado. Como a regra vive dentro do media query, **não custa um pixel no modo normal** — medido: botão em 218×60 com borda 0px antes e depois; no alto contraste vai a 220×62, onde os 2px não importam. O anel de foco também sobrevive (`2px solid` na cor de destaque do sistema). Conferido que cartão, campo, opção, alerta, carimbo, recibo e barra de CTA já passavam: todos têm filete próprio.

**O carimbo tinha dois overshoots empilhados (P3).** O detector apontou `cubic-bezier(.3, 1.4, .5, 1)` como bounce easing, e ele estava certo pela metade: os keyframes **já** codificam a física do impacto (1,6 → 0,96 → 1,0 — cai grande, comprime abaixo do tamanho final, assenta), e o `y1 = 1,4` da curva somava uma segunda mola por cima. O gesto ficou onde deveria estar, na geometria, e cada trecho ganhou desaceleração exponencial própria: `cubic-bezier(0.16, 1, 0.3, 1)` na queda, `cubic-bezier(0.33, 1, 0.68, 1)` na recuperação.

Medido com o relógio da animação pausado e `currentTime` controlado:

| ms desde o início | escala |
|---|---|
| 0 | 1,6000 |
| +20 | 1,1981 |
| +40 | 1,0469 |
| +60 | 0,9912 |
| +110 | 0,9609 |
| +140 (fim da queda) | 0,9600 |
| +170 | 0,9949 |
| +200 (fim) | 1,0000 |

**63% da queda acontece nos primeiros 20 dos 140 ms** — chega rápido e freia no contato. A escala nunca passa de 1,6 nem cai abaixo de 0,96, e **nunca ultrapassa 1,0**: a compressão é geométrica, não elástica. Detector limpo depois da mudança.

`prefers-reduced-motion` segue entregando o estado final instantaneamente. `DESIGN.md` ganhou **A Regra da Forma que Sobrevive** e a descrição precisa da curva do carimbo (31 regras, 19 donts); o sidecar carrega a curva por keyframe e a extensão `forcedColors`.


---

## Sessão de 27/08/2026 — `polish`: SC 1.3.5

Uma linha, fechando o único achado da quarta auditoria.

`emailConfirma` tinha `autoComplete="off"`. O campo coleta o e-mail **do próprio usuário**, e o SC 1.3.5 (Identify Input Purpose, nível AA) exige que esse propósito seja legível por máquina — `off` é exatamente o que o esconde. Agora declara `email`, como o campo principal.

O `off` estava lá para impedir que o autopreenchimento "esvaziasse" a conferência, e o argumento não se sustenta: se o navegador preenche os dois campos com o mesmo endereço guardado, o usuário não digitou nada e não havia erro de digitação a pegar. A conferência existe para proteger quem digita, e para esse continua valendo inteira.

**Verificado:** os seis campos pessoais renderizados declaram o token certo (`name`, `email`, `email`, `tel`, `postal-code`, `street-address`); `cidade`/`estado` só aparecem como input no caminho de fallback do ViaCEP e já traziam `address-level2/1`. CPF e CNH seguem isentos — não existe token na norma para documento nacional, e a ausência ali é honesta, não descuido. A conferência de e-mail continua funcionando nos três estados: divergente acusa, igual passa, vazio cobra. Zero erro de página, `tsc` e build limpos.

`DESIGN.md` ganhou **A Regra do Propósito Declarado** (32 regras).


---

## Sessão de 31/08/2026 — Teste do fluxo ponta a ponta: o dispatch estava morto em silêncio

Sessão de diagnóstico, não de construção. Uma linha de código mudou; o resto é o mapa de onde o fluxo quebra e por quê. Relatório completo publicado como artifact: `Onde o Fluxo Quebra`.

**A causa raiz é uma inversão de precedência entre dois arquivos de configuração.** Existem dois conjuntos de `.env` completos e internamente coerentes — os `.env.local` (tudo local, um segredo HMAC) e os `.env` (tudo na nuvem, outro segredo). O conteúdo dos dois está certo. O problema é que **cada serviço escolhia um conjunto diferente**, por duas regras opostas que ninguém tinha comparado lado a lado:

- `server/src/index.ts:8-17` percorre `[".env.local", ".env"]` e faz `break` no primeiro que existir → Express carregava **`.env.local`**.
- `pipeline/config.py` declarava `env_file=(".env.local", ".env")`, e o pydantic-settings dá prioridade ao **último** arquivo da tupla → o pipeline carregava **`.env`**.

Resultado: Express assinava e conferia com um segredo, o pipeline com outro. Toda chamada assinada entre eles morria com 401.

**O modo de falhar era o pior possível: silencioso e sem rastro.** Medido com os dois serviços no ar:

```
POST /hooks/dispatch  assinado com o segredo da Edge  -> 401
GET  /internal/cases/CASO_…   (pipeline -> Express)   -> 401
POST /internal/dispatch/finish                        -> 401
```

A terceira linha é a que dói: o `notify_finish` do bloco `except` também levava 401. O pipeline não conseguia nem registrar o próprio fracasso. Como `BackgroundTasks` não é fila durável (pendência 6, de novembro), o caso ficava preso em `document_status = 'generating'` para sempre — sem erro no banco, sem retry, sem sintoma visível. Um caso pago que nunca chega.

**A correção é a ordem da tupla,** com o porquê no comentário para ninguém "arrumar" de volta:

```python
env_file=(".env", ".env.local"),
```

Assim `.env.local` ganha nos dois serviços. **Verificado** — o segredo efetivo do pipeline passou de `sha=6c856b06` (conjunto remoto) para `sha=1fdcd213`, idêntico ao do Express e ao da Edge; e o mesmo dispatch que dava 401 nas três chamadas agora dá **zero 401 na execução inteira**. O `GET /internal/cases` passou a responder 500 por `ECONNREFUSED 127.0.0.1:54321` — que já é o bloqueio seguinte, não mais autenticação.

Conferido também que o merge dos dois arquivos continua funcionando: `deepseek_api_base`, `deepseek_model`, `mail_subject` e `smtp_port` só existem no `.env` e seguem carregando. `pipeline/.env.local` zera `DEEPSEEK_API_KEY` e `SMTP_HOST` **de propósito** — é o perfil de desenvolvimento, com `PIPELINE_ENV=development`, em que o worker devolve o texto de placeholder no lugar da IA e marca `email_skipped` no lugar do envio. Não é regressão da correção.

**Três bloqueios de ambiente ficaram abertos**, todos movidos para Pendências (9 a 13) porque dependem de decisão sua: o disco `C:` cheio (1,3 GB de 237 GB) que faz o Docker gravar camadas truncadas e impede a stack local de subir; o projeto Supabase da nuvem pausado; e o túnel `trycloudflare` do `DISPATCH_PIPELINE_URL`, morto.

Sobre o disco, vale registrar como foi confirmado, porque o sintoma engana: os containers acusavam `exec format error` e `libapparmor.so.1: file too short`, o que parece imagem errada de arquitetura. Não é — a máquina é amd64 e as imagens também. Removi as três imagens acusadas e baixei de novo; a imagem **recém-baixada** continuou truncada. A corrupção acontece na gravação, porque não há espaço. Re-baixar não resolve; liberar espaço resolve.

**Achados menores, sem impacto no fluxo:** `confirm_dispatch` faz `RETURN QUERY SELECT success` e devolve o argumento recebido em vez de dizer se alguma linha foi atualizada — o `confirm_dispatch_ok` do Express é sempre verdadeiro (hoje não morde, porque o Express confere a existência do dispatch antes); `/form?success=true` exibe "Pagamento confirmado" só pelo parâmetro da URL, sem conferir nada no servidor (o envio segue protegido por `attempt_dispatch`, que exige `payment_status = 'paid'`, mas o selo mente para quem digitar a URL); `pipeline/.venv` é um venv de Windows e não roda a partir do WSL; e `npm run lint` acusa 7 erros cosméticos (`any` no `stripe-webhook`, `require()` no `tailwind.config.ts`, interface vazia no `textarea.tsx`).

**O que está saudável, verificado e não suposto:** `npm run build`, `tsc --noEmit` e o build do `server/` passam limpos. A home renderiza sem erro de console com o cronômetro correndo. A falha de checkout é tratada bem — alerta com `role="alert"`, a frase certa para a causa ("Parece que você está sem internet. Nada foi cobrado.") e botão de repetir; testado clicando de verdade com a Edge fora do ar. O formulário valida com resumo no topo mais `aria-invalid` por campo. A construção do HMAC bate nos três serviços — mesma serialização compacta, mesma mensagem `GET:${caseId}`; **só o segredo divergia**. O Express rejeita assinatura inválida com 401 e aceita a válida. `ORIGIN_WHITELIST` inclui `localhost:8080`. E nenhum segredo real está versionado: só os `.example` e o `.env.production`, que tem apenas valores `VITE_*` públicos.

**Arquivos:** `pipeline/config.py` (uma linha mais o comentário), `PROGRESSO.md`.

**Ficou de fora:** as etapas 1 a 4 do fluxo — checkout, webhook, `form-submit`, `attempt_dispatch` — **não foram executadas**, só lidas no código, porque a stack local não sobe. Repetir este teste depois de liberar o disco é o que fecha o diagnóstico. Também não retomei o projeto Supabase nem rodei `prune` no Docker: são mudanças na sua infraestrutura e na sua máquina.


---

## Sessão de 01/09/2026 — O fluxo ponta a ponta voltou a fechar

Continuação direta do diagnóstico de 31/08. Klaus liberou espaço em `C:` e pediu novo teste. As seis etapas rodaram e o ciclo fechou.

**O disco que estava cheio não era o `C:`.** Meu diagnóstico anterior apontou o alvo errado, e vale registrar porque é um erro fácil de repetir. Depois de liberar 1,3 GB em `C:`, a corrupção continuou **idêntica**: imagem recém-baixada com `libapparmor.so.1: file too short`. O que importa é o espaço **dentro** do `docker_data.vhdx` — um arquivo de 33,8 GB que estava cheio por dentro. Liberar `C:` não ajuda: o vhdx não encolhe nem devolve espaço, e apagar imagem libera espaço interno sem mudar o tamanho do arquivo.

Duas outras coisas enganaram no caminho. `exec format error` parece incompatibilidade de arquitetura — não é, máquina e imagens são amd64. E o meu teste de integridade com `--entrypoint sh` devolvia "ALIVE" porque **contornava justamente o entrypoint corrompido**; ao chamar a imagem com o entrypoint real, a corrupção que eu havia declarado ausente apareceu. Lição: para testar integridade de imagem, exercite o entrypoint, não um shell por cima dele.

`docker system prune -a --volumes` (autorizado pelo Klaus, depois de eu conferir que não havia volume nenhum e que os dois containers usavam bind mounts para arquivos do host — zero risco de dado) liberou 8,65 GB internos. O `supabase start` então rebaixou tudo e subiu com **12 containers saudáveis e as 12 migrations aplicadas limpas** — inclusive a `20250101000005`, que o `CLAUDE.md` marca como quebrada: ela **aplica** bem, o defeito dela é em runtime, e migrations posteriores substituem a função.

**O último bloqueio era o bucket.** Com tudo mais de pé, a primeira execução completa falhou no único passo que não vive em migration nenhuma:

```
POST /storage/v1/object/generated-recursos/…  -> 400
StorageApiError: {'statusCode': 404, 'error': Bucket not found}
GET /storage/v1/bucket -> []
```

O `generated-recursos` é criado à mão no Dashboard, então stack nova não o tem. Criei via API e o fluxo completou. Virou a pendência 14: isso precisa ser versionado.

**Mas repare no que aconteceu depois desse erro** — é a correção de 31/08 se pagando. O `notify_finish` respondeu **200**, e o caso foi para `document_status = failed` e `dispatches.status = failed`. Antes da correção da precedência de `.env`, essa mesma falha teria deixado o caso preso em `generating`, mudo e sem retry. O pipeline agora erra alto, que é o comportamento que se quer.

**A execução que fechou o ciclo.** Etapas 1 e 2 rodaram de verdade: sessão `cs_test_…` criada na API de teste do Stripe, e um evento `checkout.session.completed` assinado com o `STRIPE_WEBHOOK_SECRET` local — o webhook foi exercitado a sério, sem atalho escrevendo `paid` direto no banco. Estado final:

```
form_submissions      document_status = completed
                      stripe_session_id = cs_test_a1FWxYBpNkpp…
dispatches            status = sent
generated_documents   status = email_skipped
                      storage_path = CASO_f9145009…/c403e61d….pdf
                      sha256 = f386899b5b7da160…
```

E o PDF é artefato real, não registro otimista: baixei do Storage — 1952 bytes, `PDF document, version 1.4, 1 page(s)`, e o **sha256 do arquivo bate com o gravado no banco**.

**Duas armadilhas de ambiente que valem para a próxima vez.** A Edge roda em container e **não enxerga o `127.0.0.1` do host** — para o dispatch chegar ao pipeline local, o `DISPATCH_PIPELINE_URL` precisa ser `http://host.docker.internal:8000/hooks/dispatch`. E o `supabase functions serve --env-file` **ignora silenciosamente toda variável `SUPABASE_*`** ("Env name cannot start with SUPABASE_"); no local não morde, porque o runtime injeta as próprias, mas é bom saber antes de depender do arquivo.

**Um falso positivo meu, corrigido:** cheguei a suspeitar que `form_submissions.stripe_session_id` ficasse sempre nulo, já que o webhook faz PATCH por `case_id` antes de o formulário existir e um PATCH que casa zero linhas passa em silêncio. Fui verificar: o `form-submit` persiste o campo na linha 362, a partir do que o navegador manda do `localStorage`. Meu payload de teste é que omitia. Rodada de fidelidade total confirmou o vínculo nas três tabelas. **Não é defeito.**

**Arquivos:** `PROGRESSO.md`. Nenhuma mudança de código nesta sessão — a única correção do ciclo (`pipeline/config.py`) é de 31/08 e segue não commitada.

**Ficou de fora:** a **redação em si**. O perfil local zera `DEEPSEEK_API_KEY` e `SMTP_HOST`, então o PDF sai com o texto de placeholder do modo sem IA e o e-mail é pulado (`email_skipped`, que é o comportamento correto em development). O que este teste prova é o encanamento, não a qualidade da peça nem a entrega por e-mail. Virou a pendência 15. Também não retomei o projeto Supabase da nuvem nem rotacionei a `service_role`.

**Estado deixado na máquina:** a stack local do Supabase ficou **no ar** (`npx supabase stop` encerra), com o bucket `generated-recursos` criado e três casos de teste no banco. Vite, Express, pipeline e `functions serve` foram encerrados. O container `muninn` do Klaus seguiu intocado; a imagem `muninn-huginn` foi removida pelo prune e precisa ser reconstruída se for usada.


---

## Sessão de 03/09/2026 — A redação por IA passou; o e-mail é que não sai da conta Resend

Terceira rodada seguida de teste ponta a ponta, agora fechando as duas pontas que 01/09 tinha deixado abertas (pendência 15): **a redação por IA e o envio de e-mail**. A primeira passou. A segunda encontrou um bloqueio real de produção, e não no nosso código.

**A peça agora é redigida de verdade.** Com `DEEPSEEK_API_KEY` carregada, o PDF saltou de **1957 bytes** (o placeholder do modo sem IA) para **3168 bytes** de texto próprio. Extraí o conteúdo do PDF baixado do Storage para não confiar no tamanho: a peça cita o nº do auto, o órgão, a data, a placa, as velocidades permitida e aferida do formulário, invoca o art. 218, I do CTB, a Resolução CONTRAN 798/2020 e a Portaria INMETRO 544/2012, e fecha com pedido de nulidade. É documento, não resumo — o que a `PRODUCT.md` promete. **Metade da pendência 15 está encerrada.**

**O e-mail não sai, e o motivo é a conta Resend.** Com `PIPELINE_ENV=production` e as credenciais SMTP do `.env`, o envio morre no estágio **DATA** — depois de conexão, STARTTLS, AUTH e destinatário terem passado:

```
aiosmtplib.errors.SMTPDataError:
  (550, 'The amorecorrer.com domain is not verified.
         Please, add and verify your domain on https://resend.com/domains')
```

Isolei trocando o remetente por `onboarding@resend.dev`, e a recusa veio pelo outro lado da mesma moeda: *"You can only send testing emails to your own email address (klaus.velando@gmail.com). To send emails to other recipients, please verify a domain…"*. **As credenciais estão corretas e o transporte funciona; o que falta é verificar o domínio `amorecorrer.com` no Resend.** Virou a pendência 16 — e é bloqueio de produção, não cosmético: em `production`, *todo* caso pago terminaria em `document_status = failed`.

**O caminho de falha se comportou exatamente como projetado** — e isso é a correção de 31/08 se pagando pela segunda vez. Mesmo com o e-mail recusado, o PDF foi gerado, subiu ao Storage e ficou registrado; `generated_documents.status = email_failed` com o texto do erro do Resend **persistido em `error_detail`**; `notify_finish(False)` respondeu 200; `dispatches.status = failed` e `document_status = failed`. Nenhum caso preso em `generating`. O sistema erra alto e deixa rastro suficiente para o suporte responder ao cliente.

**O fluxo foi exercitado por dois caminhos independentes, não um.**

*Por API*, um roteiro de 23 verificações que roda em sequência e para na primeira falha: checkout → webhook assinado → `form-submit` → pipeline → conferência no banco e no Storage → idempotência → CORS e validação. Passou inteiro. Além do caminho feliz, cobriu as guardas: origem fora da whitelist → **403**; campo obrigatório ausente → **400**; `case_id` inexistente → **404**; reenvio idêntico de caso já finalizado → **409**.

*Pelo navegador*, o caminho real do usuário, com Playwright: home sem erro de console (só os dois avisos de *future flag* do React Router), clique no CTA, redirecionamento efetivo ao Stripe, `case_id` e `stripe_session_id` gravados no `localStorage`, volta para `/form?success=true&case_id=…`, **ViaCEP preencheu "Rio de Janeiro · RJ"** a partir do CEP, a validação **barrou corretamente** o `estagio` não escolhido antes de deixar enviar, e o recibo "PROTOCOLO INTERNO" apareceu com o nº do caso e o e-mail de destino. O resultado no banco confirmou o que 31/08 já havia corrigido como falso positivo: **`stripe_session_id` preenchido nas três tabelas** quando o envio vem do navegador — e nulo quando vem do roteiro de API, que não o manda. Não é defeito: o campo vem do `localStorage`.

**Preços conferidos na fonte, não no código:** `price_1RynCd…` = **R$ 19,99** e `price_1U4sHv…` = **R$ 39,99**, ambos `active`, ambos `livemode=false`.

**Três achados menores.**

`VITE_STRIPE_PUBLISHABLE_KEY` é uma chave **`pk_live_…`** convivendo com um `sk_test_…` no mesmo arquivo — e `grep` em `src/` não encontra **nenhum** consumidor dela. Hoje é inofensiva justamente por ser órfã; se alguém a ligar, o descasamento de modo aparece na hora. Ou se remove, ou se corrige para a chave de teste.

No banco local, `attempt_dispatch` existe **só** com a assinatura `p_case_id`. O `form-submit` tenta `case_id` primeiro, o erro entra num array que **só é logado se nenhuma das duas tentativas devolver chave** — ou seja, no caminho feliz a falha é invisível. Reforça a pendência 4.

O bucket `generated-recursos` **de novo** não existia na stack recriada, e de novo foi preciso criá-lo à mão pela API antes do primeiro upload. Terceira sessão seguida em que isso morde. Reforça a pendência 14.

**Sobre o ambiente, para a próxima vez.** Nesta máquina o **encaminhamento `localhost` do Windows para o WSL não funciona** — um processo Windows não alcança `127.0.0.1:3001` de um servidor rodando no WSL, só o IP do distro. Como os `.ps1` de teste, os venvs e o `node.exe` mostram que o seu setup real é **Windows**, rodei Express e pipeline como processos Windows (que assim conversam entre si por `127.0.0.1`, sem alterar nenhuma configuração) e deixei o Vite no WSL, para o navegador do Playwright bater na origem `http://localhost:8080` que a `ORIGIN_WHITELIST` aceita. Vale registrar também que **variável de ambiente definida no bash do WSL não chega a um processo Windows** a menos que seu nome esteja em `WSLENV` — foi por isso que a primeira tentativa de ativar a IA saiu com o texto de placeholder, sem erro nenhum.

**Um erro meu, e o conserto.** Ao criar um venv Linux apontei para `pipeline/.venv`, que já era um venv **Windows**, e o `virtualenv` sobrescreveu o `pyvenv.cfg` — quebrando o launcher (`Scripts/python.exe` passou a procurar o interpretador em `/usr/bin`). Restaurei usando o `.venv` da raiz como molde (`home = C:\Python314`, Python 3.14, mesma origem `uv`) e removi o que eu havia injetado (`bin/`, `Lib/python3.12/`). Conferido: `pipeline/.venv/Scripts/python.exe --version` responde **Python 3.14.0** e todas as nove dependências do `requirements.txt` importam. O venv está como estava.

**Arquivos:** `PROGRESSO.md`. **Nenhuma mudança de código nesta sessão.** `npm run build` passa (2m09) e `npm run lint` acusa os **mesmos 7 erros cosméticos** de sempre — nenhum novo.

**Ficou de fora:** a entrega efetiva do e-mail, que depende da verificação do domínio no Resend (pendência 16) e não de código nosso. Não enviei para `klaus.velando@gmail.com`, que é o único destino que a conta aceitaria hoje, porque o teste autorizado era para o `SMTP_TEST_TO`. Também não toquei no projeto Supabase da nuvem nem no túnel do `DISPATCH_PIPELINE_URL`.

**Estado deixado na máquina:** os cinco processos ficaram **no ar** — Supabase local (12 containers), `functions serve`, Express e pipeline como processos Windows, Vite no WSL. `npx supabase stop` encerra a stack. O bucket `generated-recursos` foi criado no conjunto local e há casos de teste no banco, incluindo dois em `failed` — os do teste de e-mail, deixados de propósito como evidência. O Docker Desktop foi aberto por mim; o repositório está limpo.
