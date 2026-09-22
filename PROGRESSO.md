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


*Atualizado em 2026-09-22.*

- **O merge aconteceu.** Em 20/09/2026 o Klaus mergeou `feat/verificacao-radar-inmetro-rj` em `main` (`f155c4e`, merge de `a3b2142` com `c89d0c4`): **115 arquivos, +23.526 / −1.408**. `main` deixou de estar parada em 2025-10-29 e `origin/main` já tem tudo, sem divergência. Todo o produto — pagamento, Edge Functions, pipeline, redesenho e o schema do radar — passou a viver no tronco. Sobrou uma branch não mergeada, `chore/limpeza-dependencias`. **Encerra as pendências 1 e 7.**
- **O redesenho "Notificação e Resposta" está completo** — Fases 0 a 4. Todas as páginas usam o mesmo casco, a mesma tipografia e os mesmos tokens.
- **O site não para mais de vender depois de 30 minutos.** O fim da promoção agora só tira a moldura promocional; o CTA continua ativo.
- **O fluxo funciona ponta a ponta**, com a peça redigida por IA — provado em ambiente local (03/09, por dois caminhos independentes) e **em produção** (18/09): Edge publicada → internet → pipeline, `document_status = completed`, `dispatches.status = sent`, PDF no Storage de produção com sha256 conferido e e-mail **entregue a partir de `no-reply@amorecorrer.com`** via `sa-east-1`. O domínio está verificado na Resend desde 17/09 e `Active` até 2027, com auto-renovação ligada.
- **O que falta para produção é onde o pipeline mora, não se ele funciona.** `DISPATCH_PIPELINE_URL` aponta para um túnel `trycloudflare` morto. O plano escrito em 17/09 — `docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md`, seis tasks, Express e pipeline em contêineres num VPS da Hostinger atrás de um Caddy — **ainda não teve nenhuma task executada**, e não há artefato de deploy no repositório. O frontend também segue sem hospedagem, explicitamente fora daquele escopo.
- **Produção roda o schema e as Edge Functions corrigidos** (11/09): `form-submit` v60, `stripe-webhook` v53 e as quatro migrations com impressão digital idêntica à do local. As tabelas do fluxo estão **zeradas** — o caso do teste de 18/09 foi removido.
- **O teste em produção deixou uma correção e uma pendência:** `supabase-py` subiu para 2.31.0 (a versão fixada recusava a chave `sb_secret_…` antes de qualquer requisição), e a divergência de precedência de `.env` entre Express e pipeline virou a **pendência 26**, ainda aberta.
- **O schema são quatro migrations** (09-10/09): a baseline que consolida as doze antigas e as corrige, as duas do radar e a do bucket `generated-recursos`. Quinze anomalias levantadas, quatorze fechadas.
- **A verificação de radar deixou de ser inerte em 22/09/2026.** As tabelas `radar_*` de produção, que tinham 0 linhas desde 06/09, agora carregam o parque do RJ: **1.971 instrumentos, 3.346 faixas e 9.652 verificações** (7.814 de origem `historico`, 1.838 de `topo`), mais o arquivo bruto de 3.661.867 bytes arquivado em `evidencias/radares/RJ/2026-09-22-4dcb3d35ee37.json`. A RPC `verificar_medidor`, escrita em 06/09 e testada só contra fixture, **respondeu com dado real pela primeira vez**: para o série `2000065` em 01/09/2026 devolveu `comprovado_valido`, confiança alta, match por número de série, com `sha256` e `snapshot_id` no bloco de evidência.
- **A Fase 2 foi entregue pela metade, e de propósito.** A ingestão existe (`scripts/ingest-radares-rj.ts` + `scripts/lib/psie.ts` e `retry.ts`, 34 testes), mas roda **manualmente, da máquina do Klaus**, porque é a rede dele que o RBMLQ aceita — a saída (a) que a §5.1.2 do plano já previa. **Não existe `pg_cron` nem poda de retenção**, e isso deixa a pendência 19 intocada. **As Fases 4, 5 e 6 não começaram:** a coluna `form_submissions.verificacao_medidor`, que é o contrato de saída da feature, **não existe em migration nenhuma**, e `src/`, `server/` e `pipeline/` seguem sem uma linha sobre o assunto. O dado está no banco e ainda **não tem consumidor**.
- **O que trava o radar agora são duas coisas, não três.** A pendência 21 (de onde a ingestão busca o arquivo) deixou de bloquear a carga — passou-se a conviver com ela, rodando à mão —, mas continua aberta para qualquer ingestão *recorrente*. Seguem travando: a Fase 0.5 (pendência 18), que exige 8 a 10 casos reais de excesso de velocidade no RJ, e `form_submissions` está **vazia** em produção; e a decisão de retenção (pendência 19), agora só quando houver cron. **O VPS do passo 7 continua podendo resolver a 21 de carona:** um `curl` ao arquivo do RJ a partir dele custa um minuto e é a regra que o próprio plano escreveu.
- **A fonte do INMETRO está parada há três semanas.** Medido em 21/09: o arquivo do RJ responde `200` com `Last-Modified: 01/09/2026` e **os mesmos 3.661.867 bytes, sha256 `4dcb3d35…648fb9b`** — byte a byte o snapshot de 03/09. Não é "atualização irregular, apesar de nominalmente diária": são **21 dias sem regenerar**. Isso derruba a premissa de custo da pendência 19 e é um risco de produto, porque a prova de vigência envelhece junto com a fonte. A mesma requisição prova que o endpoint está no ar e aceita a rede do Klaus — o que reforça que a pendência 21 é bloqueio de ASN de nuvem, e não fonte fora do ar.
- **O projeto Supabase da nuvem está ativo** desde 06/09, despausado para o teste de alcance. Continua consumindo recursos.
- **Sem suíte automatizada.** A verificação é manual, via os 4 scripts PowerShell em `tests/edge-functions/` — que param no formulário —, mais os 24 testes pgTAP do radar e a asserção de Storage.

---

## Próximos passos

*Atualizado em 2026-09-20.* Esta seção é o **roteiro em ordem de execução**. A lista de **Pendências**, logo abaixo, é o backlog completo — inclui o que não está no caminho crítico.

### Concluídos

Detalhe de cada um na entrada de sessão correspondente, ao fim do arquivo.

1. ~~**Excluir as Edge Functions órfãs**~~ — 11/09. `submit-form` (pública, sem JWT, com mass assignment), `force-log-webhook` e `teste-fetch-inmetro`. Restaram só as três do repositório.
2. ~~**Publicar as Edge Functions corrigidas**~~ — 11/09. `form-submit` v60 e `stripe-webhook` v53, conferidas campo a campo contra o repositório. A checagem pré-deploy revelou que a produção estava **um mês atrás** do repositório no webhook, reescrevendo o `id` de sessões existentes.
3. ~~**Reconstruir o schema remoto**~~ — 11/09. `db reset --linked` com as quatro migrations; impressão digital de 201 itens idêntica à do local.
4. ~~**Rodar o fluxo ponta a ponta com PDF e e-mail**~~ — 15/09, **em modo sandbox**. `completed / sent / emailed`, com a Resend reportando `delivered` e o sha256 do PDF conferido. Não prova entregabilidade do domínio próprio.

**A ordem entre os passos 2 e 3 não era arbitrária** e vale guardar como lição: a Edge tinha de subir **antes** do schema. A `form-submit` antiga usa `.upsert()` sem informar `document_status`, que passou a ser `NOT NULL` sem `DEFAULT` — invertida, a ordem teria quebrado todo envio de formulário. As duas direções foram medidas antes do deploy.

### Em aberto, na ordem em que devem acontecer

5. ~~**Renovar o domínio `amorecorrer.com`**~~ — **FEITO em 17/09/2026**, com 25 dos ~30-45 dias de carência consumidos. `Active` até 23/08/2027, e a **auto-renovação foi religada** — era o `is_auto_renewed: false` que causou tudo isto. Ver pendência 24.

6. ~~**Destravar a entrega de e-mail pelo domínio próprio**~~ — **FEITO em 17/09/2026.** Com a renovação, a zona voltou aos nameservers normais da Hostinger, e os quatro registros da Resend foram publicados **pela API**, sem painel: DKIM em `resend._domainkey`, SPF TXT e MX em `send`, e o CNAME `rsend`. Aplicados com `overwrite: false`, preservando o `CNAME www` que já existia. Propagaram de imediato (TTL 300) e a Resend reporta **`verified`** nos quatro.

   **Armadilha da API da Hostinger, para a próxima:** a prioridade do MX **não** vai num campo `priority` — nem no registro nem na entrada da zona. Ambos devolvem `500`. Vai **dentro do `content`**, no formato de arquivo de zona: `"10 feedback-smtp.sa-east-1.amazonses.com"`. Validar por `DNS_validateDNSRecordsV1` antes de aplicar economiza a descoberta.

   **O que isto destrava:** `MAIL_FROM=no-reply@amorecorrer.com` passa a ser remetente válido para **qualquer** destinatário — não só o dono da conta, como no sandbox. Falta repetir o teste ponta a ponta em modo real, que é o que prova entregabilidade e caixa de entrada versus spam.

7. **Endereço estável para o pipeline** (pendência 11). — *decisão do Klaus.*
   `DISPATCH_PIPELINE_URL` aponta para um túnel `trycloudflare` morto. Sem endereço estável não há produção, mesmo com e-mail funcionando.

8. **Desenhar a caixa de e-mail do produto** (pendência 25). — *depende do 5; decisão do Klaus.*
   Hoje o contato oficial é `amorecorrer@gmail.com`, exposto no rodapé e nas duas páginas jurídicas, e o recurso sai de `no-reply@` sem caminho de resposta. Enviar e receber **não competem**: a Resend usa MX em `send.`, deixando o MX da raiz livre.

9. ~~**Merge para `main`**~~ — **FEITO em 20/09/2026**, pelo Klaus, em merge direto (`f155c4e`): 115 arquivos, +23.526 / −1.408, já em `origin/main`. A separação dos dois assuntos (radar e consolidação de schema) que esta linha recomendava **não** aconteceu — a branch entrou inteira —, e vale registrar que o custo disso é de revisão, não de código: o que foi mergeado já rodava em produção. Ver pendência 1.

### Fora do caminho crítico

- **`UNIQUE` em `form_token`** (pendência 22) — exige escopar o token por caso em `src/pages/Form.tsx` antes; hoje o mesmo navegador reusa o token entre compras.
- **Caminho legado do `202`** — se o pipeline responder `200`, a Edge grava `generating`, chama `confirm_dispatch` ela mesma, e o `document_status` fica **preso em `generating` para sempre**, porque o Express nunca é chamado.
- **Dois conjuntos de `.env`** (pendência 13) — decidir o canônico e apagar o outro.
- **`tests/edge-functions/README.md` desatualizado** — e nenhum dos quatro scripts cobre PDF ou e-mail.

## Pendências e decisões em aberto

Os números são **identificadores estáveis**, não posições — sessões antigas referenciam por eles, então nada é renumerado. As abertas vêm ordenadas pelo custo de continuar adiando; as resolvidas ficam ao fim, para o histórico.

### Abertas (15)


26. 🔴 **`.env.local` sobrescreve variáveis REAIS de ambiente no Express — e não no pipeline.** Descoberto em 18/09/2026, e é a mesma família do 401 silencioso de 31/08. `server/src/index.ts:28` carrega com `dotenv.config({ override: i > 0 })`, e `override: true` sobrepõe até o que já está em `process.env`; `pipeline/config.py`, com `pydantic-settings`, faz o **oposto** — ambiente real vence os arquivos. Rodando os dois contra produção com as variáveis passadas pelo ambiente, o pipeline assinou com o segredo de produção e o Express verificou com o local: **401**. A regra que o `CLAUDE.md` documenta ("carrega-se `.env` e depois `.env.local`, quem vem depois ganha") vale para arquivo-contra-arquivo e **não diz nada sobre variáveis de ambiente**, que é justamente onde os dois divergem. O próprio código oferece a saída (`DOTENV_CONFIG_PATH`, que carrega só o arquivo indicado), usada no teste. **Some em contêiner**, onde não existe `.env.local` — mas morde em qualquer execução local contra a nuvem, e o `CLAUDE.md` precisa dizer isso.
24. ~~**O domínio `amorecorrer.com` está EXPIRADO, e há prazo correndo.**~~ **RESOLVIDA em 17/09/2026** — o Klaus renovou, com 25 dos ~30-45 dias de carência consumidos. Conferido em quatro fontes: Hostinger `Active` até 23/08/2027; assinatura `active` com **auto-renovação religada** (`is_auto_renewed: true`, cobrança em 27/07/2027 — era o `false` que causou tudo isto); registro com NS migrados de `DNS-EXPIRED` para `DNS-PARKING`; e o TXT `"This domain is expired at Hostinger!"` finalmente fora do ar. A expiração seguir em 2027-08-23 está correto: a renovação converteu em pagamento a renovação protetiva que a Hostinger já havia feito no registro, sem empilhar um ano extra. Registro original abaixo, para o histórico:

     Descoberto em 14/09/2026 pela API da Hostinger, não pelo painel. Venceu em **23/08/2026**; a assinatura `.COM Domain` está **cancelada**, com `is_auto_renewed: false` e renovação de **R$ 96,08**. O registro na Verisign mostra 2027-08-23 porque a Hostinger fez a renovação protetiva no registro para segurar o nome durante a carência — **não porque esteja pago**. Se a carência vencer sem pagamento, a Hostinger apaga o domínio, recebe o crédito de volta e o nome cai; depois vem redemption, muito mais caro, e depois qualquer um registra. A janela típica é de 30 a 45 dias a partir de 23/08 — **o prazo exato só a Hostinger confirma, e é a primeira coisa a fazer**. Isso explica a zona em `dns-expired.com`, a ausência de hospedagem e a ausência de plano de e-mail: não é o DNS que quebrou, é o serviço que acabou. **Todo o resto do roteiro de e-mail pressupõe um domínio que continue seu.**
25. **A caixa de e-mail do produto não foi desenhada, e hoje o contato oficial é um Gmail.** `VITE_CONTACT_EMAIL = amorecorrer@gmail.com`, exposto no rodapé (`Rodape.tsx:41`) e nas páginas de **Termos** (`Terms.tsx:117`) e **Privacidade** (`Privacy.tsx:160`). Some-se a isso que o recurso sai de `no-reply@amorecorrer.com`: **quem responder ao e-mail do próprio recurso fala com o vazio**. O brainstorming de 14/09 foi interrompido pelo achado da pendência 24, mas levantou o essencial — enviar e receber **não competem**: a Resend usa MX no subdomínio `send.`, deixando o MX da raiz livre, então destravar o envio não fecha nenhuma porta de recebimento. Os caminhos são encaminhamento gratuito (Cloudflare Email Routing, sem caixa real), caixa de verdade (Hostinger Mail, plano novo — a conta tem **zero** pedidos de e-mail), recebimento programático (Resend inbound, webhook e não caixa humana), ou manter o Gmail. **Decidir depois da 24.**
1. ~~**`main` está 36 commits atrás.**~~ **RESOLVIDA em 20/09/2026:** o Klaus mergeou `feat/verificacao-radar-inmetro-rj` em `main` (`f155c4e`), 115 arquivos e +23.526 linhas, com `origin/main` em dia e sem divergência. Aberta desde 31/08 — quando a conta era de 36 commits, e chegou ao merge com 55. Continua fora do tronco apenas `chore/limpeza-dependencias`.
2. **O preço cheio existe só no sandbox** e a regra que escolhe entre os dois é decidida pelo navegador — quem limpar o `sessionStorage` paga R$ 19,99 para sempre. Duas frentes em aberto: replicar produto e preços na conta live, e decidir se a urgência vira um prazo global de campanha (verificável no servidor) ou continua por visitante.
3. **Autenticação bearer está desligada.** O bloco de validação está comentado em `create-checkout-session` e `form-submit`, com `verify_jwt = false`. Toda a infra existe e não é usada; hoje `form-submit` é protegida só por whitelist de origem e existência do `case_id`.
6. **Sem fila durável no pipeline.** Se o processo morrer entre o `202` e o `finish`, o caso fica preso em `generating` sem retry.
7. ~~**O redesenho acabou; falta o merge.**~~ **RESOLVIDA em 20/09/2026** junto com a pendência 1: as Fases 0–4 do redesenho estão em `main`.
8. **"HTML da peça" é oferta ou aspiração?** O card que prometia uma versão HTML saiu na Fase 3 porque o pipeline só entrega PDF. Decidir entre implementar ou deixar fora.
11. **`DISPATCH_PIPELINE_URL` aponta para um túnel `trycloudflare` morto.** Esses endereços são efêmeros e morrem junto com o processo do túnel. Ou se sobe um túnel novo a cada sessão, ou se adota um endereço estável (Cloudflare Tunnel nomeado, ou o pipeline publicado). **É o item que falta para produção.** Em teste local, `http://host.docker.internal:8000/hooks/dispatch` resolve, porque a Edge roda em container e não enxerga o `127.0.0.1` do host.
16. ~~**O domínio `amorecorrer.com` não está verificado no Resend.**~~ **RESOLVIDA em 17/09/2026:** os quatro registros publicados pela API da Hostinger e a Resend reportando `verified`. Aberta em 03/09, foi a pendência mais longeva do projeto — e a causa real (domínio expirado, pendência 24) só apareceu onze dias depois. *Atualizada em 13/09/2026:* o domínio foi **criado na conta** (região sa-east-1) e os quatro registros a publicar estão no passo 4 do roteiro. Antes disso a conta não tinha domínio nenhum, o que corrige o diagnóstico original.

    Registro original: Descoberto em 03/09/2026: com `PIPELINE_ENV=production`, o envio é recusado no estágio DATA com `550 — The amorecorrer.com domain is not verified`, e com o remetente de teste `onboarding@resend.dev` a conta só aceita entregar em `klaus.velando@gmail.com`. Conexão, STARTTLS, AUTH e destinatário passam: **as credenciais estão certas, falta a verificação de domínio em resend.com/domains.** É bloqueio de produção — enquanto durar, todo caso pago gera o PDF, guarda no Storage e termina em `document_status = failed`.
17. **`VITE_STRIPE_PUBLISHABLE_KEY` é uma chave `pk_live_…` órfã.** Convive com um `sk_test_…` no mesmo arquivo e não é consumida em lugar nenhum de `src/`. Inofensiva hoje só por não ter consumidor; remover ou trocar pela chave de teste encerra o risco.
12. **Rotacionar a chave `service_role`.** Ela está em texto puro em `server/.env` e `pipeline/.env` (fora do git, verificado), mas foi impressa no transcript da sessão de 31/08 por um comando de inspeção mal filtrado. Nada saiu da máquina; rotacionar é barato e encerra a dúvida.
18. **A feature do radar está bloqueada por uma fase que hoje não roda.** A Fase 0.5 do `PLANO-verificacao-radar-inmetro.md` é declarada bloqueante e exige 8 a 10 casos reais de excesso de velocidade no RJ já em `form_submissions`, para conferir manualmente se os certificados das notificações aparecem na base pública. O produto não lançou: não existem casos reais. São três saídas, e a escolha é do Klaus — (a) usar notificações suas ou de conhecidos, (b) coletar amostras de notificações do DETRAN-RJ e da Prefeitura, ou (c) inverter a ordem: entregar as Fases 1–3 e 6 como triagem interna, sem conectar à IA jurídica, e adiar a decisão até haver volume real. A (c) é a que o próprio plano descreve como "cenário desfavorável", e a medição de 03/09 a tornou a mais provável. **Em 06/09 a (c) começou a acontecer de fato:** as Fases 0, 1 e 3 foram entregues como infraestrutura de triagem, sem nenhuma conexão com a IA jurídica. O bloqueio agora vale só para a Fase 5.4.
21. **De onde a ingestão vai buscar o arquivo?** `servicos.rbmlq.gov.br` recusa o IP de saída da Supabase — erro de TCP, antes de TLS —, enquanto `dados.gov.br`, `www.gov.br` e `example.com` respondem normalmente da mesma função. É bloqueio específico daquele servidor contra ASN de nuvem, não geografia. Consequências: **o GitHub Actions, alternativa que o plano listava, roda em IPs da Azure e quase certamente apanha igual**; e o `server/` (Express) baixa hoje **só porque roda na sua máquina, na sua conexão** — numa nuvem, provavelmente apanha também. As saídas são (a) rodar a ingestão numa máquina em rede aceita, inclusive a sua, agendada, ou (b) um proxy de saída em rede aceita, com o runtime na nuvem só consumindo. **Nenhuma das duas está desenhada no plano**, e a escolha é de arquitetura. Regra que ficou escrita: antes de escolher runtime, teste o alcance com um `curl` a partir do endereço real de produção — é barato e já se provou que o palpite erra.
19. **O prazo de retenção dos snapshots do INMETRO é decisão sua.** *(Atualizada em 21/09/2026: a premissa de frequência abaixo é hoje falsa — a fonte está congelada desde 01/09, 21 dias, com bytes idênticos. Deduplicando por sha256, a conta de custo despenca e a decisão fica menos urgente; o que sobe é o risco de a prova ficar velha.)* O arquivo do RJ tem 3,66 MB e é regenerado quase todo dia: guardar tudo custa ~1,35 GB por ano contra 1 GB de free tier, e o bucket estoura em torno de nove meses. A proposta escrita no plano é 90 dias completos e depois um snapshot por mês, **nunca apagando** um snapshot citado como evidência em `radar_consultas_log` — essa exceção não é negociável, é o que sustenta peça já protocolada. O que é negociável é o prazo: é troca entre custo de storage e profundidade da prova histórica. Precisa estar decidido antes de ligar o cron da Fase 2.
22. **`UNIQUE` em `form_token` foi pedido e recusado, com motivo.** Em 09/09/2026 a restauração da constraint entrou no escopo e foi retirada na hora de aplicar: `src/pages/Form.tsx` guarda o token em `localStorage` sob chave fixa e só gera outro se não houver nenhum, então **um cliente que compre duas vezes no mesmo navegador reenvia o MESMO `form_token` com `case_id` novo** — o UNIQUE recusaria o envio de quem já pagou. Foi provavelmente por isso que ele caiu lá atrás. Para restaurá-lo, escopar o token por caso no front vem primeiro.
13. **Dois conjuntos completos de `.env` convivem** — os `.env.local` (local) e os `.env` (nuvem), cada um com seu próprio segredo HMAC. Foi essa duplicação que criou a armadilha corrigida em 31/08. Enquanto os dois existirem, qualquer divergência de precedência entre serviços volta a quebrar o fluxo em silêncio. Decidir qual é o canônico e apagar ou renomear o outro.


---

### Resolvidas (8)

4. ~~**Duas assinaturas de `attempt_dispatch` convivem**~~ **Resolvida em 09/09/2026, e a premissa estava errada:** só existe `p_case_id`, em produção e no local — a variante `case_id` foi dropada pela antiga `20260206120000`. O que existia de verdade era o desperdício nos callers, que tentavam as duas e engoliam o erro da inválida; corrigido junto.
5. ~~**Dark mode órfão.**~~ **Resolvido em 26/08/2026:** toggle implementado e `.dark` reescrito a partir da paleta (ver a entrada da sessão abaixo).
9. ~~**O disco `C:` está cheio.**~~ **Resolvido em 01/09/2026** — e o alvo não era o `C:`: o que estava cheio por dentro era o `docker_data.vhdx` (33,8 GB). `docker system prune -a --volumes` liberou 8,65 GB internos e a stack voltou a subir. Ver a entrada da sessão.
10. ~~**O projeto Supabase da nuvem está pausado.**~~ **Resolvido em 06/09/2026:** despausado para o teste de alcance da pendência 20. Voltou a `ACTIVE` e a consumir recursos — **decidir se fica de pé ou se repausa.** De quebra, com a API no ar confirmou-se que `submit-form` (v17) e `force-log-webhook` (v9) **existem mesmo no remoto** e não estão no repositório: são órfãs, e continuam sem issue aberta. **Em 09/09/2026 li o código da `submit-form` e ela é pior que órfã:** `verify_jwt=false`, `Access-Control-Allow-Origin: '*'`, sem rate limit, e faz `.insert({ ...formData, ... })` — mass assignment na tabela central, com o chamador podendo escrever qualquer coluna, inclusive `document_status`. Hoje é inerte **por acidente**: o insert inclui `payment_status`, coluna que não existe em `form_submissions`, então toda chamada morre no PostgREST. É o mesmo fóssil que quebrava a antiga `20250101000005`. Excluir é prioridade.
14. ~~**O bucket `generated-recursos` não está versionado.**~~ **Resolvida em 10/09/2026:** `20260910000000_bucket_generated_recursos.sql` cria o bucket privado e sua policy, no mesmo padrão que a migration do radar já usava para o `evidencias`. Entrou como migration própria, e não dentro da baseline, para rodar tanto num remoto reconstruído quanto num que só receba `db push`. **O que faltava não era só a migration:** buckets e policies de Storage não entram no `supabase db dump`, que cobre apenas o schema `public` — nenhum diff de migration pegaria a regressão. Por isso entrou junto `tests/sql/assert_storage_setup.sql`, que falha se qualquer um dos dois buckets sumir ou virar público. Verificado do zero: asserção falhando antes, `db reset`, asserção passando, e upload real com a chave de service role devolvendo 200.
15. ~~**A redação por IA nunca foi testada de ponta a ponta.**~~ **Resolvida em 03/09/2026 quanto à IA:** com a chave carregada, o DeepSeek redigiu peça própria e verificável (3168 bytes contra 1957 do placeholder), citando os dados do formulário e a legislação. A outra metade — o e-mail — não passou, e virou a pendência 16.
20. ~~**Não se sabe se uma Edge Function consegue alcançar o endpoint do INMETRO.**~~ **Respondido em 06/09/2026: não consegue.** Ver a entrada da sessão e a §5.1.2 do plano. Virou a pendência 21, que é maior.
23. ~~**O schema remoto precisa ser RECONSTRUÍDO, não reparado.**~~ **Resolvida em 11/09/2026** com `db reset --linked`, e verificada por impressão digital de schema idêntica à do local. Produção deixou de rodar o schema antigo.

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


---

## Sessão de 03/09/2026 (noite) — Revisão do plano do radar: 297 instrumentos mal classificados e uma arquitetura fantasma


Sessão de análise, sem uma linha de código de produção tocada. O `PLANO-verificacao-radar-inmetro.md` chegou como arquivo solto na raiz — especificação de uma feature nova: para cada multa de velocidade no RJ, dizer se o radar tinha certificado de verificação do INMETRO vigente na data da infração. Li o documento inteiro e cruzei cada afirmação sua com o código e com o dado real. **Os dois lados tinham problema, e os problemas eram independentes.**

**O plano conversava com um sistema que não existe mais.** A seção de estado do repositório descrevia a arquitetura **n8n**: `Form.tsx` mandando o formulário direto ao webhook com Basic Auth em `VITE_N8N_BASIC_USER`/`PASS`, Edge Functions `submit-form` e `force-log-webhook`, e a integração final desenhada como "payload → n8n → IA jurídica". Nada disso existe: `grep -rn "n8n" src/` não retorna uma linha, há exatamente três Edge Functions, e a perna de IA é `server/` + `pipeline/` desde a refatoração. Confirmou-se só uma coisa daquela seção — os tipos gerados em `src/integrations/supabase/types.ts` estão mesmo vazios. **A "dívida de segurança de prioridade alta" que o plano mandava abrir como issue tinha sido resolvida junto com a saída do n8n.**

**A boa notícia é que a correção simplifica.** O `GET /internal/cases/:caseId` do Express faz `.select("*")` em `form_submissions` (`server/src/index.ts:164`) e devolve a linha inteira, que `build_case_context` (`pipeline/worker.py:141`) serializa como `chave: valor` para o prompt. Ou seja: **uma coluna `verificacao_medidor jsonb` chega à IA sem uma única linha de código de transporte.** A etapa inteira que o plano gastava montando payload some. O trabalho que sobra é outro, e o plano não sabia dele: `build_case_context` despejaria o jsonb como dict Python cru no prompt, e o *system prompt* de `call_deepseek` é genérico — é ali que as regras de redação por status precisam entrar, não num nó de workflow.

**O erro no dado era mais sério, porque tinha consequência jurídica.** Baixei o arquivo do RJ (`servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json`, 3.661.867 bytes, sha256 `4dcb3d35…48fb9b`) e refiz as contas. **O censo do plano reproduziu-se integralmente** — 1.971 instrumentos, 7.814 verificações, 311 sem histórico, 42 certificados com duração zero, os quatro valores de `Resultado`, os cinco de `TipoServico`. Só um desvio irrelevante nos números INMETRO distintos (1.815/8 contra 1.816/9). O trabalho de dados era confiável; o que estava errado era o que se fazia com ele.

**O achado: o par do topo.** Cada registro traz, fora do array `Historico`, um par `DataUltimaVerificacao` + `DataValidade`. Nos instrumentos que têm histórico, ele é redundante — coincide com o laudo mais recente em **1.659 de 1.660**. Mas entre os **311 com `Historico: []`**, **297 têm esse par válido, datado e com `UltimoResultado: "Aprovado"`**, e em **225** deles a validade cobre hoje. A regra do plano — "histórico vazio → `sem_registro`" — classificaria errado esses 297. **São 14, não 311, os instrumentos sem registro algum.** E como `sem_registro` recebia a mesma redação de `nao_comprovado`, a peça pediria ao órgão que exibisse um certificado que a própria base pública já mostra vigente. Era exatamente o modo de falha que o plano fora escrito para evitar, acontecendo dentro da especificação.

**O erro cresce onde o produto vive.** Incluir o par do topo muda pouco no passado e muito no presente: **+32** casos numa infração de jun/2024, **+228** numa de set/2026 — 11,6 pontos percentuais. Justamente na faixa de datas que chega ao site, já que recurso tem prazo.

**E ele responde metade da pergunta que o plano dizia não saber responder.** O documento pergunta se as lacunas de cobertura significam que os radares operaram sem verificação **(a)** ou que a base de dados abertos é incompleta **(b)**, e diz que a resposta define se a feature gera tese jurídica ou só tria. Pois os 297 são prova de que **(b) ocorre**: o mesmo arquivo afirma que houve verificação e, ao mesmo tempo, não a lista. Se o array pode estar vazio havendo verificação, pode estar parcial havendo várias. Não mede o tamanho de (b), mas desloca o ônus da prova e torna o cenário conservador o mais provável — feature de triagem, não geradora de tese.

**Um detalhe operacional que muda um alerta:** o arquivo respondia com `Last-Modified: 01/09/2026` num acesso de 03/09. **Três dias sem regenerar**, contra o "diariamente" que o plano registrava. O alerta de ">48h sem snapshot novo" que a Fase 6 previa tocaria por conta do INMETRO, não do nosso pipeline — e alerta que toca por motivo alheio é alerta que se aprende a ignorar. Separei os dois: falha de execução é alerta; fonte parada é métrica, com limiar folgado.

**Correções menores, todas verificadas no código:** o log de auditoria da feature se amarrava por um `submission_id` que não existe neste sistema — a identidade é o `case_id`, e é por ele que as quatro tabelas se ligam. A fase de captura pedia três campos de velocidade novos, mas `velocidade_permitida` e `velocidade_aferida` **já existem** no formulário, em `form-submit` e na tabela desde `20250101000003` — seria duplicata semântica. E o `dup_guard` não inclui os campos do medidor: ou eles entram no hash, e um reenvio que só corrija o número de série vira submissão nova, ou ficam de fora e a correção é ignorada em silêncio. Deixei a decisão explícita no plano, para ser registrada no PR.

**Arquivos:** `PLANO-verificacao-radar-inmetro.md` (de 709 para 921 linhas, commit `f5e91f9`) e `PROGRESSO.md`. **Nenhum código de produção tocado.**

**Verificação:** uma requisição HTTP ao endpoint público do INMETRO (CC0, sem autenticação, `User-Agent` identificado como o plano exige) e três scripts de contagem rodados sobre o arquivo baixado. Os números do plano foram reproduzidos antes de serem contestados — foi assim que ficou claro que o censo estava certo e a interpretação é que não estava.

**Ficou de fora:** nada foi implementado — não há migration, Edge Function nem coluna nova. O `docs/verificacao-radar-calibracao.md` que a Fase 0.5 pede também não foi escrito: esta medição preenche a parte que se responde só com dado, mas a outra metade depende de conferir notificações reais uma a uma, e casos reais é o que o produto ainda não tem. Virou a pendência 18.


---

## Sessão de 06/09/2026 — A feature do radar saiu do papel: Fases 0, 1 e 3


Klaus mandou implementar o plano. Registrei que continuo achando que o lançamento deveria vir antes — o produto ainda não consegue enviar um e-mail (pendência 16) — e implementei na ordem que sobrevive aos bloqueios: **Fases 0, 1 e 3**, que rodam inteiras no Supabase local, sem depender do projeto remoto pausado nem de casos reais de multa. As Fases 2, 4, 5 e 6 não foram tocadas.

**A branch não saiu de `main`, como o plano mandava.** `main` está 42 commits atrás e não tem produto nenhum; sair dela seria começar sem o sistema. A `feat/verificacao-radar-inmetro-rj` nasceu da `feat/ajuste-frontend-claudecode`. É a regra do próprio plano se aplicando a ele mesmo: onde o documento e o código divergirem, o código vence.

**Fase 0 — fixture e baseline.** 23 registros reais do RJ escolhidos a dedo, cada um com o caso-limite que justifica sua presença documentado num README ao lado. O plano pedia 20; os casos `ambiguo` exigem quatro registros (dois pares de colisão de número de série) e cortar para o número redondo deixaria um teste sem fixture — o 20 não tinha razão técnica, a cobertura tem. Baseline anotado **antes** de qualquer mudança, para não confundir dívida velha com dívida nova: lint nos mesmos 7 erros e 7 avisos de sempre, build verde.

Um achado de dados: **o único registro sem `Faixas` de todo o RJ é lixo de cadastro** — município "SÃO JOSÉ DO NORTE", que fica no Rio Grande do Sul, com `SiglaUf` RJ, `LocalVerificacao` igual a `1'`, sem faixas e sem histórico. Continua servindo como teste de robustez, mas reforça que a ingestão precisa tolerar lixo sem abortar.

**Fase 1 — schema.** Cinco tabelas, RLS explícita, e três decisões que o plano não previa porque só aparecem quando o Postgres reclama:

- `unaccent()` é **STABLE, não IMMUTABLE**, e coluna gerada exige IMMUTABLE. A `local_via_norm` precisou de um wrapper `radar_unaccent_imutavel()` fixando o dicionário. Sem ele a migration simplesmente não aplica.
- `radar_faixas.sentido` entra na chave primária e a origem manda string vazia: `NOT NULL DEFAULT ''`, senão a PK quebra.
- Um índice de expressão sobre `resultado->'evidencia'->>'snapshot_id'`, que é exatamente o que a retenção vai consultar para nunca podar a prova de uma peça já entregue.

**A RLS foi verificada por comportamento, não por existência de policy.** O primeiro teste do log de auditoria deu "0 linhas para anon" — numa tabela vazia, o que não prova nada. Refiz com uma linha real dentro: `postgres` vê 1, `anon` vê 0. `anon` lê as quatro tabelas de dados públicos e tem o INSERT recusado pela política.

**O `db reset` provou a pendência 14 de forma literal.** Depois de reconstruir o banco do zero, o bucket `evidencias` — criado pela migration — estava lá, e o `generated-recursos` tinha sumido, porque é criado à mão. Restaurei o seu para não deixar o ambiente quebrado. O padrão que resolve a pendência agora existe escrito e testado; falta só replicá-lo, em branch própria.

**Fase 3 — a RPC, e o bug que os testes acharam.** `verificar_medidor` faz o match em cascata (série → número INMETRO → município + similaridade), resolve o status e devolve o objeto do contrato. `SECURITY DEFINER`, `search_path` fixo, `EXECUTE` revogado de `anon` e `authenticated`.

O bug: **`v_avisos := v_avisos || 'texto'` é ambíguo em PL/pgSQL** — o Postgres tenta ler o literal `unknown` como array e estoura com `malformed array literal`. Só quebrava nos caminhos que anexam aviso, ou seja, em **todo `nao_comprovado`**, que é o status mais frequente da feature. Os dois primeiros testes, do caminho feliz, passaram; o terceiro derrubou. Cinco sítios corrigidos com `array_append`. **É o melhor argumento a favor de ter escrito os 24 testes antes de considerar a fase pronta** — sem eles isso teria ido para produção passando em qualquer inspeção visual.

Os testes cobrem as bordas de data inclusivas nos dois extremos, a lacuna entre certificados, o caso anterior a todo o histórico, as quatro situações de `Historico: []` (par do topo vigente, vencido, com "Reparado" e ausente), a preferência pelo histórico quando as duas origens cobrem a mesma data, o `Pendente` que nunca vira `reprovado`, a colisão de número de série e o rebaixamento de confiança no match por endereço.

**Duas extensões ao contrato da §0**, registradas nos commits como o plano manda: `ambiguo` devolve `instrumentos_candidatos` em array, porque "retornar todos, nunca escolher" não cabe num campo `instrumento` singular; e data de infração nula devolve `nao_aplicavel` em vez de tentar julgar.

**Duas notas de ambiente.** `supabase test db` **não roda nesta máquina**: o helper de credenciais do Docker falha ao baixar a imagem `pg_prove` sob WSL (`error getting credentials`). Os testes rodam iguais no `psql`, que também entende TAP, e o comando está documentado no cabeçalho do arquivo de teste. E os tipos foram regenerados do banco **local**, não do remoto — que segue pausado. De quebra, os tipos confirmam que ali `attempt_dispatch` existe só com a assinatura `p_case_id`, reforçando a pendência 4; e o `grep` mostrou que **`src/` não usa `.from()` nem `.rpc()` em lugar nenhum**, então o `types.ts` é documentação e DX, não comportamento.

**Arquivos:** `tests/fixtures/` (fixture + README), `supabase/migrations/20260906000000_radar_inmetro_rj.sql`, `supabase/migrations/20260906000001_fn_verificar_medidor.sql`, `supabase/tests/verificar_medidor_test.sql`, `src/integrations/supabase/types.ts`. Três commits. **Nenhuma linha de `src/`, `server/` ou `pipeline/` alterada** — o fluxo que já funciona não foi tocado.

**Verificação:** `supabase db reset` reconstrói as 14 migrations do zero e os 24 testes passam sobre o banco recriado; lint segue nos mesmos 7 erros e 7 avisos; build verde.

**Ficou de fora:** a Fase 2 (ingestão), que depende de medir o tempo de CPU numa Edge Function — a afirmação do plano de que 3,66 MB "cabem folgadamente" é hipótese, não medição — e, para o cron, do projeto remoto pausado. As Fases 4 a 6 dependem da calibração da Fase 0.5. Nada foi deployado: tudo vive no Supabase local.

**Estado deixado na máquina:** o banco local foi **resetado duas vezes, com sua autorização**, o que apagou os casos de teste das sessões anteriores — inclusive os dois em `failed` que estavam guardados como evidência do bloqueio do Resend. O conteúdo daquela evidência está preservado na entrada de 03/09, com as mensagens de erro na íntegra. O bucket `generated-recursos` foi recriado à mão depois de cada reset. Os containers do Supabase seguem no ar; os outros quatro processos foram encerrados durante a sessão.


---

## Sessão de 06/09/2026 (noite) — A medição de CPU passou; o que quase impediu a medição virou o problema


Objetivo único: fechar a §5.1.1 do plano, que eu mesmo tinha escrito como pré-requisito da Fase 2 depois de notar que a frase "cabem folgadamente numa Edge Function" era hipótese, não medição.

**Primeiro o limite, depois o número.** Confirmei na documentação do Supabase, e não de memória: **2s de CPU por request** — I/O assíncrono não conta — e 256 MB de memória. É o limite de CPU que morde neste trabalho, não o de *wall clock*, porque a ingestão é computação pura sem espera.

**A hipótese do plano se confirmou, com folga de cerca de 5×.** Uma Edge Function descartável, rodando sobre os 3.661.867 bytes reais do RJ, três execuções:

| Etapa | Mediana | Conta para o limite? |
|---|---|---|
| buscar o arquivo | 78 ms | não (I/O) |
| `sha256` do corpo | 10 ms | sim |
| `TextDecoder` + `JSON.parse` | 38 ms | sim |
| `normalize` dos 1.971 registros | **365 ms** | sim |
| **CPU total** | **≈411 ms — 20% do limite** | |

`heapUsed` entre 13 e 17 MB de 256 disponíveis. As contagens fecharam com o censo da §1.2: 3.346 faixas, 7.814 verificações de histórico e 1.838 de topo, 14.969 linhas montadas. O `normalize` é 85% do custo e, dentro dele, o `sha256` por instrumento é o item dominante — é ali que se otimiza se um dia apertar. A medição **não** cobre a serialização das 14.969 linhas para os `upsert` em lotes, que também é CPU, mas de ordem muito menor que a folga.

**E aí o risco mudou de lugar.** O `fetch` do endpoint do INMETRO **falha de dentro do edge runtime**, com `client error (Connect): tls handshake eof`. Terminei a medição servindo os mesmos bytes pelo Storage local, o que não altera o número, já que I/O não conta.

**Levantei uma hipótese e ela estava errada — registro porque poupa o caminho.** Achei que fosse o clássico: servidor velho oferecendo só cifra CBC, cliente TLS moderno recusando. Fui conferir: o IIS 7.5 responde só em TLS 1.2 e de fato negocia `ECDHE-RSA-AES128-SHA256`, que é CBC — **mas aceita `AES128-GCM`, `AES256-GCM` e `ChaCha20-Poly1305` quando o cliente pede.** A explicação fácil está descartada. E o mesmo endereço baixa por `curl` no WSL, na mesma máquina. Pode muito bem ser da rede do Docker Desktop e não do runtime hospedado — **não sei, e o plano agora diz que não sei.** Virou a pendência 20, e ela custa uma função de três linhas publicada no remoto para ser respondida.

**Sobre o ambiente, e isto vai morder de novo.** Cinco obstáculos, nenhum deles do código:

1. **`supabase functions serve` não recarrega edições** de forma confiável — passei três iterações depurando erros de uma compilação em cache. Reiniciar o `serve` é o que vale.
2. **`host.docker.internal` aponta para o Windows, não para o WSL.** Subi um servidor HTTP no WSL e o container não o alcançou; é a mesma assimetria já registrada em 03/09.
3. **O isolate da função não enxerga o `/tmp` do container.** `docker cp` do arquivo para dentro não adianta.
4. **O CLI só empacota `.ts`** — arquivo estático posto ao lado do `index.ts` não vai junto para o runtime.
5. **`pgrep -f`/`pkill -f` casam com a linha de comando do próprio shell** quando o padrão aparece depois, na mesma linha, e mataram meu shell duas vezes (exit 144). O truque do colchete só protege a primeira ocorrência.

O caminho que funcionou foi subir o arquivo no **Storage local** e buscá-lo de lá, container a container — que é, aliás, o que a Fase 2 vai fazer em produção de qualquer jeito.

**Arquivos:** `PLANO-verificacao-radar-inmetro.md` (§5.1.1 ganhou a tabela da medição, o achado do TLS e a regra de decisão atualizada) e `PROGRESSO.md`. **Nenhum código de produção.** A Edge Function da medição era descartável e foi apagada, junto com o objeto de teste no Storage local.

**Ficou de fora:** a Fase 2 em si. Escrever a ingestão antes de saber se a Edge alcança o endpoint seria construir sobre uma dúvida que custa três linhas para resolver — e a resposta muda o runtime da fase inteira.


---

## Sessão de 06/09/2026 (fim da noite) — O projeto voltou, e a Fase 2 perdeu o runtime que tinha


Uma pergunta só, a pendência 20: uma Edge Function **hospedada** alcança o endpoint do INMETRO? Para responder era preciso despausar o projeto da nuvem, o que encerrou a pendência 10 de quebra.

**O projeto voltou em segundos.** `INACTIVE` → `COMING_UP` → REST respondendo em ~3s. Com a API de gestão no ar, um item que o reconhecimento da Fase 0 tinha deixado aberto se fechou sozinho: **`submit-form` (v17, última alteração em out/2025) e `force-log-webhook` (v9, jan/2026) existem mesmo no remoto**, ambas `ACTIVE`, e nenhuma das duas está no repositório. São órfãs, como o plano suspeitava — e continuam sem issue.

**A resposta é não, e o erro não é o que eu esperava.** Publiquei uma função mínima que só faz `fetch` no endpoint. Duas invocações, dois erros diferentes, ambos de **TCP**, antes de qualquer handshake TLS:

```
Connection reset by peer (os error 104)                    após 1,7s
tcp connect error: Connection timed out (os error 110)     após 131s
```

Isso já descartava a hipótese de TLS que eu tinha levantado na sessão anterior — e que eu já sabia estar errada por outro caminho.

**O experimento de controle é o que dá a resposta.** Em vez de parar no "não funciona", publiquei uma segunda versão testando cinco alvos, e rodei os mesmos da máquina local:

| Alvo | Edge hospedada | Aqui (conexão brasileira) |
|---|---|---|
| `servicos.rbmlq.gov.br` — o arquivo | **timeout 20s** | 200, 3.661.867 bytes em 6,8s |
| `servicos.rbmlq.gov.br` — a raiz | **timeout 20s** | 200, 26.141 bytes |
| `dados.gov.br` | 200 em 25 ms | 200 |
| `www.gov.br/inmetro` | 200 em 387 ms | 200 |
| `example.com` | 200 em 56 ms | 200 |

**E a função relatou `regiao: sa-east-1` — São Paulo**, apesar de o projeto declarar `us-east-1`. Ou seja: não é distância, não é rota para o Brasil, não é bloqueio genérico a IP estrangeiro. Outros hosts do próprio governo brasileiro respondem em milissegundos da mesma função. **O bloqueio é específico do `servicos.rbmlq.gov.br` contra o IP de saída da Supabase** — allowlist ou recusa de ASN de nuvem no firewall do RBMLQ.

**O que isso custa.** A medição de CPU de ontem continua correta e virou irrelevante para essa rota: o gargalo nunca foi computação. Pior, o problema não se resolve trocando de runtime dentro da mesma família de nuvens — **o GitHub Actions, que o plano listava como alternativa, roda em IPs da Azure e quase certamente apanha igual**, e o Express baixa o arquivo hoje só porque roda nesta máquina, nesta conexão. Numa nuvem, provavelmente apanha também.

Sobram duas saídas, e **nenhuma está desenhada no plano**: rodar a ingestão numa máquina em rede aceita — inclusive a sua, agendada — ou pôr um proxy de saída em rede aceita e deixar o runtime na nuvem só consumindo. É decisão de arquitetura, virou a pendência 21, e precisa acontecer **antes** de escrever a Fase 2. A regra que ficou escrita no plano é barata e teria evitado tudo isto: antes de escolher runtime, um `curl` no endpoint a partir do endereço real de produção.

**Arquivos:** `PLANO-verificacao-radar-inmetro.md` — a §5.1 ganhou um aviso de que sua recomendação caiu, a §5.1.2 é nova e traz a tabela e a regra revisada, a §4.4 registra as órfãs confirmadas, a Fase 2 ganhou um aviso de não começar, os riscos 8 e 9 foram reescritos e a Definição de pronto ganhou o teste de alcance — e este arquivo. **Nenhum código de produção.**

**Ficou de fora, e é seu:** a função de teste **continua publicada** no projeto como `teste-fetch-inmetro` (exige JWT, só faz `fetch`, mas é lixo). O MCP não remove e o CLI pediu `SUPABASE_ACCESS_TOKEN`, que eu não tenho — apague com `npx supabase functions delete teste-fetch-inmetro --project-ref tsdzvxgkokrjqayxukud` depois de um `supabase login`, ou pelo Dashboard. E o **projeto ficou ativo**, consumindo: não repausei por conta própria, porque pausar derruba o DNS de novo e você pode querer aproveitá-lo de pé.


---

## Sessão de 09/09/2026 — Doze migrations viraram uma, e o caminho do despacho parou de errar em silêncio


Começou como um pedido de teste do fluxo com PDF e e-mail, virou um plano para as pendências 14 e 16 — e o Klaus redirecionou para o que estava por baixo: **as migrations descreviam o mesmo schema três vezes, e ninguém conseguia ler o banco sem simular a fita inteira de cabeça.**

**O diagnóstico dele estava certo, e os números são piores do que "risco de conflito".** Das doze migrations aplicadas em produção, **duas têm efeito líquido zero**: a `20250101000005` teve suas três funções dropadas pela `20260109134917`, e a `20251231000001` (`data_infracao` → timestamptz) foi desfeita pela migration seguinte. `attempt_dispatch` era definida em três arquivos, `confirm_dispatch` em três, `calculate_dup_guard` em dois com assinaturas diferentes. Só a `20260109134917` traz **vinte comandos `drop`** desmontando o que as três anteriores acabaram de montar.

**A consolidação foi verificada, não presumida.** Antes de escrever uma linha, tirei a impressão digital do schema — 121 itens entre colunas, constraints, índices, triggers, funções e policies — das doze migrations aplicadas do zero, e ela **bate exatamente com a do projeto de produção** (`md5 0b9a449c…`). Depois, a baseline sozinha reproduziu a mesma impressão digital e o dump completo saiu com **zero diferenças**. Só então ela deixou de ser um retrato.

**A decisão que mudou o desenho foi do Klaus: não preservar erro nenhum.** Minha primeira baseline reproduzia a produção byte a byte, comentários errados inclusive. Ele perguntou por que manter um comentário obsoleto, e a resposta certa era: manter não, mas corrigir *dentro* da baseline também não — ela nasceria marcada como aplicada e a correção nunca rodaria. Como as tabelas do fluxo em produção estão **vazias**, ele optou pelo caminho mais radical: a baseline passa a ser o schema **correto**, e o remoto será **reconstruído** a partir dela. Virou a pendência 23.

**Quinze anomalias apareceram no caminho. Quatorze estão fechadas.** As mais graves:

*A detecção de duplicata nunca funcionou.* A Edge calcula o `dup_guard` sobre **nove** campos com `JSON.stringify` e grava o valor; o trigger no banco calculava sobre **seis** com `json_build_object` e, sendo `BEFORE INSERT OR UPDATE`, **sobrescrevia** o valor da Edge milissegundos depois. Medido com a mesma entrada: trigger `3f39d690…`, Edge `b8dbb9d5…`. O `return "Duplicate submission (no-op)"` era código morto desde sempre — e o `3_test_dup_guard_detection.ps1` documenta um comportamento que o código não produzia. Fazer o trigger imitar a Edge não é viável (`json_build_object(...)::text` do Postgres emite `{"a" : "b"}`, com espaços). A correção foi o banco parar de opinar. Provado por A/B com a Edge real: sem o trigger, o segundo envio idêntico responde `Duplicate submission (no-op)`; com ele recriado, não responde.

*A compatibilidade dupla do `attempt_dispatch` era um supressor de log.* Só existe a assinatura `p_case_id` — a `case_id` foi dropada e não existe em banco nenhum, ao contrário do que o `CLAUDE.md` afirmava (pendência 4, corrigida). O `form-submit` chamava a inexistente **primeiro**, levava `PGRST202` em todo envio, e empilhava o erro num array que **só era logado se nenhuma tentativa devolvesse chave**. Como a segunda quase sempre devolvia, o array era descartado — e com ele qualquer falha real da etapa mais crítica do fluxo.

*O `confirm_dispatch` mentia por dois motivos independentes.* A função devolvia o próprio argumento `success` em vez de dizer se alguma linha foi atualizada — chamada com um `dispatch_key` inexistente respondia "confirmado". E o Express fazia `confirm_dispatch_ok: !!rpcRes.data`, que é verdadeiro sempre, porque `data` é um array. Os dois corrigidos.

*A hora da infração nunca chegava à peça.* O formulário exige data **e hora**, valida e ecoa de volta — mas `data_infracao` era `date`, e a hora morria no cast. Como o pipeline monta o contexto da IA a partir das colunas, o cliente digitava uma hora que não existia para o sistema. Agora é `timestamp` **sem** fuso: é relógio de parede transcrito de um papel, não um instante — como `timestamptz`, a string local do formulário voltaria 3h deslocada. O `payment_at` foi na direção oposta e pelo motivo oposto: recebia um instante UTC do `stripe-webhook` numa coluna sem fuso, e virou `timestamptz`.

**Uma descoberta técnica que forçou reescrever código.** O Klaus pediu para o `form-submit` escrever `document_status: 'pending'` explicitamente, de modo a remover o `DEFAULT` da tabela. Descobri no teste que **o `.upsert()` do PostgREST sempre monta o ramo `INSERT`**, mesmo quando vai executar o `DO UPDATE`: sem `DEFAULT`, a coluna ausente vira `NULL` e estoura `23502` mesmo com a linha já existente. Foi preciso separar `insert` e `update` — e a separação é necessária por outro motivo, mais sério: escrever `'pending'` no caminho de update reabriria um caso em `generating` (a guarda de 409 só barra `completed` e `failed`), `attempt_dispatch` devolveria a **mesma** `dispatch_key`, e o worker mandaria um **segundo e-mail ao cliente**. Um retry em `23505` preserva a idempotência de duplo clique que o upsert absorvia.

**Varredura de fuso, nas duas pontas.** O `max` do campo de data vinha do relógio do **aparelho**: medido, com o celular em Honolulu o limite saía 7h atrás do agora brasileiro e **barrava uma infração legítima**. Passou a vir de `America/Sao_Paulo`. Do outro lado, `created_at` e `updated_at` chegavam ao prompt da IA em **UTC** — "10/09" para um caso protocolado às 22h do dia 9 em BRT, o mesmo erro que o front já havia corrigido. Saíram do contexto junto com `id`, `form_token`, `dup_guard` e `document_status`: o prompt caiu de **16 para 9 linhas**, medido com a função real.

**Um achado fora do escopo, e ele é jurídico.** `Terms.tsx` e `Privacy.tsx` renderizavam `Última atualização: {new Date().toLocaleDateString('pt-BR')}` — **as duas páginas afirmavam ter sido revisadas hoje, todo dia.** Numa página de termos isso não é detalhe de UI. Virou constante com a data real do último commit do texto (18/08/2026).

**Sobre as Edge Functions órfãs:** a pendência 10 já registrava `submit-form` e `force-log-webhook`, e a sessão de 06/09 já pedia a remoção da `teste-fetch-inmetro` — eu as reapresentei como novidade, e não eram. O que é novo é a leitura do código da `submit-form`: pública, CORS `*`, sem rate limit e com **mass assignment** na tabela central. Está inerte só por acidente. Baixei o código das duas para não perder nada, mas **não consegui excluí-las**: o MCP não expõe exclusão e o CLI pede `SUPABASE_ACCESS_TOKEN`.

**Arquivos:** `supabase/migrations/` (12 removidas, `20260525000000_baseline_schema.sql` criada), `supabase/functions/form-submit/index.ts`, `supabase/functions/stripe-webhook/index.ts`, `server/src/index.ts`, `pipeline/worker.py`, `src/pages/Form.tsx`, `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`, `tests/edge-functions/4_test_complete_flow.ps1`, `CLAUDE.md` e este arquivo. Cinco commits temáticos. `npm run build`, `npm run lint` (os mesmos 7 erros cosméticos de sempre), `tsc` do Express e `py_compile` do worker, todos limpos.

**Ficou de fora:** **o plano que originou a sessão não foi executado** — `docs/superpowers/plans/2026-09-08-bloqueios-de-producao-bucket-e-email.md` está commitado e descreve as pendências 14 e 16, que seguem **abertas**: o bucket continua fora das migrations e o domínio continua sem verificação no Resend. Também ficaram: o `UNIQUE` em `form_token` (pendência 22, recusado com motivo), a reconstrução do schema remoto (pendência 23), a exclusão das três Edge órfãs, e a limpeza do caminho legado em que o pipeline responde `200` em vez de `202` — ali a Edge grava `generating`, chama `confirm_dispatch` ela mesma, e o `document_status` fica preso em `generating` para sempre, porque o Express nunca é chamado.

**Estado deixado na máquina:** Supabase local no ar com as três migrations aplicadas e **as tabelas vazias**; `functions serve`, Vite, Express e pipeline encerrados. O projeto remoto **não foi tocado** — nenhuma escrita, nenhum `db push`, nenhum `migration repair`. Backup do código das duas Edge órfãs no scratchpad da sessão.


---

## Sessão de 10/09/2026 — O bucket entrou na migration, e a lacuna era maior que a migration


Continuação direta de 09/09. O Klaus perguntou se o bucket já estava nas migrations; **não estava** — a pendência 14 tinha sobrevivido à sessão inteira porque o trabalho foi redirecionado para a consolidação do schema. Conferido antes de responder: uma única linha `INSERT INTO storage.buckets` em todas as migrations, a do `evidencias`; banco local com só um bucket depois do reset; e **o projeto remoto sem bucket nenhum**.

**A parte que não era óbvia:** versionar o bucket resolve o sintoma, mas não impediria a regressão de voltar em silêncio. `supabase db dump` cobre **apenas o schema `public`** — buckets e policies de Storage ficam de fora dele. Foi por isso que três sessões seguidas de teste ponta a ponta morreram no mesmo lugar sem que nenhum diff acusasse nada. A migration entrou com uma asserção junto, `tests/sql/assert_storage_setup.sql`, que confere os dois buckets, que ambos são privados e que a policy existe.

Ela é um bloco `DO` único de propósito: `supabase db query -f` não aceita mais de um comando por arquivo, e a primeira versão, com um `SELECT` de listagem no fim, morria em *"cannot insert multiple commands into a prepared statement"*. A listagem saiu por `RAISE NOTICE`.

**Ciclo verificado do zero, na ordem certa:** asserção falhando com `bucket generated-recursos AUSENTE`, `db reset` aplicando as quatro migrations, asserção passando, e o upload real pela API de Storage com a chave de service role — `200` no PUT e `200` no DELETE. Os 24 testes pgTAP do radar continuam passando.

**Sobre a policy, com evidência em vez de suposição:** ela **não** é o que permite o upload. `service_role` tem `rolbypassrls = true`, e o bucket funcionou nas sessões de 01/09 e 03/09 sem policy nenhuma. Fica por simetria com o `evidencias` e como defesa em profundidade; o que torna o bucket privado é não existir policy para `anon`. Está escrito assim na migration, para ninguém achar que removê-la é inofensivo pelo motivo errado.

**O passo 2 do roteiro foi cancelado, e vale registrar por quê.** A ideia era fundir as duas migrations do radar numa só, como fizemos com as doze. Medi antes: entre as duas do radar há **zero** `drop` desfazendo trabalho anterior, **zero** objetos definidos duas vezes e **nenhuma** sobreposição — a segunda não tem um único `CREATE TABLE`, `INDEX`, `POLICY` ou `ALTER`, só duas funções. O que consertamos nas doze era churn; a separação do radar é por responsabilidade, escrita de propósito. Fundir daria um arquivo de 434 linhas misturando DDL de cinco tabelas com uma função de 200 linhas. Recomendei não fundir e o Klaus concordou.

**Arquivos:** `supabase/migrations/20260910000000_bucket_generated_recursos.sql` (novo), `tests/sql/assert_storage_setup.sql` (novo), `CLAUDE.md`, e este arquivo.

**Ficou de fora:** as pendências 16 (domínio no Resend), 22 (`form_token`) e 23 (reconstrução do remoto) seguem abertas, e as três Edge Functions órfãs continuam publicadas — a `submit-form` segue **pública e sem autenticação**. Nada disso avançou hoje.

**Estado deixado na máquina:** Supabase local no ar com as **quatro** migrations aplicadas, os dois buckets presentes e as tabelas do fluxo vazias. O projeto remoto **não foi tocado**.


---

## Sessão de 11/09/2026 — As Edge Functions foram para produção, e a checagem pré-deploy achou um mês de divergência


Passos 1 e 2 do roteiro, executados pelo Klaus no terminal dele. A branch também foi empurrada para o GitHub pela primeira vez.

**A limpeza das órfãs fechou.** `submit-form` e `force-log-webhook` saíram pelo Dashboard, `teste-fetch-inmetro` pelo CLI. Conferido pela API: restaram só `create-checkout-session`, `stripe-webhook` e `form-submit`. A `submit-form` era a urgente — pública, sem JWT, CORS `*` e com mass assignment na tabela central.

**O achado da sessão veio da checagem pré-deploy, não do deploy.** Antes de publicar, comparei o que estava publicado com o histórico do git e encontrei uma divergência de quase um mês: a `stripe-webhook` em produção (v52, de 01/06) era **anterior ao commit `b20f40c` (18/08)**. A versão que rodava fazia upsert com `on_conflict=case_id` mandando `id: session.id` — **reescrevendo o `id` de uma linha existente** quando o mesmo caso ganhasse uma segunda sessão de checkout, e deixando `dispatches.stripe_session_id` apontando para um id que deixara de existir.

O `CLAUDE.md` documenta essa invariante — "o `id` de uma linha existente em `stripe_sessions` nunca é reescrito pelo webhook" — e ela estava **correta no repositório e violada em produção**. A documentação descrevia o código; ninguém tinha conferido se o código descrevia o que rodava. Vale como regra daqui em diante: **antes de publicar, comparar o publicado com o repositório.**

A `form-submit` publicada, por outro lado, já estava em dia com o `36a01a3` apesar do timestamp sugerir o contrário — tinha sido publicada da cópia de trabalho antes do commit.

**Publicado e verificado campo a campo.** `form-submit` v60 e `stripe-webhook` v53, pelo CLI a partir do disco — e não pelo MCP, de propósito: o MCP exigiria reproduzir ~750 linhas dentro da chamada, e um deslize de transcrição na função de pagamento não é risco que se corra por economia. Depois do deploy, busquei o código publicado pela API e conferi: `verify_jwt` segue `false` nas duas (vem do `config.toml`, sem flag), os trechos antigos sumiram (`rpcAttempts`, `.upsert()`, `getCurrentStripePaymentState`) e os novos estão lá (`confirmDispatchOk`, split insert/update, retry `23505`, `existingRow`, `sessionIdToLink`).

**O que produção ganhou hoje:** o fim do `PGRST202` em todo envio, o fim do supressor de log no `attempt_dispatch`, os erros de `confirm_dispatch` visíveis, e a correção da FK no webhook.

**O que produção ainda NÃO tem, porque depende do passo 3:** o schema novo. Até lá, a detecção de duplicata continua morta (o trigger antigo ainda sobrescreve o `dup_guard`), a hora da infração continua sendo descartada (`data_infracao` ainda é `date`), não há bucket nenhum, e a `form-submit` vai logar um `confirm_dispatch_sem_efeito` falso sempre que confirmar uma falha — a função no banco ainda ecoa o argumento. Ruído conhecido, não defeito.

**Arquivos:** só este. Nenhuma mudança de código — o deploy publicou o que já estava commitado.

**Estado deixado:** produção com as Edge corrigidas rodando contra o schema **antigo**, que é a ordem certa e foi medida nas duas direções. Local intocado nesta sessão.


---

## Sessão de 11/09/2026 (noite) — O schema corrigido chegou a produção


Passo 3 do roteiro. `supabase db reset --linked` reconstruiu o banco remoto a partir das quatro migrations. O histórico saiu de 12 linhas antigas para as 4 atuais, alinhado com o local.

**A ordem foi respeitada, e ela importava.** As Edge Functions corrigidas subiram primeiro (passo 2, mais cedo hoje); só depois o schema. A ordem inversa teria quebrado todo envio de formulário, porque a `form-submit` antiga usa `.upsert()` sem informar `document_status` — coluna que passou a ser `NOT NULL` sem `DEFAULT`. Isso estava medido nas duas direções antes de qualquer deploy.

**Verificado por impressão digital, não por confiança no comando.** 201 itens de schema — colunas, constraints, índices, triggers, funções e policies — com `md5 6009693c9b06bcfa0eb60e307a6a3325`, **idêntico ao local**. E as correções conferidas uma a uma em produção: os dois buckets presentes e privados (nunca existiram lá), `document_status` NOT NULL sem default, `data_infracao` como `timestamp` sem fuso, `payment_at` como `timestamptz`, zero colunas mortas, zero trigger de `dup_guard`, e `confirm_dispatch` com chave inexistente devolvendo `false`.

Com isso o ruído previsto no passo 2 — o `confirm_dispatch_sem_efeito` falso — **deixa de existir**, e a detecção de duplicata e a hora da infração passam a funcionar também em produção.

**Um desvio local que rendeu um aprendizado.** Antes do reset remoto eu quis capturar a impressão digital local como alvo, e o `db reset` local falhou: o Docker sob WSL não consegue baixar `realtime:v2.130.0` por causa do helper de credenciais — o mesmo problema que o cabeçalho de `supabase/tests/verificar_medidor_test.sql` já documentava. Pior: um reset anterior meu tinha derrubado o schema e eu não vi, porque silenciei a saída do comando. **Silenciar saída de comando destrutivo foi erro meu**, e o custo foi meia hora de diagnóstico.

Ao reaplicar as migrations direto por `psql`, a do radar falhou com `column "public" of relation "buckets" does not exist`. Não era defeito da migration: como o reset abortou antes do "Restarting containers", o `storage-api` nunca reaplicou as migrations internas dele, e `storage.buckets` ficou reduzida à tabela base. **O remoto estava íntegro o tempo todo** — conferido antes de tocar em qualquer coisa. Reiniciar o container do storage restaurou as colunas. Fica registrado: se `INSERT INTO storage.buckets` falhar assim no local, reinicie o storage, não mexa na migration.

Descoberto de quebra: `storage.buckets` agora tem um trigger `protect_delete` que recusa `DELETE` direto ("Use the Storage API instead").

**Produção passou a carregar o schema do radar** — 5 tabelas, 3 funções e o bucket `evidencias`, vazios e inertes. Decisão do Klaus entre duas opções: aplicar as quatro migrations mantém o histórico linear e local e remoto idênticos; a alternativa deixaria um buraco no histórico do remoto, já que as do radar (`20260906`) são anteriores à do bucket (`20260910`).

**Arquivos:** só este. Nenhuma mudança de código.

**Estado deixado:** produção com schema e Edge corrigidos, tabelas do fluxo vazias. Local reconstruído por `psql` (não por `db reset`, que segue quebrado pelo Docker no WSL), com asserção de storage passando e 24/24 nos testes do radar.


---

## Sessão de 13–14/09/2026 — O domínio da empresa está expirado, e ninguém sabia


Duas sessões curtas que começaram administrativas e terminaram num achado que reordena o projeto inteiro.

**13/09 — o domínio entrou na Resend.** Com o plugin instalado, a primeira pergunta foi se ele completava o passo 4. **Não completa**, e vale entender por quê: o plugin dá acesso à API da Resend, e o bloqueio nunca foi acesso — é DNS. A zona segue estacionada (`ns1/ns2.dns-expired.com`, todo TXT respondendo o aviso de expiração), então não há onde publicar os registros.

O que ele rendeu foi **corrigir o diagnóstico**: a conta da Resend tinha **zero domínios**. O `550 — domain is not verified` de 03/09 nunca significou "adicionado e aguardando verificação"; significava "não existe na conta". Criei o domínio em `sa-east-1` (São Paulo — produto e destinatários brasileiros), e os quatro registros a publicar estão no passo 4 do roteiro. São **quatro**, não três: o `CNAME rsend` é infraestrutura nova da Resend e não aparecia na descrição de 08/09.

Ficou registrado também que **o pipeline entrega por SMTP**, não pela API — o plugin administra e diagnostica, não muda o caminho de entrega do produto.

**14/09 — a pergunta era sobre caixa de e-mail; a resposta foi outra.** Ao explorar o contexto para desenhar a caixa, apareceu que o contato oficial do produto é `amorecorrer@gmail.com`, exposto no rodapé e nas duas páginas jurídicas — e que o recurso sai de `no-reply@`, sem caminho de resposta. Isso virou a pendência 25.

Mas ao consultar a conta da Hostinger para saber se havia plano de e-mail, veio o que importa:

```
domínio       amorecorrer.com   status: Expired    venceu 23/08/2026
assinatura    .COM Domain       cancelled          auto-renovação: OFF
renovação     R$ 96,08
plano de e-mail                 nenhum (zero pedidos)
hospedagem                      nenhuma
```

**E a contradição com o registro é aparente, não real.** A Verisign mostra expiração em 2027-08-23 porque a Hostinger fez a renovação protetiva no registro para segurar o nome durante a carência — comportamento padrão de registrador, reversível: não pago dentro da janela, eles apagam e recebem o crédito de volta.

Isso explica retroativamente tudo que vínhamos tratando como mistério desde 08/09 — a zona no parking, a ausência de hospedagem, a ausência de plano de e-mail. **Não é que o DNS quebrou; é que o serviço acabou.** Virou a pendência 24, a única do projeto com prazo correndo.

**Uma lição de método:** o painel da Hostinger não tinha sido consultado em nenhuma das sessões anteriores. O diagnóstico de 08/09 — "a zona está estacionada no parking de expirados" — estava certo no sintoma e **incompleto na causa**, e a causa era a que tinha prazo. Quando um sintoma aponta para um provedor, vale consultar a conta daquele provedor antes de desenhar em cima do sintoma.

**Arquivos:** `PROGRESSO.md`. Nenhuma mudança de código; o único efeito externo foi criar o domínio na conta da Resend.

---

## Sessão de 15/09/2026 — O fluxo fechou inteiro, com PDF redigido e e-mail entregue


Foi o pedido que abriu a sessão de 09/09 — testar o fluxo completo, incluindo geração do PDF e envio por e-mail — e que passou uma semana classificado como bloqueado. **Estava mal classificado.**

**A premissa errada era minha.** Eu vinha tratando o teste de envio como dependente da verificação do domínio. Depende para *entrega a cliente real*; não depende para *teste*. A Resend oferece `onboarding@resend.dev`, remetente que funciona sem domínio verificado — a limitação é o destinatário, restrito ao e-mail da própria conta. Duas variáveis trocadas e o ciclo roda.

**O resultado, medido e não presumido:**

```
document_status              completed
dispatches.status            sent
generated_documents.status   emailed
Resend API                   delivered      <- prova independente do nosso banco
PDF baixado do Storage       3054 bytes, PDF 1.4, 1 página
sha256                       confere com o gravado
```

**A peça é documento jurídico, não resumo.** Cita nome, CPF, CNH, placa, número do auto, órgão autuador, local, as duas velocidades, invoca o art. 218 do CTB e a ausência de certificação metrológica, pede nulidade e o arquivamento no RENAINF.

**E ela traz a hora:** *"a infração foi registrada em 12 de março de 2026, às 21h07"*. Esse é o primeiro artefato que prova, do lado do cliente, a correção de `data_infracao` de `date` para `timestamp` feita em 09/09 — antes dela a hora morria no cast e a IA nunca a via. Vale registrar uma autocorreção: minha checagem automática deu "ausente" para `21:07` e `12/03/2026` porque procurava o formato numérico; a IA escreveu por extenso. **O verificador estava errado, não a saída.**

**Dois desvios de ambiente, ambos contornados sem tocar no projeto.** O `python3` do WSL não tem as dependências do pipeline e o `pipeline/.venv` é do Windows; `python3 -m venv` também falha aqui porque falta `ensurepip`. Resolvido com `pip install --target` num diretório do scratchpad mais `PYTHONPATH` — **sem tocar em `pipeline/.venv`**, que eu já quebrei uma vez por instalar por cima (sessão de 03/09).

E a Edge **não alcançou o pipeline**, com o erro `connection closed before message completed` para `192.168.65.254:8000`: o container resolve `host.docker.internal` para o host Windows, e o pipeline escutava no WSL. É a limitação que o `PROGRESSO.md` já registrava. Contornei POSTando o payload assinado direto em `/hooks/dispatch`, reusando a `dispatch_key` que a Edge já havia criado. **O que ficou sem exercício foi só o salto Edge → pipeline**, que é rede e já foi exercitado em sessões anteriores; todo o resto rodou pelo caminho real, começando pela própria `form-submit`.

**De quebra, uma constraint se provou.** Ao limpar o caso de teste, o `DELETE` foi recusado por `generated_documents_dispatch_key_fkey` — `ON DELETE RESTRICT`. A auditoria do PDF não desaparece junto com o caso, que é exatamente o desenho pretendido.

**O que este teste não prova:** entregabilidade a partir de `amorecorrer.com`, alinhamento DKIM/SPF do domínio próprio, e caixa de entrada versus spam. Isso segue dependendo do passo 4 — e, antes dele, da renovação do domínio.

**Arquivos:** só este. Nenhuma mudança de código. O `.env.local` recebeu um bloco temporário com SMTP e DeepSeek e foi **restaurado do backup** ao fim (conferido: 63 linhas, zero credenciais residuais, `SMTP_HOST` vazio de novo).

**Estado deixado:** Supabase local de pé com as quatro migrations e as tabelas do fluxo **vazias** (o caso de teste foi removido). Express, pipeline e `functions serve` encerrados. O PDF gerado está no scratchpad da sessão.


---


---

## Sessão de 17/09/2026 — O domínio voltou, e o e-mail do domínio próprio foi destravado

Dois passos do roteiro num dia, e o fim da pendência mais longeva do projeto.

**A renovação resolveu mais do que o pagamento.** O Klaus renovou com 25 dos ~30-45 dias de carência consumidos. Conferido em quatro fontes independentes: a Hostinger passou o domínio de `Expired` para **`Active`** até 23/08/2027; a assinatura voltou a `active` **com a auto-renovação religada** (`is_auto_renewed: true`, cobrança agendada para 27/07/2027); o registro migrou os nameservers de `DNS-EXPIRED` para `DNS-PARKING`; e o TXT `"This domain is expired at Hostinger!"` saiu do ar.

O detalhe que importa é o segundo: **era o `is_auto_renewed: false` que causou tudo isto**. Religado, o problema não só foi resolvido — deixou de poder se repetir.

A expiração ter continuado em 2027-08-23, em vez de pular para 2028, está **correto**: a renovação converteu em pagamento a renovação protetiva que a Hostinger já havia feito no registro em 23/08, sem empilhar um ano extra.

**Com a zona viva, a recomendação anterior caiu.** Em 13/09 eu havia sugerido mover os nameservers para o Cloudflare — e a premissa daquela sugestão era que a zona da Hostinger estava morta, sem lugar onde publicar nada. Zona viva, o caminho mais curto passou a ser publicar onde a zona já está. Mover para o Cloudflare continua defensável por outros motivos, mas virou preferência, não necessidade.

**Os quatro registros foram publicados pela API, sem painel.** DKIM em `resend._domainkey`, SPF TXT e MX em `send`, CNAME `rsend`. Aplicados com `overwrite: false` para preservar o `CNAME www` que já existia — conferido depois que ele continua lá. Propagaram de imediato (TTL 300) e a Resend passou de `failed` a `pending` e a **`verified`** nos quatro, em cerca de quatro minutos.

**Uma armadilha da API da Hostinger que custou três tentativas:** a prioridade do MX **não** vai num campo `priority`, nem dentro do registro nem na entrada da zona — as duas formas devolvem `500` sem explicação. Vai **dentro do `content`**, no formato de arquivo de zona: `"10 feedback-smtp.sa-east-1.amazonses.com"`. `DNS_validateDNSRecordsV1` permite descobrir isso sem escrever nada na zona, e vale usar sempre antes de aplicar.

**O que isto destrava:** `MAIL_FROM=no-reply@amorecorrer.com` deixou de ser remetente recusado e passou a valer para **qualquer** destinatário — não só o dono da conta, que era o limite do sandbox usado em 15/09.

**Ficou de fora:** repetir o teste ponta a ponta em **modo real**, que é o que prova entregabilidade, alinhamento DKIM/SPF na prática e colocação em caixa de entrada versus spam. O teste de 15/09 provou o encanamento; este provaria a entrega.

**Arquivos:** só este. Nenhuma mudança de código — o `.env` já trazia `MAIL_FROM=no-reply@amorecorrer.com`, que agora é válido.

**Estado deixado:** domínio renovado e verificado; zona com cinco registros (os quatro da Resend mais o `www`); nada tocado no código nem no banco.


---

## Sessão de 18/09/2026 — O fluxo rodou em produção, e o teste pagou por si duas vezes

A pergunta do Klaus foi direta: dá para testar o pipeline **antes** de contratar o VPS? Dá — e o teste achou dois defeitos que só apareceriam depois da compra.

**A dúvida legítima que veio antes.** Ele perguntou se o teste não esbarraria no mesmo problema de 15/09 — o container resolvendo `host.docker.internal` para o host Windows enquanto o pipeline escuta no WSL. **Não esbarra**, e a razão é a direção da conexão: o `cloudflared` roda no WSL e abre uma conexão **de saída**; as requisições entram por ela. Demonstrado antes de qualquer outra coisa, com um servidor trivial: o nome público resolvia para IPs da Cloudflare, o conteúdo vinha do processo no WSL, e o servidor registrou a requisição vindo de **`127.0.0.1`** — prova de que nada entrou por porta.

**Antes disso, o elo de maior risco foi isolado.** Em 15/09 fui eu quem calculou a assinatura, do mesmo lado que a verifica; as duas implementações — `crypto.subtle` na Edge e `hmac/hashlib` no pipeline — nunca tinham se encontrado. Testei-as diretamente, com um segredo contendo acentos para forçar o caso de UTF-8: **assinaturas idênticas**. Se divergissem, o resto seria tempo perdido.

**O teste real.** Express e pipeline apontados para produção, túnel aberto, e o secret `DISPATCH_PIPELINE_URL` do projeto remoto redirecionado para ele. Um detalhe útil: o `secrets list` mostra apenas um digest, e descobri que é **SHA-256 puro do valor** — validando contra a URL que eu mesmo acabara de definir. Com isso confirmei, sem que ninguém revelasse o valor, que o `DISPATCH_PIPELINE_HMAC_SECRET` publicado é o mesmo do `.env`. A `ORIGIN_WHITELIST` saiu por sondagem: corpo vazio devolve `400` se a origem passa e `403` se não — produção aceita `https://www.amorecorrer.com` e `https://amorecorrer.com`.

**O desfecho, medido:**

```
POST /hooks/dispatch   202, de 2600:1f1e:229:a90b:…   (egress da Supabase, via túnel)
document_status        completed
dispatches.status      sent
generated_documents    emailed
Resend                 delivered
Message-ID             <…@amorecorrer.com> via sa-east-1.amazonses.com
PDF                    3797 bytes, sha256 conferido contra o banco
```

O `Message-ID` é a diferença que importa em relação a 15/09: saiu do **domínio próprio** e pela região de **São Paulo**, não do `resend.dev` em us-east-1.

### Os dois defeitos, ambos invisíveis fora de produção

**1. A versão fixada do `supabase-py` recusa a chave de produção.** A `2.15.1` valida por regex que a chave da API seja um **JWT**; o projeto usa o formato novo `sb_secret_…` (41 caracteres). O cliente estourava `SupabaseException: Invalid API key` **antes de qualquer requisição**, no upload do PDF. Conferi por digest que a chave no `.env` é a **mesma** publicada no projeto — não era chave errada, era a biblioteca. Subido para `2.31.0`, o ciclo completou. Nunca apareceu antes porque o Supabase local ainda emite JWT clássico, e o teste de 15/09 rodou contra o local.

**2. `.env.local` sobrescreve variáveis reais de ambiente — só no Express.** Virou a pendência 26. É a mesma família do 401 silencioso de 31/08, e o comentário logo acima da linha culpada fala justamente daquele episódio.

### Três confirmações incidentais

A **deduplicação funcionou em produção** — o primeiro reenvio devolveu `Duplicate submission (no-op)`. Ela ignora `numero_auto`, que não entra no hash da Edge; trocar a placa foi o que produziu hash novo. É a primeira vez que esse caminho é visto funcionando, depois de ter sido código morto até 09/09.

A **guarda de 409** barrou o reenvio de um caso em `failed`, e reprocessá-lo exigiu devolvê-lo a `pending` — o cenário que a pendência de reprocessamento descreve.

O **`ON DELETE RESTRICT`** exigiu apagar a auditoria antes do caso, na limpeza.

### Uma armadilha de ambiente a mais

O `curl` do WSL falhou com *"Could not resolve host"* no endereço do túnel enquanto o DNS público resolvia normalmente: **o resolvedor local cacheou o NXDOMAIN** de uma tentativa feita cedo demais. Contornado com `--resolve`. Não afeta a Supabase, que resolve pelo DNS público — mas confunde o diagnóstico.

**Arquivos:** `pipeline/requirements.txt` (a correção do `supabase-py`) e este. O `.env.local` **não foi tocado** — usei `DOTENV_CONFIG_PATH` e um arquivo de ambiente no scratchpad, destruído ao fim.

**Ficou de fora:** a correção da pendência 26, e o `CLAUDE.md`, que documenta a regra de precedência de forma incompleta.

**Estado deixado:** serviços e túnel encerrados; produção com as quatro tabelas **zeradas** (caso de teste removido); `DISPATCH_PIPELINE_URL` apontando para um túnel morto, como estava antes. O plano do VPS segue necessário e **inalterado** — o teste provou que o software funciona, não resolveu onde ele mora.


---

## Sessão de 20/09/2026 — Auditoria do radar: o que está de pé, o que não existe, e o merge que o arquivo não sabia

Pergunta do Klaus: como está a verificação do INMETRO dos pardais. A resposta exigiu conferir, não recitar — a seção *Estado atual* estava congelada em 10/09 e três afirmações dela já eram falsas.

**O merge tinha acontecido e não estava escrito.** `f155c4e`, de 20/09 às 03:43, feito pelo Klaus: `feat/verificacao-radar-inmetro-rj` inteira sobre `main`, que estava parada em `a3b2142` desde 2025-10-29. São 115 arquivos e +23.526 / −1.408 linhas, já em `origin/main`, sem divergência. O arquivo continuava dizendo "**Merge para `main` nunca aconteceu**" em três lugares. As pendências 1 e 7 e o passo 9 do roteiro foram fechados.

**O estado da feature, medido em vez de presumido.** No projeto remoto: as três funções (`verificar_medidor`, `radar_classificar_resultado`, `radar_unaccent_imutavel`) existem, e as cinco tabelas `radar_*` têm **0 linhas**. No repositório: nenhum `ingest-radares-rj`, nenhum `_shared/psie.ts`, nenhuma migration de `pg_cron`, e nenhum arquivo fora dos docs e da fixture citando `rbmlq` ou `medidores.json`. A coluna `form_submissions.verificacao_medidor` — o contrato de saída inteiro da feature — **não existe em migration nenhuma**. Ou seja: Fases 0, 1 e 3 entregues; 2, 4, 5 e 6 não começadas, e isso é afirmável por ausência verificada, não por memória.

**A Fase 0.5 continua bloqueada pelo mesmo motivo, agora com número.** `form_submissions` tem **0 linhas** em produção. A calibração pede 8 a 10 casos reais de excesso de velocidade no RJ; não há caso nenhum.

**Um caminho novo que o arquivo não conectava.** O plano do VPS (17/09) resolve o passo 7, mas também pode resolver a **pendência 21** de carona: se aquele VPS passar num `curl` ao arquivo do RJ, passa a existir uma máquina sempre ligada, em rede possivelmente aceita pelo RBMLQ, onde o cron da ingestão pode morar. Não é promessa — é o teste de alcance que a §5.1.2 do plano do radar já exige de todo candidato a runtime, e custa um minuto. Ficou registrado no *Estado atual*.

**Arquivos:** só este. **Nenhuma linha de código, migration ou configuração tocada**, e nada escrito no banco — as duas consultas ao remoto foram `SELECT`.

**Ficou de fora:** o teste de alcance em si, que depende de o VPS existir; e a pendência 26, que segue aberta.

---

## Sessão de 21/09/2026 — A fonte do INMETRO está congelada há 21 dias

Mesma pergunta do Klaus de ontem: como está a verificação do INMETRO dos pardais. A auditoria de 20/09 continuava válida — **nada mudou no repositório nem no remoto em 24 horas** (nenhum commit desde `f155c4e`, e a atualização do *Estado atual* segue sem commit). Em vez de repetir a resposta, fiz a única medição que ontem ficou de fora e custa um minuto.

**Reconferido no remoto, e idêntico a ontem:** as três funções do radar existem, as cinco tabelas `radar_*` têm **0 linhas**, `form_submissions` tem **0 linhas**, a coluna `verificacao_medidor` **não existe** e `pg_cron` **não está instalada**. No repositório, `supabase/functions/` continua com as três funções do fluxo e nada de ingestão. Fases 0, 1 e 3 de pé; 2, 4, 5 e 6 inexistentes.

**O achado é da fonte, não do nosso código.** `GET https://servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json` responde `200`, `Content-Length: 3661867`, `Last-Modified: Tue, 01 Sep 2026 00:12:26 GMT`. Baixei o arquivo e conferi: `sha256 = 4dcb3d35ee37cd60122d660319b00be215a49759b0f371cd59f4a6fde648fb9b` — **o mesmo byte a byte do snapshot de 03/09/2026**. O plano registrava "três dias sem regenerar" como anomalia; são **21**. Duas consequências: a conta de armazenamento da pendência 19 foi feita sobre uma frequência que não se confirma (com dedup por sha256, quase não há o que guardar), e o alerta de fonte parada da Fase 6 precisa nascer sabendo que o estado normal pode ser este.

**O que isso não resolve.** O `curl` saiu da máquina do Klaus, não de um candidato a runtime de produção — a **pendência 21 continua aberta** exatamente como estava. O que ele elimina é a hipótese preguiçosa de que o endpoint estivesse fora do ar: está no ar, serve o arquivo, e recusa especificamente o IP de saída da Supabase.

**Arquivos:** só este. **Nenhuma linha de código, migration ou configuração tocada**; as consultas ao remoto foram `SELECT` e a requisição ao INMETRO foi `GET` num endpoint público CC0, com `User-Agent` identificado. O download foi para o scratchpad da sessão.

**Ficou de fora:** o teste de alcance a partir do VPS (que ainda não existe) e a pendência 26, ambas inalteradas.

---

## Sessão de 22/09/2026 — A carga dos radares do RJ: 1.971 instrumentos em produção, e o campo que eu li errado

Decisão sua, tomada no começo da sessão e que destravou tudo: como o RBMLQ recusa IPs de nuvem e a fonte se
atualiza em intervalos arbitrários, a coleta passa a ser **manual, da sua máquina**. É a saída (a) que a
§5.1.2 do plano do radar já tinha escrito e deixado sem escolher. Não contorna o plano — escolhe uma das
duas portas que ele deixou abertas.

**Spec e plano antes de código.** `docs/superpowers/specs/2026-09-22-carga-manual-radares-rj-design.md` e
`docs/superpowers/plans/2026-09-22-carga-manual-radares-rj.md`. Quatro decisões ficaram travadas ali: JSON
e não XML (o censo, o fixture e os 24 testes pgTAP foram todos construídos sobre a estrutura do JSON);
carga única e manual; Node 22 sem ferramenta nova; e produção como alvo, com `--dry-run` fazendo o papel
que a stack local faria se não fosse custosa sob WSL.

**Três medições dispensaram dependências que o plano previa.** O Node 22.23.2 da máquina faz
type-stripping nativo, roda `node --test` sobre `.ts` e importa `@supabase/supabase-js` — `tsx` saiu.
`--env-file-if-exists` reproduz a precedência que o `CLAUDE.md` documenta (último arquivo ganha, ausente
não derruba) e **dá ao ambiente real precedência sobre o arquivo**, que é a semântica do pipeline, não a do
Express da pendência 26 — `dotenv` saiu. Resultado: **zero dependências novas**.

**O que foi construído.** `scripts/lib/psie.ts` (núcleo puro, zero I/O), `scripts/lib/retry.ts` e
`scripts/ingest-radares-rj.ts`, com **34 testes** em `node --test`. Duas correções sobre o plano da Fase 2
entraram no caminho: a idempotência confere `record_count` contra o `count(*)` real, porque só o `sha256`
deixaria uma carga interrompida presa em no-op **para sempre e em silêncio**; e os lotes são deduplicados
por PK antes do envio, já que uma colisão dispara *"ON CONFLICT DO UPDATE cannot affect row a second
time"* e aborta o lote inteiro (medido: zero colisões hoje).

**A fonte é pior do que "parada": é errática.** O primeiro dry-run morreu com `TypeError: terminated`.
Medido em execuções seguidas do mesmo arquivo: **1,5 s · 7,0 s · 9,3 s · 11,8 s · 15,9 s · 27,7 s ·
40,9 s · 46,9 s**, com uma morrendo no meio do corpo — cerca de 1 falha a cada 5. Daí o `retry.ts`, com 4
tentativas, backoff linear e o `dormir` injetável, para os testes não dependerem de rede nem de relógio.

**Dois achados de ambiente que valem mais que o código.** O `.gitignore` tinha `scripts/*` desde 20/09, o
que teria deixado a carga inteira fora do git — você mandou remover a regra, e os dois scripts que ela
escondia entraram (nenhum com segredo: a chave da NVIDIA vem de `os.environ`). E **`.env.local` aponta
para `127.0.0.1:54321` e vence a precedência**, então `npm run radar:ingest` mandaria a carga para a stack
local, que está desligada. Virou `npm run radar:ingest:prod`, que carrega só o `.env` — o footgun não deve
depender de alguém lembrar.

**O defeito que a carga revelou, e que os testes não pegaram.** Depois da primeira carga, conferindo a
saída da RPC contra o arquivo bruto, `proprietario` estava `null`. A fonte manda **`Proprietario` como
objeto aninhado** — `{Nome, Municipio, Estado}` —, e meu tipo assumia `string`: as 1.971 linhas entraram
sem proprietário. **Os testes não pegaram porque o fixture reproduzia o mesmo engano** — eu comparava a
saída contra a minha própria suposição, e não contra a fonte. Quem pegou foi conferir o dado real.
Corrigido com quatro testes, um deles varrendo o fixture inteiro, e a recarga precisou de um `--force`
novo, já que bytes idênticos fariam a idempotência recusar a correção como no-op.

**Estado final, conferido no banco e não presumido:** 1.971 instrumentos, 3.346 faixas, 9.652 verificações
(7.814 `historico`, 1.838 `topo`), 1 snapshot com `sha256 4dcb3d35…648fb9b` e o arquivo de 3.661.867 bytes
no bucket `evidencias`. Zero `snapshot_id` órfão, zero `velocidade_nominal = 0` contra **32 nulas —
exatamente as 32 que o plano previa** —, zero verificações `topo` com número de certificado, e os
proprietários reproduzindo o censo (CONSILUX 328, SPLICE 293, PERKONS 247, CLD 233, ELISEU KOPP 231,
SITRAN 162).

**Um achado para a Fase 3, que não é desta carga e não bloqueia nada:** **81 das 7.814** entradas de
histórico não trazem número de certificado na origem. A RPC devolve `numero: null` com
`origem: "historico"` e **`avisos: []` vazio** — o plano só previa o aviso para origem `topo`. Como está,
uma peça poderia afirmar vigência sem número e sem ressalva. Decidir na Fase 5, quando a redação por
status for escrita.

**Arquivos:** `scripts/lib/psie.ts`, `scripts/lib/psie.test.ts`, `scripts/lib/retry.ts`,
`scripts/lib/retry.test.ts`, `scripts/ingest-radares-rj.ts`, `package.json`, `.gitignore`, a spec, o plano
e este. Nove commits na branch `feat/carga-radares-rj`. **Nenhuma migration, nenhum schema tocado, e nada
em `src/`, `server/`, `pipeline/` ou `supabase/functions/`.**

**Ficou de fora:** `pg_cron` e poda (pendências 19 e 21 intocadas), a Fase 0.5 (segue bloqueada —
`form_submissions` tem 0 linhas), e as Fases 4 e 5, que são o próximo passo: sem a coluna
`form_submissions.verificacao_medidor`, o dado carregado **ainda não tem consumidor**.

