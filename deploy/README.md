# deploy/

Express e pipeline em contêineres. O mesmo par de imagens roda de dois jeitos:

| Modo | Quem dá o endereço público e o TLS | Configuração | Estado |
|---|---|---|---|
| **Local com ngrok** | o ngrok, com o domínio fixo gratuito da conta | o `.env` da raiz | **em uso desde 15/10/2026**, na máquina do Klaus |
| **VPS** | o Caddy, com certificado do Let's Encrypt | `deploy/.env.vps`, criado no servidor | planejado: Tasks 2 a 6 de `docs/superpowers/plans/2026-09-17-endereco-estavel-do-pipeline.md` |

Nos dois modos, só o pipeline é público, e só em `/hooks/dispatch` e `/health`. Todo o resto responde 404, inclusive o `/docs` do FastAPI. O Express não publica porta: o pipeline o alcança pela rede do compose (`http://express:3001`). Nenhum `.env` entra numa imagem (`.dockerignore`); a configuração é lida quando o contêiner sobe.

| Arquivo | Papel |
|---|---|
| `Dockerfile.server` | Express. Node 22: o `supabase-js` do lockfile exige WebSocket nativo, e no Node 20 o contêiner cai ao subir. |
| `Dockerfile.pipeline` | pipeline, com a base do CTB (`CTB_DIR=/app/ctb`) e as fontes da peça |
| `docker-compose.yml` | express, pipeline e caddy, com o `.env.vps` (modo VPS) |
| `Caddyfile` | TLS e os dois caminhos públicos (modo VPS) |
| `docker-compose.ngrok.yml` | sobreposição do modo local: troca o `.env.vps` pelo `.env` da raiz e põe o ngrok no lugar do Caddy |
| `ngrok-politica.yml` | Traffic Policy do ngrok: 404 para tudo que não seja `/hooks/dispatch` ou `/health` |
| `ngrok-local.sh` | atalho do compose do modo local |

## Modo local com ngrok

**Uma vez:**

1. Crie uma conta grátis no ngrok. Copie o authtoken (dashboard → *Your Authtoken*) e o domínio fixo que a conta ganha (dashboard → *Domains*). Hoje esse domínio termina em `.ngrok-free.dev`. **Não crie endpoint nenhum no painel:** quem cria é o contêiner, ao subir. Um *Cloud Endpoint* no mesmo domínio ocupa o endereço, e o contêiner não sobe.
2. No `.env` da raiz:
   ```
   NGROK_AUTHTOKEN=<token>
   NGROK_URL=https://<domínio, exatamente como no painel>
   ```
3. Publique o endereço na nuvem (do seu terminal; o endereço não muda mais):
   ```
   npx supabase secrets set DISPATCH_PIPELINE_URL=<NGROK_URL>/hooks/dispatch
   ```
   e ponha o mesmo valor em `DISPATCH_PIPELINE_URL` no `.env`.

**Subir, conferir, descer** (da raiz; no WSL, veja a armadilha do `DOCKER_CONFIG` abaixo):

```bash
bash deploy/ngrok-local.sh up -d --build express pipeline ngrok
curl https://<domínio>/health        # {"ok":true}; /docs e / respondem 404
bash deploy/ngrok-local.sh logs -f pipeline express
bash deploy/ngrok-local.sh down
```

No PowerShell, sem o atalho (o projeto continua se chamando `deploy`):

```powershell
docker compose --env-file .env -f deploy/docker-compose.yml -f deploy/docker-compose.ngrok.yml up -d --build express pipeline ngrok
```

O `--env-file` só serve às duas variáveis do ngrok. Express e pipeline recebem o `.env` pelo `env_file`, e o contêiner do ngrok recebe só o token e o domínio.

**Regras do dia a dia:**

- **Um pipeline por vez.** Com os contêineres no ar, não suba o uvicorn, o Express nem o `cloudflared` do Windows.
- **Mudou código do pipeline ou do Express?** Rode o `up` de novo com `--build`. O contêiner roda a imagem que foi construída, não os arquivos do disco. Recriar o pipeline espera até 7 minutos (`stop_grace_period`) que um caso em andamento termine; confira antes se há caso em `generating`.
- **Mudou o `.env`?** Basta recriar os contêineres (`up -d`, sem `--build`).
- **Os contêineres voltam sozinhos** (`restart: unless-stopped`), mas só se o Docker Desktop iniciar com o Windows.
- **O perfil é sempre o web.** Os contêineres leem só o `.env`, mesmo que exista um `.env.local`.

**Armadilhas vistas em 14 e 15/10/2026:**

- **O antivírus pode interceptar o e-mail.** O Norton (*Mail Shield*) intercepta o SMTP que sai do Docker Desktop e apresenta um certificado dele. O pipeline recusa com `CERTIFICATE_VERIFY_FAILED … self-signed certificate in certificate chain`, e o caso vai a `failed` com o PDF pronto. Do WSL o certificado é o da Resend; do contêiner, era o do Norton. A correção é desligar a verificação de e-mail do antivírus, ou excluir o Docker dela. Não instale a raiz do antivírus na imagem.
- **No WSL, o Docker falha ao construir** com `error getting credentials`: o `~/.docker/config.json` aponta para o auxiliar de credenciais do Windows (`desktop.exe`). Use um config vazio só para o comando: `DOCKER_CONFIG=<pasta com um config.json contendo {}> bash deploy/ngrok-local.sh …`.
- **O site, no teste contra a nuvem, precisa estar em `localhost:4173`**, a única origem que o `ORIGIN_WHITELIST` publicado aceita: `npm run dev -- --port 4173 --strictPort`.

## Modo VPS

Ainda não executado. O roteiro está nas Tasks 2 a 6 do plano: VPS, firewall, subdomínio, `deploy/.env.vps` no servidor (modelo na Task 4), um `deploy/.env` com só `PIPELINE_DOMAIN=…` (o Caddy recebe só essa variável, por interpolação) e `docker compose up -d --build` na pasta `deploy/`. A validação local da Task 1 (os 9 testes, com o Caddy em `localhost` por HTTPS) foi feita em 13/10/2026.
