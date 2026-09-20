# Endereço estável para o pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a `DISPATCH_PIPELINE_URL` um endereço HTTPS estável, para que a Edge `form-submit` alcance o pipeline sem depender de túnel efêmero nem de máquina ligada — fechando o último obstáculo técnico ao fluxo completo em produção.

**Architecture:** Um VPS na Hostinger roda **dois** contêineres de aplicação — o Express e o pipeline FastAPI — atrás de um Caddy que termina TLS. Só o pipeline é exposto, e só em dois caminhos (`/hooks/dispatch` e `/health`); o Express fica na rede interna do compose, sem porta publicada, porque é "o único caminho do pipeline até o Postgres" e não tem razão para existir na internet. A configuração viaja por variáveis de ambiente do compose, nunca por arquivos `.env` dentro da imagem.

**Tech Stack:** Docker + Docker Compose, Caddy 2 (TLS automático via Let's Encrypt), Node 20 (Express), Python 3.12 (FastAPI/uvicorn), API da Hostinger para VPS, firewall e DNS.

**Spec:** Não há documento de spec. A decisão que este plano implementa foi tomada na sessão de 17/09/2026 — hospedar Express e pipeline num VPS da Hostinger —, e o problema está descrito na **pendência 11** e no **passo 7** do roteiro em `PROGRESSO.md`. Executores devem ler os dois antes de começar.

## Global Constraints

- **Gerenciador de pacotes: `npm`.** Nunca `bun`, `yarn` ou `pnpm`. O lockfile é versionado.
- **Não alterar código de aplicação.** Este plano cria artefatos de deploy e configuração. Se algo em `server/` ou `pipeline/` precisar mudar, **pare e reporte** — não é o escopo aqui.
- **Configuração por variável de ambiente, não por arquivo.** `pipeline/config.py` e `server/src/index.ts` ancoram os `.env` na **raiz do repositório**; dentro de um contêiner que copia só um subdiretório, esse caminho não existe. Tanto `pydantic-settings` quanto `dotenv` dão precedência a variáveis reais do ambiente, então o compose as injeta e nenhum `.env` entra na imagem. **Nunca copiar `.env*` para dentro de uma imagem.**
- **O Express não recebe porta publicada.** Use `expose`, nunca `ports`. Ele fala com o mundo só de dentro da rede do compose.
- **`PIPELINE_ENV=production` torna o SMTP obrigatório** — sem `SMTP_HOST` e `MAIL_FROM`, o worker levanta erro em vez de pular o e-mail.
- **O corpo assinado por HMAC é o JSON compacto** (`separators=(",",":")`). Nada neste plano pode reserializar o corpo entre a Edge e o pipeline.
- **Segredos nunca entram no git.** `deploy/.env.vps` é criado no servidor e está no `.gitignore`.
- **Comentários e mensagens de commit em português**, no tom do repositório.
- **Ao fim, acrescentar entrada em `PROGRESSO.md`** — convenção declarada no `CLAUDE.md`.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `deploy/Dockerfile.server` | criar | Imagem do Express: build TypeScript e execução de `dist/index.js`. |
| `deploy/Dockerfile.pipeline` | criar | Imagem do pipeline: dependências de `pipeline/requirements.txt` e uvicorn. |
| `deploy/docker-compose.yml` | criar | Orquestra os três serviços, a rede interna e os volumes do Caddy. |
| `deploy/Caddyfile` | criar | TLS automático e proxy reverso **apenas** de `/hooks/dispatch` e `/health`. |
| `.dockerignore` | criar | **Na raiz**, não em `deploy/`: o Docker procura o arquivo no raiz do *contexto* de build, que é a raiz do repositório. Impede que `.env*`, `node_modules` e `.venv` entrem no contexto. |
| `deploy/README.md` | criar | Como publicar e como reverter, para quem não leu este plano. |
| `.gitignore` | modificar | Acrescenta `deploy/.env.vps`. |
| `CLAUDE.md` | modificar | Passa a descrever onde o pipeline roda em produção. |
| `PROGRESSO.md` | modificar | Entrada da sessão; fecha a pendência 11 e o passo 7. |

---

### Task 1: Contêineres que sobem e respondem — validado na sua máquina

Nada de VPS ainda. Esta task termina com o conjunto inteiro rodando localmente em Docker, provando que as imagens funcionam antes de existir servidor para culpar.

**Files:**
- Create: `deploy/Dockerfile.server`, `deploy/Dockerfile.pipeline`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `.dockerignore`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `server/package.json` (script `build` → `tsc`, `start` → `node dist/index.js`), `pipeline/requirements.txt`, `pipeline/main.py` (`app`).
- Produces: os serviços de compose `express` (porta interna 3001), `pipeline` (8000) e `caddy` (80/443); a variável `EXPRESS_INTERNAL_URL=http://express:3001` como forma de o pipeline achar o Express.

- [ ] **Step 1: Escrever o `.dockerignore`**

Criar `.dockerignore` **na raiz do repositório** — não em `deploy/`. O Docker
procura esse arquivo no raiz do **contexto** de build, e o contexto aqui é `..`
(as duas imagens precisam de subdiretórios diferentes). Em `deploy/` ele seria
silenciosamente ignorado.

```
.git
**/node_modules
**/dist
**/.venv
.env
.env.*
!.env.example
!.env.local.example
!.env.production.example
*.log
docs
```

Os `**/` não são enfeite: padrão sem barra casa **só o nível de cima**, então
`node_modules` sozinho deixaria `server/node_modules` entrar no contexto. E a
parte que mais importa: **nenhum `.env` pode entrar numa imagem.**

- [ ] **Step 2: Escrever o Dockerfile do Express**

Criar `deploy/Dockerfile.server`:

```dockerfile
# Express — API interna. Único caminho do pipeline até o Postgres.
FROM node:20-slim AS build
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# O código lê .env da raiz do repositório; em contêiner isso não existe, e é de
# propósito: a configuração vem por variável de ambiente, que o dotenv não
# sobrescreve.
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Escrever o Dockerfile do pipeline**

Criar `deploy/Dockerfile.pipeline`:

```dockerfile
# Pipeline FastAPI — DeepSeek -> PDF -> Storage -> SMTP.
# Python 3.12 e não 3.14: as versões fixadas em requirements.txt têm wheels
# prontos para 3.12, e sem wheel o reportlab exigiria compilador na imagem.
FROM python:3.12-slim
WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip

COPY pipeline/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY pipeline/main.py pipeline/worker.py pipeline/config.py pipeline/hmac_utils.py ./

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 4: Escrever o Caddyfile**

Criar `deploy/Caddyfile`:

```
# Só o pipeline é público, e só nos dois caminhos que precisam ser.
# O Express NÃO aparece aqui: ele vive na rede interna do compose.
{$PIPELINE_DOMAIN} {
	encode gzip

	handle /hooks/dispatch {
		reverse_proxy pipeline:8000
	}

	handle /health {
		reverse_proxy pipeline:8000
	}

	# Qualquer outro caminho não existe para o mundo.
	handle {
		respond "not found" 404
	}
}
```

- [ ] **Step 5: Escrever o compose**

Criar `deploy/docker-compose.yml`:

```yaml
services:
  express:
    build:
      context: ..
      dockerfile: deploy/Dockerfile.server
    # `expose`, nunca `ports`: o Express não tem razão para existir na internet.
    expose:
      - "3001"
    env_file: [.env.vps]
    restart: unless-stopped

  pipeline:
    build:
      context: ..
      dockerfile: deploy/Dockerfile.pipeline
    expose:
      - "8000"
    env_file: [.env.vps]
    environment:
      # Nome do serviço na rede do compose — substitui o 127.0.0.1 local.
      EXPRESS_INTERNAL_URL: http://express:3001
    depends_on:
      - express
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    # env_file, e não `environment: ${PIPELINE_DOMAIN}`: a interpolação do
    # compose lê do shell ou de um arquivo chamado exatamente `.env` — nunca de
    # `.env.vps`. Pelo env_file a variável chega ao ambiente do contêiner, que é
    # de onde o `{$PIPELINE_DOMAIN}` do Caddyfile a lê.
    env_file: [.env.vps]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - pipeline
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 6: Proteger o arquivo de segredos no git**

```bash
printf '\n# segredos do deploy — criados no servidor, nunca versionados\ndeploy/.env.vps\n' >> .gitignore
git check-ignore -v deploy/.env.vps
```

Esperado: a saída cita `.gitignore` e a linha nova. Se não citar, **pare** — o próximo commit vazaria segredos.

- [ ] **Step 7: Montar um `.env.vps` local para o teste**

```bash
cd deploy
cat > .env.vps <<'EOF'
PIPELINE_DOMAIN=localhost
PIPELINE_HMAC_SECRET=teste-local-nao-e-segredo
PIPELINE_ENV=development
SUPABASE_URL=http://host.docker.internal:54321
SUPABASE_SERVICE_ROLE_KEY=<a chave de service role LOCAL, de `npx supabase status`>
STORAGE_BUCKET=generated-recursos
DEEPSEEK_API_KEY=
SMTP_HOST=
EOF
```

`DEEPSEEK_API_KEY` e `SMTP_HOST` vazios de propósito: esta task prova que os serviços sobem e conversam, não a redação nem o e-mail.

- [ ] **Step 8: Subir e verificar que os dois respondem**

```bash
cd deploy
docker compose up -d --build express pipeline
docker compose ps
curl -s -o /dev/null -w 'express: %{http_code}\n' http://127.0.0.1:3001/health || echo "express: sem porta publicada (esperado)"
docker compose exec pipeline python -c "import urllib.request;print('pipeline ->', urllib.request.urlopen('http://127.0.0.1:8000/health').status)"
docker compose exec pipeline python -c "import urllib.request;print('express  ->', urllib.request.urlopen('http://express:3001/health').status)"
```

Esperado: `pipeline -> 200` e `express -> 200`. O `curl` direto ao 3001 **deve falhar** — é a prova de que o Express não está publicado.

- [ ] **Step 9: Provar que o endpoint assinado funciona dentro do contêiner**

```bash
cd deploy
docker compose exec pipeline python - <<'PY'
import hashlib, hmac, json, urllib.request, urllib.error
corpo = json.dumps({"case_id":"CASO_00000000-0000-0000-0000-000000000000",
                    "email":"x@y.com",
                    "dispatch_key":"00000000-0000-0000-0000-000000000000"},
                   separators=(",",":"), ensure_ascii=False)
def post(assinatura):
    req = urllib.request.Request("http://127.0.0.1:8000/hooks/dispatch",
        data=corpo.encode(),
        headers={"Content-Type":"application/json","X-Signature":assinatura})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

certa = hmac.new(b"teste-local-nao-e-segredo", corpo.encode(), hashlib.sha256).hexdigest()
print("assinatura correta ->", post(certa), "(esperado 202)")
print("assinatura errada  ->", post("0"*64), "(esperado 401)")
PY
```

Esperado: `202` e `401`. O 202 é só o aceite — o trabalho falha em seguida, porque o `case_id` não existe. É o que se quer aqui.

- [ ] **Step 10: Provar que o Caddy só expõe os dois caminhos**

O Caddy não foi exercitado nos passos anteriores, e a regra que mais importa —
o mundo não alcançar o Express — mora nele. Localmente não há TLS válido para
`localhost`, então suba só o HTTP:

```bash
cd deploy
docker compose up -d caddy
curl -s -o /dev/null -w 'health: %{http_code}  (esperado 200)\n'  -H 'Host: localhost' http://127.0.0.1/health
curl -s -o /dev/null -w 'raiz:   %{http_code}  (esperado 404)\n'  -H 'Host: localhost' http://127.0.0.1/
curl -s -o /dev/null -w 'admin:  %{http_code}  (esperado 404)\n'  -H 'Host: localhost' http://127.0.0.1/internal/cases/x
```

O terceiro é o que interessa: um caminho do Express respondendo `404` prova que
ele **não** está exposto pelo proxy. Se responder qualquer outra coisa, o
`Caddyfile` está errado — **pare**.

- [ ] **Step 11: Derrubar e commitar**

```bash
cd deploy && docker compose down && cd ..
git add deploy/Dockerfile.server deploy/Dockerfile.pipeline deploy/docker-compose.yml deploy/Caddyfile .dockerignore .gitignore
git commit -m "feat(deploy): containeriza Express e pipeline atrás de um Caddy

O pipeline nunca foi publicado em lugar nenhum, e ele não roda sozinho: o worker
chega ao Postgres exclusivamente pelo Express. São dois serviços, e o compose
trata os dois — com o Express em `expose`, sem porta publicada, porque não tem
razão para existir na internet.

A configuração vem por variável de ambiente e nenhum .env entra nas imagens:
config.py e index.ts ancoram os arquivos na raiz do repositório, caminho que não
existe dentro do contêiner, e tanto pydantic-settings quanto dotenv dão
precedência ao ambiente real.

Verificado localmente: os dois respondem em /health pela rede do compose, o
Express NÃO responde de fora, e /hooks/dispatch devolve 202 com assinatura certa
e 401 com assinatura errada."
```

---

### Task 2: O VPS existe, com firewall e acesso

**Files:** nenhum no repositório. Esta task é infraestrutura, e o registro dela é a saída dos comandos.

**Interfaces:**
- Consumes: conta Hostinger autenticada (o plugin MCP; se o token tiver expirado, reautorizar antes de começar).
- Produces: `VPS_ID`, `VPS_IP` e acesso SSH — consumidos pelas tasks 3 e 4.

- [ ] **Step 1: Escolher o plano no catálogo**

```
billing_getCatalogItemListV1( category: "VPS" )
```

Escolha o **menor plano com 2 GB de RAM ou mais**. Justificativa: três contêineres, e o build do TypeScript dentro do `docker compose build` é o pico de memória. 1 GB costuma matar o build com OOM. Anote o `item_id` e o preço — os preços vêm em **centavos**.

- [ ] **Step 2: Registrar sua chave SSH pública**

```bash
ssh-keygen -t ed25519 -C "amorecorrer-vps" -f ~/.ssh/amorecorrer_vps -N ""
cat ~/.ssh/amorecorrer_vps.pub
```

```
VPS_createPublicKeyV1( name: "amorecorrer", key: "<conteúdo de amorecorrer_vps.pub>" )
```

- [ ] **Step 3: Comprar o VPS**

```
billing_createPurchaseOrderV1( items: [ { item_id: "<do passo 1>", quantity: 1 } ] )
```

**É uma compra com cobrança real.** Se a resposta for `202`, o pagamento está em processamento e o pedido conclui de forma assíncrona. Aguarde a conclusão antes de seguir.

- [ ] **Step 4: Provisionar com Ubuntu e Docker**

Pelo hPanel ou pelos endpoints de VPS, instale **Ubuntu 24.04** e anexe a chave SSH do passo 2. Escolha o datacenter **mais próximo do Brasil** — a Supabase do projeto está em `sa-east-1` e os destinatários são brasileiros.

Anote `VPS_ID` e `VPS_IP`. Depois:

```bash
ssh -i ~/.ssh/amorecorrer_vps root@<VPS_IP> 'cat /etc/os-release | head -2; docker --version || echo "docker ausente"'
```

Se o Docker estiver ausente:

```bash
ssh -i ~/.ssh/amorecorrer_vps root@<VPS_IP> 'curl -fsSL https://get.docker.com | sh && docker --version'
```

- [ ] **Step 5: Fechar o firewall**

```
VPS_createNewFirewallV1( name: "amorecorrer" )
```

O firewall **descarta tudo por padrão**; é preciso abrir explicitamente. Três regras, e só três:

```
VPS_createFirewallRuleV1( firewallId: <id>, protocol: "SSH",   port: "22",  source: "any", source_detail: "any" )
VPS_createFirewallRuleV1( firewallId: <id>, protocol: "HTTP",  port: "80",  source: "any", source_detail: "any" )
VPS_createFirewallRuleV1( firewallId: <id>, protocol: "HTTPS", port: "443", source: "any", source_detail: "any" )
```

A porta 80 é necessária: o Let's Encrypt valida por ela antes de emitir o certificado. Ative o firewall na máquina e sincronize.

**Verificar:** de fora, `nc -z -w5 <VPS_IP> 3001` e `nc -z -w5 <VPS_IP> 8000` devem **falhar**, e `nc -z -w5 <VPS_IP> 22` deve passar. Se 3001 ou 8000 responderem, o firewall não está ativo — **pare**.

---

### Task 3: O subdomínio aponta para o VPS

**Files:** nenhum. A zona de `amorecorrer.com` é gerenciada pela API da Hostinger.

**Interfaces:**
- Consumes: `VPS_IP` da Task 2.
- Produces: `pipeline.amorecorrer.com` resolvendo para o VPS — consumido pelo Caddy (emissão do certificado) e pela Task 5.

- [ ] **Step 1: Ler a zona antes de tocar nela**

```
DNS_getDNSRecordsV1( domain: "amorecorrer.com" )
```

Esperado hoje: cinco registros — `CNAME www`, `TXT resend._domainkey`, `TXT send`, `MX send`, `CNAME rsend`. **Guarde essa saída**; é o seu ponto de retorno.

- [ ] **Step 2: Validar o registro novo antes de aplicar**

```
DNS_validateDNSRecordsV1(
  domain: "amorecorrer.com",
  overwrite: false,
  zone: [ { "name": "pipeline", "type": "A", "ttl": 300, "records": [ { "content": "<VPS_IP>" } ] } ]
)
```

Esperado: `{"message":"Request accepted"}`. Um `500` aqui significa formato errado — **não aplique**.

> **Armadilha desta API, descoberta em 17/09/2026:** a prioridade de um `MX` não vai em campo `priority`, nem no registro nem na entrada da zona — as duas formas devolvem `500` sem explicação. Vai dentro do `content`, no formato de arquivo de zona (`"10 host"`). Não afeta um registro `A`, mas afeta qualquer MX que você venha a acrescentar.

- [ ] **Step 3: Aplicar com `overwrite: false`**

```
DNS_updateDNSRecordsV1(
  domain: "amorecorrer.com",
  overwrite: false,
  zone: [ { "name": "pipeline", "type": "A", "ttl": 300, "records": [ { "content": "<VPS_IP>" } ] } ]
)
```

`overwrite: false` acrescenta sem tocar nos cinco registros existentes — os quatro da Resend inclusive. **Reler a zona depois e conferir que continuam lá.**

- [ ] **Step 4: Verificar a propagação**

```bash
curl -s -H 'accept: application/dns-json' \
  "https://dns.google/resolve?name=pipeline.amorecorrer.com&type=A" | grep -o '"data":"[^"]*"'
```

Esperado: o IP do VPS. O TTL é 300, então costuma ser imediato. **Não siga para a Task 4 antes disso** — o Caddy falha ao emitir o certificado se o nome não resolver, e o Let's Encrypt tem limite de tentativas.

---

### Task 4: Os serviços rodando no VPS, com TLS

**Files:**
- Create: `deploy/README.md`

**Interfaces:**
- Consumes: as imagens da Task 1, o acesso da Task 2, o DNS da Task 3.
- Produces: `https://pipeline.amorecorrer.com/hooks/dispatch` — consumido pela Task 5.

- [ ] **Step 1: Copiar o código para o servidor**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git archive --format=tar HEAD | gzip > /tmp/amorecorrer.tar.gz
scp -i ~/.ssh/amorecorrer_vps /tmp/amorecorrer.tar.gz root@<VPS_IP>:/tmp/
ssh -i ~/.ssh/amorecorrer_vps root@<VPS_IP> 'mkdir -p /opt/amorecorrer && tar xzf /tmp/amorecorrer.tar.gz -C /opt/amorecorrer && rm /tmp/amorecorrer.tar.gz && ls /opt/amorecorrer/deploy'
```

`git archive` leva **só o que está versionado** — nenhum `.env`, nenhum `node_modules`, nenhum `.venv` vai junto. É a razão de usá-lo em vez de `scp -r`.

- [ ] **Step 2: Criar o arquivo de segredos no servidor**

Os valores saem de `.env.production` na sua máquina. **Este arquivo existe só no servidor.**

```bash
ssh -i ~/.ssh/amorecorrer_vps root@<VPS_IP> 'cat > /opt/amorecorrer/deploy/.env.vps' <<'EOF'
PIPELINE_DOMAIN=pipeline.amorecorrer.com
PIPELINE_ENV=production

PIPELINE_HMAC_SECRET=<o mesmo segredo do DISPATCH_PIPELINE_HMAC_SECRET da Edge>

SUPABASE_URL=https://tsdzvxgkokrjqayxukud.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role do projeto remoto>
STORAGE_BUCKET=generated-recursos

DEEPSEEK_API_KEY=<chave do DeepSeek>
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=<chave re_... da Resend>
MAIL_FROM=no-reply@amorecorrer.com

PORT=3001
EOF
ssh -i ~/.ssh/amorecorrer_vps root@<VPS_IP> 'chmod 600 /opt/amorecorrer/deploy/.env.vps'
```

`MAIL_FROM=no-reply@amorecorrer.com` só é válido porque o domínio foi verificado na Resend em 17/09/2026. Com `PIPELINE_ENV=production`, SMTP ausente derruba o worker em vez de pular o e-mail.

- [ ] **Step 3: Subir**

```bash
ssh -i ~/.ssh/amorecorrer_vps root@<VPS_IP> 'cd /opt/amorecorrer/deploy && docker compose up -d --build && docker compose ps'
```

Esperado: `express`, `pipeline` e `caddy` em `running`. Se o build do Express morrer sem mensagem, é memória — veja a justificativa do plano de 2 GB na Task 2.

- [ ] **Step 4: Verificar TLS e o alcance de fora**

```bash
curl -s -o /dev/null -w 'health:  %{http_code}  (TLS: %{ssl_verify_result} — 0 = válido)\n' https://pipeline.amorecorrer.com/health
curl -s -o /dev/null -w 'raiz:    %{http_code}  (esperado 404)\n'                        https://pipeline.amorecorrer.com/
curl -s -o /dev/null -w 'express: %{http_code}  (esperado falhar)\n'                     http://pipeline.amorecorrer.com:3001/health --max-time 5 || echo 'express: inalcançável de fora — correto'
```

Esperado: `health: 200` com TLS válido, `raiz: 404`, e o Express inalcançável. Se o certificado não emitir, veja `docker compose logs caddy` — a causa quase sempre é DNS ainda não propagado ou a porta 80 fechada.

- [ ] **Step 5: Provar a assinatura pelo endereço público**

```bash
python3 - <<'PY'
import hashlib, hmac, json, urllib.request, urllib.error
corpo = json.dumps({"case_id":"CASO_00000000-0000-0000-0000-000000000000",
                    "email":"x@y.com",
                    "dispatch_key":"00000000-0000-0000-0000-000000000000"},
                   separators=(",",":"), ensure_ascii=False)
req = urllib.request.Request("https://pipeline.amorecorrer.com/hooks/dispatch",
    data=corpo.encode(), headers={"Content-Type":"application/json","X-Signature":"0"*64})
try:
    with urllib.request.urlopen(req, timeout=20) as r: print("assinatura errada ->", r.status)
except urllib.error.HTTPError as e: print("assinatura errada ->", e.code, "(esperado 401)")
PY
```

Esperado: `401`. **Não** teste aqui com a assinatura correta: o segredo de produção não deve passar pela sua linha de comando, e a prova real vem na Task 5, pelo caminho do produto.

- [ ] **Step 6: Escrever o README do deploy e commitar**

Criar `deploy/README.md`:

```markdown
# Deploy — Express + pipeline

Rodam num VPS da Hostinger, em `/opt/amorecorrer/deploy`, sob Docker Compose.
Só o pipeline é público, e só em `/hooks/dispatch` e `/health`, atrás de um
Caddy que cuida do TLS. O Express não tem porta publicada.

## Publicar uma versão nova

    git archive --format=tar HEAD | gzip > /tmp/amorecorrer.tar.gz
    scp -i ~/.ssh/amorecorrer_vps /tmp/amorecorrer.tar.gz root@<IP>:/tmp/
    ssh -i ~/.ssh/amorecorrer_vps root@<IP> \
      'tar xzf /tmp/amorecorrer.tar.gz -C /opt/amorecorrer && cd /opt/amorecorrer/deploy && docker compose up -d --build'

`git archive` leva só o versionado — nenhum segredo viaja junto.

## Segredos

Vivem em `/opt/amorecorrer/deploy/.env.vps`, com modo 600, **apenas no
servidor**. O arquivo está no `.gitignore` e nunca entra numa imagem: tanto
`pydantic-settings` quanto `dotenv` dão precedência às variáveis de ambiente que
o compose injeta.

## Reverter

    ssh ... 'cd /opt/amorecorrer/deploy && docker compose down'

A Edge passa a receber erro de conexão no dispatch, o caso fica em `failed` e
pode ser reprocessado — nenhum dado se perde.

## Diagnóstico

    docker compose ps
    docker compose logs -f pipeline
    docker compose logs -f express
    docker compose logs caddy      # certificado não emitiu? a causa está aqui
```

```bash
git add deploy/README.md
git commit -m "docs(deploy): como publicar, reverter e diagnosticar o VPS"
```

---

### Task 5: A Edge aponta para o endereço novo, e o fluxo roda em produção

**Files:**
- Modify: `.env.production` (valor de `DISPATCH_PIPELINE_URL`)

**Interfaces:**
- Consumes: `https://pipeline.amorecorrer.com/hooks/dispatch` da Task 4.
- Produces: o fluxo completo funcionando em produção — o que encerra a pendência 11.

- [ ] **Step 1: Publicar o segredo no projeto Supabase**

As Edge Functions em produção **não leem `.env`** — leem os secrets do projeto.

```bash
npx supabase secrets set DISPATCH_PIPELINE_URL=https://pipeline.amorecorrer.com/hooks/dispatch --project-ref tsdzvxgkokrjqayxukud
npx supabase secrets list --project-ref tsdzvxgkokrjqayxukud
```

Confirme que `DISPATCH_PIPELINE_HMAC_SECRET` já está lá e é **o mesmo valor** de `PIPELINE_HMAC_SECRET` no `.env.vps`. Se divergirem, o pipeline responde `401` e o dispatch morre em silêncio — foi exatamente isso que derrubou o fluxo em 31/08/2026.

- [ ] **Step 2: Refletir a mudança no arquivo de perfil**

Em `.env.production`, trocar a linha:

```
DISPATCH_PIPELINE_URL=SUBSTITUA_URL_PUBLICA_DO_PIPELINE
```

por:

```
DISPATCH_PIPELINE_URL=https://pipeline.amorecorrer.com/hooks/dispatch
```

O arquivo não vai para o git; o par versionado é `.env.production.example`, onde o placeholder **permanece**.

- [ ] **Step 3: Rodar um caso real pelo caminho do produto**

Pelo navegador, em produção: checkout com cartão de teste do Stripe, volta ao formulário, preencha com um e-mail seu **real** e envie.

- [ ] **Step 4: Verificar o desfecho no banco de produção**

```sql
select f.case_id, f.document_status, d.status as dispatch,
       g.status as email, g.provider_message_id, g.sha256
from form_submissions f
join dispatches d using (case_id)
join generated_documents g on g.dispatch_key = d.dispatch_key
order by f.created_at desc limit 1;
```

Esperado: `completed / sent / emailed`, com `provider_message_id` preenchido.

- [ ] **Step 5: Verificar o que não vem do nosso banco**

Três confirmações independentes:

1. **O e-mail chegou** — confira a caixa, e se caiu em spam. É a primeira entrega real a partir de `no-reply@amorecorrer.com`.
2. **A Resend confirma** — `list-emails` deve trazer o envio com status `delivered` e o remetente do domínio próprio, não `onboarding@resend.dev`.
3. **O PDF é artefato** — baixe do Storage e confira que o `sha256` bate com o gravado, como em 15/09/2026.

- [ ] **Step 6: Commitar o que é versionável**

```bash
git add .env.production.example
git commit -m "chore(deploy): endereço estável do pipeline em produção

DISPATCH_PIPELINE_URL deixa de apontar para um túnel trycloudflare morto e passa
a https://pipeline.amorecorrer.com/hooks/dispatch. O valor real vive nos secrets
do projeto Supabase — Edge Functions em produção não leem .env. Fecha a
pendência 11."
```

---

### Task 6: Documentação

**Files:**
- Modify: `CLAUDE.md`, `PROGRESSO.md`

- [ ] **Step 1: Atualizar o `CLAUDE.md`**

Na seção de comandos, o bloco do pipeline descreve só a execução local. Acrescente, logo abaixo dele:

```markdown
**Em produção**, Express e pipeline rodam num VPS da Hostinger sob Docker Compose, em `/opt/amorecorrer/deploy` — ver `deploy/README.md`. Só o pipeline é público (`https://pipeline.amorecorrer.com`, caminhos `/hooks/dispatch` e `/health`), atrás de um Caddy que cuida do TLS; o Express não tem porta publicada. As Edge Functions leem `DISPATCH_PIPELINE_URL` dos **secrets do projeto Supabase**, não de `.env`.
```

Na seção "Armadilhas conhecidas", acrescente:

```markdown
- **Publicar exige atenção a dois pares de segredo.** `DISPATCH_PIPELINE_HMAC_SECRET` (secret do projeto Supabase) e `PIPELINE_HMAC_SECRET` (`.env.vps` no servidor) são **o mesmo valor com dois nomes**; divergirem faz o pipeline responder 401 e o dispatch morrer em silêncio. E nenhum `.env` entra nas imagens: a configuração vem por variável de ambiente do compose, porque `config.py` e `index.ts` ancoram os arquivos na raiz do repositório, caminho que não existe no contêiner.
```

- [ ] **Step 2: Fechar a pendência 11 e o passo 7 no `PROGRESSO.md`**

Riscar a pendência 11 com a data e o endereço novo; marcar o passo 7 do roteiro como concluído; acrescentar a entrada da sessão com o que foi medido — TLS válido, `401` com assinatura errada, e o desfecho do caso real.

- [ ] **Step 3: Commitar**

```bash
git add CLAUDE.md PROGRESSO.md
git commit -m "docs: registra onde o pipeline roda em produção"
```

---

## Notas de execução

**A Task 2 gasta dinheiro e a 5 manda e-mail para um cliente real (você).** Nenhuma das duas deve rodar sem o Klaus por perto.

**Se o token do plugin da Hostinger expirar** — aconteceu durante a escrita deste plano —, reautorize antes de começar a Task 2. As tasks 1 e 6 não dependem dele.

**O que este plano NÃO cobre, de propósito:** a hospedagem do **frontend**. `FRONTEND_URL` e `ORIGIN_WHITELIST` apontam para `https://www.amorecorrer.com`, e a zona não tem registro `A` na raiz — o site não está hospedado em lugar nenhum. É uma decisão separada, e o fluxo de dispatch fecha sem ela.
