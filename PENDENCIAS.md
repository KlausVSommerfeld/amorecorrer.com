# Pendências

Lista bruta do que ainda está em aberto. O contexto de cada item está no `PROGRESSO.md`, na sessão indicada em `→`.

**Regras:**
- Concluiu → **remova** o item daqui e registre a conclusão no `PROGRESSO.md`.
- Surgiu pendência, etapa, fase ou task nova → **adicione** aqui, com a referência da sessão do `PROGRESSO.md` onde ela nasceu.
- `#N` é o número estável da pendência em `PROGRESSO.md › Pendências e decisões em aberto`. Item sem número não tem entrada lá.
- Sem explicação aqui: uma linha por item.

*Atualizado em 2026-09-24.*

---

## Produção e lançamento

- **#11 Endereço estável do pipeline** — `DISPATCH_PIPELINE_URL` aponta para túnel morto. → Sessão de 31/08/2026 · plano `docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md` (nenhuma task executada):
  - Task 1 — contêineres (`deploy/`) validados localmente
  - Task 2 — VPS na Hostinger, firewall e acesso *(gasta dinheiro; com o Klaus)*
  - Task 3 — subdomínio apontando para o VPS
  - Task 4 — serviços no VPS com TLS (Caddy)
  - Task 5 — Edge aponta para o endereço novo; fluxo em produção *(manda e-mail real; com o Klaus)*
  - Task 6 — documentação
- **Hospedagem do frontend** — zona sem registro `A` na raiz; fora do plano do VPS. → Estado atual · plano do VPS, "Notas de execução"
- **#2 Preço na conta live** — criar produto e os dois preços em `acct_1RrARg…`, `secrets set STRIPE_PRICE_ID_FULL`; decidir prazo global de campanha vs. por visitante. → 2026-08-15 — Preço cheio fora da promoção
- **`.env.production`** — 13 valores ainda como `SUBSTITUA_`. → `CLAUDE.md › Variáveis de ambiente`
- **#25 Caixa de e-mail do produto** — contato oficial é Gmail; `no-reply@` sem caminho de resposta. *Decisão do Klaus.* → Sessão de 13–14/09/2026
- **#17 `VITE_STRIPE_PUBLISHABLE_KEY` `pk_live_…` órfã** — remover ou trocar pela de teste. → Sessão de 03/09/2026
- **#12 Rotacionar a chave `service_role`** — impressa num transcript. → Sessão de 31/08/2026

## Robustez do fluxo

- **#26 `.env.local` sobrescreve variáveis reais de ambiente no Express** (`override: true`) — corrigir e documentar a regra no `CLAUDE.md`. → Sessão de 18/09/2026
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
- **Fase 4: publicar o front** — migration e `form-submit` v63 já estão em produção; falta o build do `Form.tsx` novo (código em `main` desde 24/09). → Sessão de 24/09/2026
  - Confirmar com uma notificação real a dica de "onde encontrar" os números no formulário (texto genérico hoje). → Sessão de 24/09/2026
- **Fase 5 em produção** — `db push` da migration `20260924000001`, **depois** `functions deploy form-submit`. Pelo Klaus, no terminal dele. → Sessão de 24/09/2026 (Fase 5)
- **Ligar `RADAR_TESE_ATIVA`** — só depois da Fase 0.5 assinada. → Sessão de 24/09/2026 (Fase 5)
  - Confirmar o dispositivo do CONTRAN antes de acrescentá-lo a `REGRAS_RADAR` (risco 3). → plano §7
  - *Decisão do Klaus:* com vigência comprovada, o DeepSeek ainda pede o certificado por conta própria ao ver `medidor_numero_serie` no formulário. Omitir os campos `medidor_*` do contexto nesse caso? → Sessão de 24/09/2026 (Fase 5)
- **Prompt base: placeholders e notas ao usuário na peça** — o DeepSeek escreve `[Local], [data]`, `[Nome do recorrente]` (mesmo com o nome no contexto) e fecha com "Observação: os campos entre colchetes… precisam ser completados" — tudo iria ao PDF. Anterior à Fase 5, visto nas rodadas reais dela. → Sessão de 24/09/2026 (Fase 5)
- **Fase 6 — observabilidade** — alerta de `record_count`, frescor como métrica (fonte congelada), view `radar_revisao_pendente`, métricas mensais. → Sessão de 21/09/2026 · plano §6
- **Fase 7 — OCR da notificação** — só abrir issue; fora desta branch. → plano §6
- **#21 De onde a ingestão *recorrente* busca o arquivo** — RBMLQ recusa IP de nuvem; testar `curl` a partir do VPS. → Sessão de 06/09/2026 (fim da noite) · Sessão de 20/09/2026
- **#19 Retenção dos snapshots + `pg_cron` + poda** — *decisão do Klaus*; nunca podar snapshot citado em `radar_consultas_log`. → Sessão de 03/09/2026 (noite) · Sessão de 21/09/2026
- **`docs/verificacao-radar.md`** — ingestão manual, significado de cada status, texto dos avisos legais. → plano §8

## Produto e formulário

- **#8 "HTML da peça"** — implementar ou deixar fora. → 2026-08-15 — Home (Fase 3)
- **`expedidaEm` é texto livre** — virar campo de data é decisão de produto. → Sessão de 26/08/2026 (noite)

## Repositório e testes

- **Branch `chore/limpeza-dependencias`** não mergeada. → Sessão de 20/09/2026
- **`tests/edge-functions/README.md` desatualizado**; nenhum script cobre PDF ou e-mail; sem suíte automatizada do fluxo. → Próximos passos › Fora do caminho crítico
- **`npm run lint`: 7 erros cosméticos** (`any` no `stripe-webhook`, `require()` no `tailwind.config.ts`, interface vazia no `textarea.tsx`). → Sessão de 31/08/2026
