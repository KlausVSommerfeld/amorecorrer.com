# Pendências

Lista bruta do que ainda está em aberto. O contexto de cada item está no `PROGRESSO.md`, na sessão indicada em `→`.

**Regras:**
- Concluiu → **remova** o item daqui e registre a conclusão no `PROGRESSO.md`.
- Surgiu pendência, etapa, fase ou task nova → **adicione** aqui, com a referência da sessão do `PROGRESSO.md` onde ela nasceu.
- `#N` é o número estável da pendência em `PROGRESSO.md › Pendências e decisões em aberto`. Item sem número não tem entrada lá.
- Sem explicação aqui: uma linha por item.

*Atualizado em 2026-10-15.*

---

## Produção e lançamento

- **#11 Endereço estável do pipeline** — desde 15/10/2026 o endereço é fixo **na máquina do Klaus** (contêineres + domínio do ngrok, `deploy/README.md`); falta levá-lo ao VPS para o lançamento. → Sessão de 31/08/2026 · Sessão de 13–15/10/2026 · plano `docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md` (Task 1 feita):
  - *Menores da revisão final (antes do VPS):* limite de 64 KB no corpo antes do HMAC (Caddyfile e política do ngrok); `npm ci` no `Dockerfile.server`; `test_*.py` fora pelo `.dockerignore`, não por `rm` numa camada posterior; imagens como root, tags flutuantes e sem healthcheck; `.env.vps` enxuto por serviço; `AsyncOpenAI` com `async with`; CLAUDE.md dizer que a precedência do `.env.local` não vale para os contêineres. → Sessão de 13–15/10/2026
  - Task 2 — VPS na Hostinger, firewall e acesso *(gasta dinheiro; com o Klaus)*
  - Task 3 — subdomínio apontando para o VPS
  - Task 4 — serviços no VPS com TLS (Caddy)
  - Task 5 — Edge aponta para o endereço novo; fluxo em produção *(manda e-mail real; com o Klaus)*
  - Task 6 — documentação
  - Plano já ajustado em 29/09: o Dockerfile copia todos os `.py` do pipeline (menos os de teste) e a base do CTB (`CTB_DIR=/app/ctb`); `.env.vps` com `DEEPSEEK_MODEL=deepseek-flash`. → Sessão de 29/09/2026 (base legal do CTB)
  - Plano ajustado em 03/10 para o template da peça: o `Dockerfile.pipeline` copia também `pipeline/fontes/` (sem as fontes o pipeline não sobe), e a validação local da Task 1 confere fontes e `pyphen` dentro do contêiner. O `.dockerignore` do plano não as exclui. → Sessão de 02/10/2026 (template da peça)
- **Hospedagem do frontend** — o site **nunca foi ao ar**: `amorecorrer.com` e `www` não resolvem (conferido em 01/10/2026). É o primeiro deploy, não uma republicação, e leva junto o `Form.tsx` da Fase 4 e o campo da velocidade considerada. Falta: escolher onde (recomendação: o mesmo VPS do #11, com o Caddy servindo o `dist/`), build com as `VITE_*` de produção, fallback de SPA (`/form` vem do redirect do Stripe; `public/.htaccess` já resolve em Apache, no Caddy é um `try_files`), DNS da raiz e do `www`, e `ORIGIN_WHITELIST`/`FRONTEND_URL` da Edge batendo com o domínio. **Só junto com o #11 ou depois dele** — sem pipeline, o cliente paga e não recebe nada. → Sessão de 01/10/2026 · plano do VPS, "Notas de execução"
- **#2 Preço na conta live** — criar produto e os dois preços em `acct_1RrARg…`, `secrets set STRIPE_PRICE_ID_FULL`; decidir prazo global de campanha vs. por visitante. → 2026-08-15 — Preço cheio fora da promoção
- **`.env.production`** — 13 valores ainda como `SUBSTITUA_`. → `CLAUDE.md › Variáveis de ambiente`
- **Deploy do enquadramento por lista** — na ordem: `npx supabase db push` (coluna `codigo_enquadramento`), `npx supabase functions deploy form-submit`, rebuild do contêiner do pipeline (`--build`, que leva a tabela; conferir antes se há caso em `generating`). Na ordem inversa, todo envio do formulário falharia no insert. O site só vai com o campo novo depois dos três. → Sessão de 15–17/10/2026 (enquadramento por lista)
- **#25 Caixa de e-mail do produto** — contato oficial é Gmail; `no-reply@` sem caminho de resposta. *Decisão do Klaus.* → Sessão de 13–14/09/2026
- **#17 `VITE_STRIPE_PUBLISHABLE_KEY` `pk_live_…` órfã** — remover ou trocar pela de teste. → Sessão de 03/09/2026

## Robustez do fluxo

- **Caso `failed` com o PDF pronto não tem caminho de reenvio**: a `form-submit` recusa caso finalizado (409) e o worker não reprocessa. Com as novas tentativas do e-mail fica mais raro, mas um SMTP fora do ar por mais de ~20 s ainda deixa o cliente pagante sem nada. Falta um reenvio (manual ou automático) que use o PDF já registrado em `generated_documents`. → Sessão de 08/10/2026 (teste ponta a ponta pelo questionário)
- **Caso pago parado em `pending` depois de um 503, se o cliente não clicar de novo** — a webhook já respondeu 200 e não volta a tentar; o caso fica visível (503 na tela, `[entrega] pipeline_*` e `devolvido` no log), mas sem alerta nem varredura. Mesma família do #6 (fila durável): uma varredura de casos pagos em `pending` ou um alerta resolveria. → Sessão de 09/10/2026 (revisão final da entrega única)
- **#26 `.env.local` sobrescreve variáveis reais de ambiente no Express** (`override: true`) — corrigir e documentar a regra no `CLAUDE.md`. → Sessão de 18/09/2026
- **Ninguém fica sabendo quando um caso pago vai a `failed`** — nem o Klaus (só pelo log do contêiner) nem o cliente (pagou e não recebe nada, nem aviso). Falta um alerta ao operador e, talvez, um e-mail ao cliente. → Sessão de 13–15/10/2026 (análise dos dois casos)
- **#6 Sem fila durável no pipeline** — processo morto entre `202` e `finish` deixa o caso em `generating`. → Sessão de 31/08/2026
- **Caminho legado do `202`** — pipeline respondendo `200` deixa `document_status` preso em `generating`. → Sessão de 09/09/2026 ("Ficou de fora")
- **Reprocessar casos em `failed`** — `scripts/redispatch.py` não existe. → Sessão de 18/09/2026 · plano `2026-09-08-bloqueios-de-producao-bucket-e-email.md`, Task 4
- **Comando "o e-mail sai?"** — `pipeline/check_email.py` não existe; `test_resend_smtp.py` segue no lugar. → Sessão de 09/09/2026 · mesmo plano, Task 2
- **`/form?success=true` exibe "Pagamento confirmado" sem conferir o servidor.** → Sessão de 31/08/2026 ("Achados menores")
- **#3 Autenticação bearer desligada** em `create-checkout-session` e `form-submit`. → Pendências #3
- **#22 `UNIQUE` em `form_token`** — antes, escopar o token por caso em `Form.tsx`. → Sessão de 09/09/2026
- **#13 Dois conjuntos de `.env`** — decidir o canônico. → Sessão de 31/08/2026

## Radar INMETRO (RJ)

Plano: `PLANO-verificacao-radar-inmetro.md`. Fases 0, 1, 3 entregues; Fase 2 só como carga manual.

- **#18 Fase 0.5 — calibração** com 8 a 10 notificações reais do RJ; escrever `docs/verificacao-radar-calibracao.md`. *Bloqueia a §5.4.* → Sessão de 03/09/2026 (noite)
  - Medir junto quantas notificações trazem o nº de série (risco 2) — `form_submissions` está vazia, só dá pelas notificações. → Sessão de 24/09/2026 · plano §7
- **Confirmar com uma notificação real a dica de "onde encontrar" os números do medidor** no formulário (texto genérico hoje). A Fase 4 chega ao cliente com a hospedagem do frontend. → Sessão de 24/09/2026
- **Ligar `RADAR_TESE_ATIVA`** — só depois da Fase 0.5 assinada. → Sessão de 24/09/2026 (Fase 5)
  - *Antes de ligar:* as instruções de exibição do bloco do radar (`pipeline/verificacao.py`) mandam o modelo "requerer que o órgão junte o certificado", mas desde o template da peça o modelo não escreve pedido (o prompt proíbe e o `peca.py` corta) e o pedido do código não tem item de exibição. Ou o pedido ganha esse item quando o bloco for de exibição, ou a instrução passa a "sustentar nos fundamentos", como no `velocidade.py`. → Sessão de 02/10/2026 (template da peça)
  - **Condição antes de ligar:** casos sem bloco (`nao_aplicavel`, comprovado) vão sem as regras do radar, logo sem a trava de base legal. Acrescentar uma trava neutra ao prompt base com a chave ligada (ex.: "não cite resolução, portaria ou certificado que não conste nos dados do caso"). → Sessão de 24/09/2026 (Fase 5, revisão final) Com a base legal do CTB (29/09), a trava existe para todo caso — reavaliar se a condição ainda se aplica.
  - Oito achados menores da revisão final (fuso do "capturada em", robustez a formatos impossíveis hoje, reenvio só com nº do medidor não reverifica, reenvio em `generating` diverge da auditoria…) — lista no `PROGRESSO.md`. → Sessão de 24/09/2026 (Fase 5, revisão final)
  - Confirmar o dispositivo do CONTRAN antes de acrescentá-lo a `REGRAS_RADAR` (risco 3). → plano §7
  - *Decisão do Klaus:* com vigência comprovada, o DeepSeek ainda pede o certificado por conta própria ao ver `medidor_numero_serie` no formulário. Omitir os campos `medidor_*` do contexto nesse caso? → Sessão de 24/09/2026 (Fase 5)
- **Fase 6 — observabilidade** — alerta de `record_count`, frescor como métrica (fonte congelada), view `radar_revisao_pendente`, métricas mensais. → Sessão de 21/09/2026 · plano §6
- **Fase 7 — OCR da notificação** — só abrir issue; fora desta branch. → plano §6
  - Reavaliar o modelo do DeepSeek aqui: o `deepseek-flash` foi escolhido "até o OCR" (decisão do Klaus). Ele aceita imagem, o `deepseek-v4-pro` não. → Sessão de 25/09/2026 (troca de modelo)
- **#21 De onde a ingestão *recorrente* busca o arquivo** — RBMLQ recusa IP de nuvem; testar `curl` a partir do VPS. → Sessão de 06/09/2026 (fim da noite) · Sessão de 20/09/2026
- **#19 Retenção dos snapshots + `pg_cron` + poda** — *decisão do Klaus*; nunca podar snapshot citado em `radar_consultas_log`. → Sessão de 03/09/2026 (noite) · Sessão de 21/09/2026
- **`docs/verificacao-radar.md`** — ingestão manual, significado de cada status, texto dos avisos legais. → plano §8

## A peça (pipeline)

Decisões jurídicas do Klaus primeiro; o pipeline só chega ao cliente depois do #11.

- **A peça repetiu "seu filho dirigia" com a resposta "não"** (teste ponta a ponta de 07/10, `CASO_a736dc94…`). A `REGRA_CONDUTOR_NAO` proíbe atribuir a direção a qualquer pessoa, mas as rodadas não tinham relato em que um terceiro dirigia. Correção proposta: prompt que narra os fatos do condutor sem identificá-lo, rede de segurança no `peca.py` para frases que atribuem a direção, e uma rodada com relatos de terceiros. *Decisão do Klaus antes:* com "não", os fatos que só o condutor viveu (i) não entram na peça, ou (ii) entram sem identificar quem dirigia ("segundo quem conduzia o veículo, …"). → Sessão de 07/10/2026 (teste ponta a ponta do relato e condutor)
- *Menor:* o enchimento sobre o art. 281-A (prazo da defesa, fora de discussão) voltou no teste de 07/10, depois de 0 em 60 peças nas rodadas de 05/10, e de novo no de 08/10 (ausente no de 09/10). → Sessão de 07/10/2026
- **Cliente que dirigia, mas não é o dono do carro** (o filho com o carro do pai): a notificação vem no nome do dono e a peça sai no nome de quem preencheu, que ainda não foi indicado como condutor. Questão de legitimidade, com o rito da indicação no CONTRAN (não conferido). *Decisão do Klaus.* → Sessão de 05/10/2026 (relato e condutor)
- **Falso positivo da conferência: "do Código determina" lido como "Código de…"** (norma externa). Visto numa rodada real de 05/10: "o art. 281, § 1º, I, do Código determina…" foi recusado. No worker custa uma refação e, se o modelo repetir, leva o caso a `failed`. Anterior à branch do relato. → Sessão de 05/10/2026 (relato e condutor)
- **Confirmar com um auto real a dica do campo "Vel. considerada"** (texto genérico hoje) e se todo auto de radar do RJ imprime a considerada. → Sessão de 30/09/2026 (velocidade considerada)
- **Tese de "estado de necessidade" sem norma** — pedida pelo cliente, a IA deixou de citar o Código Penal (a conferência recusou) mas manteve o argumento de que "afasta a culpabilidade". A conferência olha citações, não teses. *Decisão do Klaus* se a tese pode entrar numa defesa de trânsito. → Sessão de 29/09/2026 (base legal do CTB)
- *Menor:* a peça citou "art. 281, inciso I" — o inciso é do parágrafo único; a conferência não pega dispositivo errado dentro de artigo certo. → Sessão de 13–15/10/2026
- **"Modo sem IA" chega ao cliente** — com `DEEPSEEK_API_KEY` vazia, o worker gera um PDF-placeholder e o envia; em produção deveria falhar, como já faz o SMTP. Pré-existente, apontado na revisão final. → Sessão de 29/09/2026 (base legal do CTB)
- **Ferramenta de consulta ao CTB (caminho B)** — descartada por ora (teste de 26/09); voltaria só com uma busca de descoberta melhor que a atual (trecho exato). → Sessão de 26/09/2026 (spike: contexto × ferramenta)
- *Menor:* conferência não confere o 29 em "arts. 280, § 2º, e 29", nem lê "art 29" sem ponto; base com JSON de forma errada sai como erro genérico (o caso vai a `failed` do mesmo jeito). → Sessão de 29/09/2026 (base legal do CTB)
- *Menor:* o CPF aparece só com dígitos no corpo da peça quando o modelo o repete ("11144477735"); o fecho já formata. → Sessão de 25/09/2026 (peça limpa)

## Produto e formulário

- **#8 "HTML da peça"** — implementar ou deixar fora. → 2026-08-15 — Home (Fase 3)
- **Velocidade considerada igual à aferida é aceita** (200/200 no `CASO_363f15e6…`): num auto real a tolerância a deixa sempre menor, e a cópia da aferida faz a conta sobre ela (o erro de 29/09). Barrar a igualdade ou só avisar? *Decisão do Klaus.* → Sessão de 13–15/10/2026
- **`expedidaEm` é texto livre** — virar campo de data é decisão de produto. → Sessão de 26/08/2026 (noite)
- **Contador anônimo de funil do questionário** (começou, terminou, foi ao pagamento; sem dado pessoal), para medir o efeito do questionário na conversão. Falta escolher onde gravar os eventos (serviço de analytics ou tabela de eventos). Decisão do Klaus: fora do projeto 1 do questionário. → Sessão de 07/10/2026 (questionário de triagem)
- **Projeto 2 do questionário: consulta ao radar antes do pagamento** — depende das pendências da tese do radar (`RADAR_TESE_ATIVA`, avisos legais, `docs/verificacao-radar.md`, ingestão recorrente) e de proteger a consulta aberta a quem ainda não pagou (desde 12/10 a chave anônima não lê o radar: a consulta passaria por uma Edge Function); `sem_registro` não é "radar irregular". → Sessão de 07/10/2026 (questionário de triagem)
- **Texto do `ComoFunciona` na home contradiz o fluxo novo**: ainda diz "01 Pagamento… a única parte que depende de você é o formulário". Precisa de texto novo do Klaus. → Sessão de 08/10/2026 (revisão final)
- **O resumo do questionário não mostra a advertência** que a peça pede (considerada abaixo da permitida no inciso I; infração leve ou média fora do art. 218). É o texto da spec; sugestão: diagnosticar a advertência pela natureza da infração. → Sessão de 08/10/2026 (revisão final) A gravidade já é conhecida antes do pagamento quando o cliente escolhe da lista (`src/data/enquadramentos.json`). → Sessão de 15–17/10/2026
- **Achados menores da revisão final do questionário:**
  - acessibilidade: grupos de opções e a data do passo 2 sem nome acessível, erro não ligado ao campo (`aria-describedby`), um título repetido e um anúncio duplo para leitor de tela;
  - rascunho do formulário: o aviso "Rascunho guardado" aparece logo ao chegar do questionário, e "Limpar" apaga as respostas, que voltam ao recarregar;
  - o questionário não barra velocidade acima de 400 km/h, como o formulário faz;
  - o teste do fuso (`hojeLocal`) não pega o erro numa máquina em UTC: fixar `TZ` no teste;
  - as respostas no navegador nunca expiram (incluem o relato de quem não comprou);
  - rascunho do formulário anterior ao deploy teria relato sem a escolha de versão (hoje não existe nenhum, o site não está no ar).
  → Sessão de 08/10/2026 (revisão final)
- **Projeto 3 do questionário: defesa em nome do condutor** — com "não, outra pessoa dirigia", pedir os dados de quem dirigia e sair a peça em nome dele, como condutor identificado. Depende de conferir no CONTRAN quem pode assinar a defesa e o paralelo com a indicação. Resolver junto com o "cliente que dirigia mas não é o dono". → Sessão de 07/10/2026 (questionário de triagem)

## Repositório e testes

- **Atualizar o `src/integrations/supabase/types.ts`** — os tipos gerados do banco estão desatualizados: em `form_submissions` faltam `cliente_conduzia`, `data_limite_protocolo`, `velocidade_considerada` e `verificacao_medidor` (conferido contra o banco local em 17/10/2026; só `codigo_enquadramento` foi acrescentado à mão, em 16/10/2026), e as outras tabelas e funções (radar, `reservar_entrega`, `devolver_entrega`) também não foram conferidas. Regerar com `npx supabase gen types typescript --local > src/integrations/supabase/types.ts` (ou `--project-id` contra a nuvem) e conferir que o build e o `tsc` não pioram. → Sessão de 15–17/10/2026 (enquadramento por lista)
- *Menor:* o campo de enquadramento (`CampoEnquadramento`) não tem teste de componente — o projeto não tem biblioteca para isso; a verificação foi no navegador (7 situações, incluindo lista bloqueada e lista atrasada). → Sessão de 15–17/10/2026 (enquadramento por lista)
- *Menores da revisão final do enquadramento por lista:* as setas não rolam a lista (falta `scrollIntoView` na opção ativa); o rótulo do cartão "Escolhido" não fica associado ao botão "Trocar"; falha passageira da lista zera o código e o rascunho o perde (o amparo canônico continua enquadrando); amparo de caput ("Art. 218") com código do mesmo artigo descarta o código mais específico; o extrator não exige consumir a linha inteira (`fullmatch`) e o teste das 439 linhas usa o mesmo regex de `linhas()`; o `CLAUDE.md` ainda diz "`EXTRAS_POR_ARTIGO`, hoje só o art. 61 no 218" antes de citar o 163. → Sessão de 15–17/10/2026 (enquadramento por lista)
- **Branch `chore/limpeza-dependencias`** não mergeada. → Sessão de 20/09/2026
- **`tests/edge-functions/README.md` desatualizado**; nenhum script cobre PDF ou e-mail; sem suíte automatizada do fluxo. → Próximos passos › Fora do caminho crítico
- **`npm run lint`: 7 erros cosméticos** (`any` no `stripe-webhook`, `require()` no `tailwind.config.ts`, interface vazia no `textarea.tsx`). → Sessão de 31/08/2026
