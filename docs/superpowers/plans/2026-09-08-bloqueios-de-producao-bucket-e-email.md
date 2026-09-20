# Bloqueios de produção: bucket versionado e entrega de e-mail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as duas pendências que hoje impedem o lançamento — o bucket `generated-recursos` que some a cada stack nova, e a entrega de e-mail, que faz todo caso pago terminar em `document_status = failed` — e deixar um caminho de recuperação para os casos que já falharam.

**Architecture:** Três frentes independentes, entregues em ordem. (1) O bucket vira migration idempotente, no mesmo padrão que a migration do radar já usou para `evidencias`. (2) A pergunta "o e-mail sai?" vira um comando com veredito e código de saída, em vez de folclore — e é esse comando que serve de gate para a parte operacional (DNS), que nenhum código resolve. (3) Um script de re-despacho assina o mesmo payload que a Edge assinaria e reprocessa casos presos em `failed`, reusando o `dispatch_key` existente.

**Tech Stack:** SQL (migrations Supabase), Python 3.14 (`httpx`, `aiosmtplib`, `supabase-py`, `python-dotenv` — todas já em `pipeline/requirements.txt`), Supabase CLI 2.117.

**Spec:** `PROGRESSO.md` — pendências **14** (bucket não versionado) e **16** (domínio não verificado no Resend), mais o diagnóstico de DNS levantado na sessão de 08/09/2026 e registrado na Task 3 abaixo. Não existe documento de spec separado: as pendências *são* a spec, e o executor deve lê-las antes de começar.

## Global Constraints

- **Gerenciador de pacotes: `npm`.** Nunca `bun`, `yarn` ou `pnpm`. O lockfile é versionado.
- **Não adicionar dependência nova.** Tudo que este plano usa já está em `pipeline/requirements.txt`: `httpx==0.28.1`, `aiosmtplib==3.0.2`, `supabase==2.15.1`, `python-dotenv==1.0.1`.
- **Precedência de env, igual nos quatro runtimes:** carrega-se `.env` e depois `.env.local`, e **quem vem depois ganha**. Todo script novo replica isso (`load_dotenv(ROOT/".env")` e depois `load_dotenv(ROOT/".env.local", override=True)`), ancorando pelo caminho do próprio arquivo, nunca por `cwd`.
- **Nomes de migration:** `YYYYMMDDHHMMSS_descricao.sql`. A última existente é `20260906000001_fn_verificar_medidor.sql`; este plano usa `20260908000000`.
- **Migrations são reaplicáveis.** O `ON CONFLICT DO NOTHING` e o `DROP POLICY IF EXISTS` não são cosméticos: a migration precisa passar tanto num `db reset` do zero quanto contra um banco onde alguém já criou o bucket à mão pelo Dashboard. (No remoto, conferido em 08/09/2026, **não há bucket nenhum** — mas há stacks locais onde há.)
- **Comentários e mensagens de commit em português**, no tom do repositório: dizem *por que*, não *o que*.
- **Assinatura HMAC:** o corpo assinado é o JSON **compacto** (`separators=(",",":")`). Qualquer mudança de serialização invalida a assinatura dos dois lados.
- **Ao fim da execução, acrescentar entrada em `PROGRESSO.md`** — é convenção do repositório declarada em `CLAUDE.md`.
- **Nunca declarar um bloqueio fechado sem a saída do comando que prova isso.** Este plano existe porque três sessões seguidas presumiram que o bucket estava lá.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260908000000_bucket_generated_recursos.sql` | criar | Cria o bucket privado `generated-recursos` e sua policy de service role, de forma idempotente. |
| `tests/sql/assert_storage_setup.sql` | criar | Asserção executável: falha se qualquer bucket exigido pelo produto estiver faltando. É o teste da Task 1 e a rede de segurança contra a regressão voltar. |
| `pipeline/check_email.py` | criar | Diagnóstico de entrega: resolve o DNS do domínio remetente, exercita conexão/STARTTLS/AUTH e, opcionalmente, envia. Devolve veredito e código de saída. |
| `pipeline/test_resend_smtp.py` | remover | Substituído pelo acima, que faz o mesmo e mais. |
| `scripts/redispatch.py` | criar | Reprocessa casos em `failed`, assinando o payload de dispatch e POSTando em `/hooks/dispatch`. |
| `.env.production`, `.env.production.example` | modificar | `MAIL_FROM` deixa de ser `SUBSTITUA_` quando o domínio for verificado; comentário explica a dependência de DNS. |
| `CLAUDE.md` | modificar | Sai a linha que manda criar o bucket à mão no Dashboard; entram os dois comandos novos. |
| `PROGRESSO.md` | modificar | Entrada da sessão + pendências 14 e 16 atualizadas. |

---

### Task 1: Versionar o bucket `generated-recursos`

Fecha a pendência 14. O bucket é criado à mão no Dashboard, então toda stack recriada do zero quebra no primeiro upload do PDF com `Bucket not found` — aconteceu em 01/09, 03/09 e 06/09/2026. A migration `20260906000000_radar_inmetro_rj.sql:195-202` já resolveu isto para o bucket `evidencias` e traz o padrão a copiar, inclusive o comentário que diz para não repetir o erro.

**Files:**
- Create: `tests/sql/assert_storage_setup.sql`
- Create: `supabase/migrations/20260908000000_bucket_generated_recursos.sql`
- Reference: `supabase/migrations/20260906000000_radar_inmetro_rj.sql:190-202`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: o bucket `generated-recursos` garantido por migration; `tests/sql/assert_storage_setup.sql` como asserção reutilizável, citada no `CLAUDE.md` pela Task 5.

- [ ] **Step 1: Escrever a asserção que falha**

Criar `tests/sql/assert_storage_setup.sql`:

```sql
-- Asserção de setup de Storage. Falha com exceção (e código de saída != 0) se
-- qualquer bucket exigido pelo produto estiver ausente ou público.
--
-- Roda com:  npx supabase db query --local -f tests/sql/assert_storage_setup.sql
--
-- Existe porque três sessões seguidas de teste ponta a ponta (01/09, 03/09 e
-- 06/09/2026) morreram no primeiro upload por causa de um bucket criado à mão
-- que não sobrevive a um `db reset`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'generated-recursos') THEN
    RAISE EXCEPTION 'bucket generated-recursos AUSENTE — o upload do PDF vai falhar com Bucket not found';
  END IF;

  IF (SELECT public FROM storage.buckets WHERE id = 'generated-recursos') IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'bucket generated-recursos NAO e privado — recursos de clientes ficariam publicos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role gerencia o bucket generated-recursos'
  ) THEN
    RAISE EXCEPTION 'policy de service role para generated-recursos AUSENTE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'evidencias') THEN
    RAISE EXCEPTION 'bucket evidencias AUSENTE — regressao da migration do radar';
  END IF;
END
$$;

SELECT id, name, public FROM storage.buckets ORDER BY id;
```

- [ ] **Step 2: Rodar a asserção contra um banco limpo e vê-la falhar**

O banco local pode ter o bucket criado à mão numa sessão anterior — nesse caso a asserção passaria por acidente e não provaria nada. Zere primeiro.

**Aviso:** `db reset` apaga os casos de teste que estiverem no banco local. É intencional: é exatamente o cenário que a pendência 14 descreve.

```bash
npx supabase start
npx supabase db reset
npx supabase db query --local -f tests/sql/assert_storage_setup.sql
```

Esperado: erro `bucket generated-recursos AUSENTE — o upload do PDF vai falhar com Bucket not found`, com código de saída diferente de zero. Se passar, o `db reset` não rodou — resolva isso antes de seguir.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20260908000000_bucket_generated_recursos.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Versiona o bucket privado `generated-recursos`, até aqui criado à mão no
-- Dashboard. Pendência 14 do PROGRESSO.md: três stacks recriadas do zero
-- (01/09, 03/09 e 06/09/2026) quebraram no primeiro upload do PDF com
-- `Bucket not found`. A migration do radar (20260906000000) já fez isto para
-- o bucket `evidencias` e deixou o recado escrito; aqui só replicamos.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-recursos', 'generated-recursos', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Atenção ao que a policy abaixo faz e ao que ela NÃO faz: `service_role` tem
-- `rolbypassrls = true` (conferido no projeto remoto em 08/09/2026), então ela
-- não é o que permite o upload do worker — quem permite é a linha acima, em
-- storage.buckets. A policy é defesa em profundidade e simetria com o bucket
-- `evidencias`; o bucket é privado justamente por não haver policy para anon.
--
-- CREATE POLICY não aceita IF NOT EXISTS, e o Dashboard pode ter criado
-- policies com outros nomes — derrubamos apenas a de nome canônico, para a
-- migration ser reaplicável sem apagar configuração alheia.
DROP POLICY IF EXISTS "Service role gerencia o bucket generated-recursos" ON storage.objects;

CREATE POLICY "Service role gerencia o bucket generated-recursos"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'generated-recursos')
  WITH CHECK (bucket_id = 'generated-recursos');
```

- [ ] **Step 4: Aplicar do zero e ver a asserção passar**

```bash
npx supabase db reset
npx supabase db query --local -f tests/sql/assert_storage_setup.sql
```

Esperado: sem exceção, e a listagem final contendo as duas linhas `evidencias | f` e `generated-recursos | f`.

- [ ] **Step 5: Provar que a policy funciona, não só que a linha existe**

A asserção confere metadados. Este passo exercita o caminho real: upload com a chave de service role, que é o que o `worker.py` faz.

```bash
SRK=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
printf '%%PDF-1.4 smoke' > /tmp/smoke.pdf

curl -s -o /dev/null -w 'upload: %{http_code}\n' -X POST \
  "http://127.0.0.1:54321/storage/v1/object/generated-recursos/smoke/teste.pdf" \
  -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/smoke.pdf

curl -s -o /dev/null -w 'delete: %{http_code}\n' -X DELETE \
  "http://127.0.0.1:54321/storage/v1/object/generated-recursos/smoke/teste.pdf" \
  -H "Authorization: Bearer $SRK"
```

Esperado: `upload: 200` e `delete: 200`. Um `400` com `Bucket not found` significa que o `db reset` do Step 4 não aplicou a migration; um `403` significa que a policy não casou o `bucket_id`.

- [ ] **Step 6: NÃO empurrar para o remoto ainda — parar e reportar**

Levantamento feito em 08/09/2026 direto no projeto `tsdzvxgkokrjqayxukud`:

```
select id, name, public from storage.buckets;   -> []   (nenhum bucket)
select * from pg_policies where schemaname='storage';  -> []   (nenhuma policy)
migrations aplicadas no remoto                  -> param em 20260525000000
```

Duas consequências, e nenhuma é resolvida por este plano:

1. **Produção não tem bucket nenhum.** Isto não é incômodo de teste local: no dia do lançamento, o primeiro cliente pago geraria o PDF e morreria no upload.
2. **`npx supabase db push` a partir desta branch levaria junto as duas migrations do radar** (`20260906000000` e `20260906000001`), que nunca foram para o remoto. Empurrar o schema de uma feature em andamento para produção é decisão do Klaus, não efeito colateral desta task.

Portanto: **não rode `db push` aqui.** Registre o achado, conclua a task com a verificação local, e leve a decisão de push para o Klaus separadamente.

- [ ] **Step 7: Commit**

```bash
git add tests/sql/assert_storage_setup.sql supabase/migrations/20260908000000_bucket_generated_recursos.sql
git commit -m "fix(storage): versiona o bucket generated-recursos numa migration

Criado à mão no Dashboard, ele sumia a cada stack nova e quebrava o primeiro
upload do PDF com Bucket not found — três sessões seguidas de teste ponta a
ponta morreram nisso. Mesmo padrão que a migration do radar já usou para o
bucket evidencias. Fecha a pendência 14.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017A5JfBk1448b6ospTGuzUy"
```

---

### Task 2: Um comando que responde "o e-mail sai?"

Hoje a única forma de saber é rodar o ciclo completo e ler o traceback do `worker.py`. Isso torna a pendência 16 uma questão de memória. Esta task transforma a pergunta num comando com veredito e código de saída — e é ele que serve de gate para a Task 3, que é operacional.

`pipeline/test_resend_smtp.py` faz um subconjunto disso (só o envio, lendo `os.environ` direto em vez do `config.py`, o que ignora a precedência `.env` → `.env.local`) e é removido aqui.

**Files:**
- Create: `pipeline/check_email.py`
- Delete: `pipeline/test_resend_smtp.py`

**Interfaces:**
- Consumes: `pipeline/config.py` → `settings` (campos `mail_from`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`).
- Produces: o comando `python check_email.py [--send-to EMAIL]`, com saída `0` = entrega liberada e `1` = bloqueada. A Task 3 usa esse código de saída como critério de conclusão.

- [ ] **Step 1: Escrever o diagnóstico**

Criar `pipeline/check_email.py`:

```python
"""Diagnóstico de entrega de e-mail: DNS do domínio remetente + SMTP do Resend.

Uso (a partir de `pipeline/`, com o venv do pipeline):
    python check_email.py                             # só diagnostica
    python check_email.py --send-to klaus@exemplo.com # faz um envio real

É este comando que decide se a pendência 16 do PROGRESSO.md está fechada — não
a memória de ninguém. Sai com 0 quando a entrega está liberada e 1 quando não.

Usa DNS-over-HTTPS em vez de `dig`, que não existe nesta máquina.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from email.message import EmailMessage

import aiosmtplib
import httpx

from config import settings

DOH_ENDPOINT = "https://dns.google/resolve"


def sender_domain(mail_from: str) -> str:
    match = re.search(r"@([^>\s]+)", mail_from or "")
    if not match:
        raise SystemExit(
            "MAIL_FROM ausente ou sem domínio. Lembre da precedência: `.env.local` "
            "sobrescreve `.env`, então é lá que o valor ativo pode estar vazio."
        )
    return match.group(1)


async def lookup(client: httpx.AsyncClient, name: str, rtype: str) -> list[str]:
    response = await client.get(
        DOH_ENDPOINT,
        params={"name": name, "type": rtype},
        headers={"accept": "application/dns-json"},
        timeout=10.0,
    )
    response.raise_for_status()
    return [answer.get("data", "") for answer in (response.json().get("Answer") or [])]


async def check_dns(domain: str) -> bool:
    ok = True
    async with httpx.AsyncClient() as client:
        nameservers = await lookup(client, domain, "NS")
        print(f"NS   {domain}: {nameservers or '(nenhum)'}")
        if any("dns-expired" in ns for ns in nameservers):
            print("  ✗ a zona está no parking de expirados da hospedagem.")
            print("    Nenhum registro TXT pode ser publicado enquanto isso durar —")
            print("    a verificação no Resend é impossível, não apenas pendente.")
            return False

        dkim = await lookup(client, f"resend._domainkey.{domain}", "TXT")
        print(f"DKIM resend._domainkey.{domain}: {dkim or '(nenhum)'}")
        if not any("p=" in record for record in dkim):
            print("  ✗ registro DKIM do Resend ausente.")
            ok = False

        spf = await lookup(client, f"send.{domain}", "TXT")
        print(f"SPF  send.{domain}: {spf or '(nenhum)'}")
        if not any("v=spf1" in record for record in spf):
            print("  ✗ registro SPF ausente em send.<domínio>.")
            ok = False

    return ok


async def check_smtp(send_to: str | None) -> bool:
    if not settings.smtp_host:
        print("✗ SMTP_HOST vazio — o perfil ativo não envia e-mail (é o padrão do local).")
        return False

    smtp = aiosmtplib.SMTP(
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        start_tls=False,
        use_tls=False,
    )
    await smtp.connect()
    await smtp.starttls()
    await smtp.login(settings.smtp_user, settings.smtp_password)
    print(f"✓ conexão + STARTTLS + AUTH em {settings.smtp_host}:{settings.smtp_port}")

    if not send_to:
        await smtp.quit()
        return True

    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = send_to
    message["Subject"] = "Amo Recorrer — teste de entrega"
    message.set_content("Se este e-mail chegou, o remetente está verificado.")

    try:
        await smtp.send_message(message)
        print(f"✓ aceito para entrega em {send_to} (remetente {settings.mail_from})")
        return True
    except aiosmtplib.SMTPResponseException as exc:
        print(f"✗ recusado no envio: {exc.code} {exc.message}")
        return False
    finally:
        await smtp.quit()


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send-to", default=None, help="destinatário de um envio real de teste")
    args = parser.parse_args()

    domain = sender_domain(settings.mail_from)
    print(f"MAIL_FROM = {settings.mail_from}  (domínio {domain})\n")

    dns_ok = await check_dns(domain)
    print()
    smtp_ok = await check_smtp(args.send_to)

    print()
    if dns_ok and smtp_ok:
        print("VEREDITO: entrega liberada.")
        return 0
    print("VEREDITO: bloqueado — a pendência 16 segue aberta.")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

- [ ] **Step 2: Rodar e ver o veredito negativo — que é o estado verdadeiro de hoje**

O `.env.local` zera `SMTP_HOST` de propósito, então rode com o perfil que tem SMTP. Renomeie o `.env.local` temporariamente (editar o `.env` não adianta — `.env.local` ganha):

```bash
mv .env.local .env.local.off
cd pipeline && python check_email.py ; cd ..
mv .env.local.off .env.local
```

Esperado: código de saída `1`, com `NS amorecorrer.com` apontando para `ns1.dns-expired.com`/`ns2.dns-expired.com` e a mensagem sobre o parking. **Este é o teste falhando**, e ele continua falhando até a Task 3 — de propósito: o bloqueio é real e está fora do código.

- [ ] **Step 3: Remover o script substituído**

```bash
git rm pipeline/test_resend_smtp.py
```

Ele lia `os.environ` direto, ignorando a precedência `.env` → `.env.local` que o `config.py` implementa — a mesma divergência de precedência que já derrubou o dispatch inteiro em 401 silencioso, em 31/08/2026.

- [ ] **Step 4: Commit**

```bash
git add pipeline/check_email.py
git commit -m "feat(pipeline): comando que dá veredito sobre a entrega de e-mail

Substitui test_resend_smtp.py, que só enviava e lia os.environ direto,
ignorando a precedência .env -> .env.local. Agora um único comando resolve o
DNS do remetente, exercita STARTTLS/AUTH e devolve código de saída — a
pendência 16 passa a ter um critério verificável em vez de folclore.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017A5JfBk1448b6ospTGuzUy"
```

---

### Task 3: Restaurar a zona DNS e verificar o domínio no Resend

**Esta task é operacional: os Steps 1 a 3 são ações humanas do Klaus, fora do código.** Um agente não consegue executá-los — deve parar aqui e pedir. O gate é objetivo: o comando da Task 2 saindo com `0`.

O diagnóstico levantado em 08/09/2026, com duas fontes independentes:

- Google DNS e Cloudflare DNS concordam: `amorecorrer.com` responde `"This domain is expired at Hostinger!"` em **todas** as consultas TXT, e o SOA/NS aponta para `ns1.dns-expired.com` / `ns2.dns-expired.com`.
- O RDAP da Verisign, porém, mostra o registro **em dia**: `expiration 2027-08-23`, renovado em `2026-08-23`, status `client transfer prohibited`.

Ou seja: **o domínio não expirou — o plano de hospedagem/DNS na Hostinger é que expirou**, e a zona caiu no parking. Enquanto isso durar não existe onde publicar os registros do Resend, e a pendência 16 não é "não fizemos ainda", é "não é possível fazer".

**Files:**
- Modify: `.env.production` (linha 71, `MAIL_FROM`)
- Modify: `.env.production.example` (linha 71, comentário)

**Interfaces:**
- Consumes: `pipeline/check_email.py` da Task 2 como critério de aceite.
- Produces: `MAIL_FROM` com remetente verificado; a garantia de que o `worker.py` em `PIPELINE_ENV=production` não termina todo caso em `failed`.

- [ ] **Step 1: Devolver a zona DNS ao controle (ação do Klaus)**

Dois caminhos; escolher um:

- **Renovar o plano na Hostinger**, o que traz a zona de volta aos nameservers deles.
- **Delegar os nameservers para outro provedor** (Cloudflare, por exemplo, no plano gratuito), trocando os NS no painel do registrador. Independe da hospedagem e é o caminho mais durável, já que o registro do domínio está pago até 2027-08-23.

Gate, rodado da raiz:

```bash
curl -s -H 'accept: application/dns-json' \
  "https://dns.google/resolve?name=amorecorrer.com&type=NS" | grep -o 'dns-expired' && echo "AINDA PARKED" || echo "zona OK"
```

Esperado: `zona OK`. Não siga enquanto imprimir `AINDA PARKED`.

- [ ] **Step 2: Adicionar o domínio no Resend e publicar os registros (ação do Klaus)**

Em https://resend.com/domains → *Add Domain* → `amorecorrer.com`. O Resend gera três registros; publique **exatamente** o que a tela mostrar (os valores são gerados por conta, não são fixos):

| Tipo | Nome | Papel |
|---|---|---|
| MX | `send.amorecorrer.com` | retorno de bounce |
| TXT | `send.amorecorrer.com` | SPF (`v=spf1 include:amazonses.com ~all`) |
| TXT | `resend._domainkey.amorecorrer.com` | DKIM (chave pública, `p=…`) |

Depois clique em *Verify* e espere a propagação (minutos a algumas horas, conforme o TTL).

- [ ] **Step 3: Conferir com o comando da Task 2, sem enviar**

```bash
mv .env.local .env.local.off
cd pipeline && python check_email.py ; echo "exit=$?" ; cd ..
mv .env.local.off .env.local
```

Esperado: `VEREDITO: entrega liberada.` e `exit=0`. Se o DKIM aparecer vazio, ainda é propagação — espere e repita; não avance com veredito negativo.

- [ ] **Step 4: Fazer o envio real, de ponta a ponta**

```bash
mv .env.local .env.local.off
cd pipeline && python check_email.py --send-to klaus.velando@gmail.com ; echo "exit=$?" ; cd ..
mv .env.local.off .env.local
```

Esperado: `✓ aceito para entrega em klaus.velando@gmail.com (remetente no-reply@amorecorrer.com)` e `exit=0`. **Confira a caixa de entrada** — "aceito para entrega" é o SMTP dizendo que recebeu, não o Gmail dizendo que exibiu. Se cair em spam, registre: é sinal de DMARC ausente, e vale publicar um `_dmarc` com `v=DMARC1; p=none;` como próximo passo.

Se voltar `550 The amorecorrer.com domain is not verified`, o Step 2 não concluiu — volte a ele.

- [ ] **Step 5: Fixar o remetente no perfil de produção**

Em `.env.production`, trocar a linha 71:

```
MAIL_FROM=SUBSTITUA_REMETENTE_VERIFICADO
```

por:

```
# Precisa ser um endereço em domínio VERIFICADO no Resend (resend.com/domains).
# Com domínio não verificado o envio morre no estágio DATA com 550 e, em
# PIPELINE_ENV=production, todo caso pago termina em document_status=failed.
# Confira com: cd pipeline && python check_email.py
MAIL_FROM=no-reply@amorecorrer.com
```

Copiar o mesmo bloco de comentário para `.env.production.example`, mantendo o placeholder no valor (o `.example` é versionado e não deve carregar o remetente real).

- [ ] **Step 6: Commit**

```bash
git add .env.production.example
git commit -m "docs(email): registra a dependência de DNS do remetente de produção

O MAIL_FROM precisa de domínio verificado no Resend, e a verificação depende
da zona DNS estar no ar — em 08/09/2026 ela estava no parking de expirados da
Hostinger, com o registro do domínio em dia até 2027. Fecha a pendência 16.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017A5JfBk1448b6ospTGuzUy"
```

`.env.production` não vai para o git — só o `.example` entra no commit.

---

### Task 4: Reprocessar os casos presos em `failed`

Sem isto, fechar a pendência 16 não devolve nada aos clientes cujo caso falhou enquanto o bloqueio durava: o PDF está no Storage, mas o e-mail nunca saiu e **nenhum caminho do produto reprocessa**. `attempt_dispatch` exige `document_status = 'pending'`, e reenviar o formulário bate no `dup_guard` (no-op) ou em 409 se o caso já finalizou.

O caminho existe e é curto: o `worker.py` só pula quando `dispatch.status == 'sent'` ou `document_status == 'completed'`. Um caso em `failed` passa direto por essas duas guardas e refaz o trabalho inteiro. O `register_pdf` faz upsert por `dispatch_key`, e o `storage_path` deriva do mesmo `dispatch_key` — reprocessar sobrescreve a mesma linha e o mesmo objeto, sem violar o índice único `(storage_bucket, storage_path)`. Basta assinar o payload e POSTar.

**Files:**
- Create: `scripts/redispatch.py`

**Interfaces:**
- Consumes: `PIPELINE_HMAC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` do `.env`/`.env.local`; o endpoint `POST /hooks/dispatch` de `pipeline/main.py`.
- Produces: `python scripts/redispatch.py <CASO_…>` e `python scripts/redispatch.py --all-failed`.

- [ ] **Step 1: Escrever o script**

Criar `scripts/redispatch.py`:

```python
#!/usr/bin/env python3
"""Reprocessa casos que terminaram em `failed`, reenviando o dispatch ao pipeline.

Enquanto a pendência 16 esteve aberta, todo caso pago gerou o PDF, guardou no
Storage e terminou em document_status=failed porque o e-mail era recusado.
Nenhum caminho do produto reprocessa isso: attempt_dispatch exige
document_status='pending' e o reenvio do formulário cai no dup_guard.

Este script assina o mesmo payload que a Edge assinaria e POSTa direto em
/hooks/dispatch, reusando o dispatch_key que já existe. O worker refaz PDF,
Storage (upsert por dispatch_key, mesmo caminho) e envio.

Uso, a partir da raiz, com o venv do pipeline:
    python scripts/redispatch.py CASO_f9145009-...
    python scripts/redispatch.py --all-failed
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent

# Mesma precedência dos quatro runtimes: .env primeiro, .env.local depois, e
# quem vem depois ganha. Ancorada no caminho deste arquivo, não em cwd.
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local", override=True)

SECRET = os.environ.get("PIPELINE_HMAC_SECRET", "")

# NÃO reusar DISPATCH_PIPELINE_URL: no perfil local ele vale
# host.docker.internal, endereço que só faz sentido de DENTRO do container da
# Edge. Este script roda no host.
PIPELINE_URL = os.environ.get("REDISPATCH_PIPELINE_URL", "http://127.0.0.1:8000/hooks/dispatch")


def compact(obj: dict) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def sign(body: str) -> str:
    return hmac.new(SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def build_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios")
    if not SECRET:
        raise SystemExit("PIPELINE_HMAC_SECRET vazio — o pipeline recusaria com 401")
    return create_client(url, key)


def failed_dispatches(supa) -> list[dict]:
    result = (
        supa.table("dispatches")
        .select("case_id,dispatch_key,status")
        .eq("status", "failed")
        .execute()
    )
    return result.data or []


def dispatch_for_case(supa, case_id: str) -> dict:
    result = (
        supa.table("dispatches")
        .select("case_id,dispatch_key,status")
        .eq("case_id", case_id)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise SystemExit(f"nenhum dispatch para {case_id} — o caso nunca foi pago")
    return rows[0]


def case_email(supa, case_id: str) -> str:
    result = (
        supa.table("form_submissions")
        .select("email")
        .eq("case_id", case_id)
        .execute()
    )
    rows = result.data or []
    email = (rows[0].get("email") if rows else "") or ""
    if not email.strip():
        raise SystemExit(f"form_submissions.email vazio para {case_id} — sem destinatário")
    return email.strip().lower()


def redispatch(supa, row: dict) -> bool:
    case_id = row["case_id"]
    body = compact(
        {
            "case_id": case_id,
            "email": case_email(supa, case_id),
            "dispatch_key": str(row["dispatch_key"]),
        }
    )
    response = httpx.post(
        PIPELINE_URL,
        content=body.encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Signature": sign(body)},
        timeout=30.0,
    )
    accepted = response.status_code == 202
    mark = "✓" if accepted else "✗"
    print(f"{mark} {case_id} -> HTTP {response.status_code}")
    if not accepted:
        print(f"   {response.text[:300]}")
    return accepted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case_id", nargs="?", help="caso a reprocessar (CASO_...)")
    parser.add_argument("--all-failed", action="store_true", help="reprocessa todo dispatch em failed")
    args = parser.parse_args()

    if not args.case_id and not args.all_failed:
        parser.error("informe um case_id ou --all-failed")

    supa = build_client()
    rows = failed_dispatches(supa) if args.all_failed else [dispatch_for_case(supa, args.case_id)]

    if not rows:
        print("nenhum dispatch em failed — nada a fazer.")
        return 0

    print(f"reenviando {len(rows)} caso(s) para {PIPELINE_URL}\n")
    accepted = sum(1 for row in rows if redispatch(supa, row))

    print(
        f"\n{accepted}/{len(rows)} aceitos com 202. O 202 é só o aceite: confira o "
        "estado final no banco depois que o worker terminar."
    )
    return 0 if accepted == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Fabricar um caso em `failed` para testar contra**

O teste precisa de um caso realmente falhado. Suba os cinco processos conforme o `CLAUDE.md`, mas com o SMTP apontando para um host inalcançável, para que o envio falhe e o caso termine em `failed`:

1. Em `.env.local`, definir `SMTP_HOST=127.0.0.1` e `MAIL_FROM=teste@exemplo.invalido` (porta 587 fechada ⇒ falha de conexão).
2. Rodar o fluxo até o dispatch (checkout → webhook → `form-submit`), como descrito em `tests/edge-functions/`.
3. Conferir o estado:

```bash
npx supabase db query --local "select f.case_id, f.document_status, d.status, g.status, g.error_detail from form_submissions f join dispatches d using (case_id) join generated_documents g on g.dispatch_key = d.dispatch_key order by f.updated_at desc limit 1;"
```

Esperado: `document_status = failed`, `dispatches.status = failed`, `generated_documents.status = email_failed` com `error_detail` preenchido. Anote o `case_id`.

- [ ] **Step 3: Rodar o script e ver o caso se recuperar**

Devolva `SMTP_HOST` e `MAIL_FROM` ao vazio no `.env.local` (o padrão do perfil local: sem e-mail, `email_skipped`), reinicie o pipeline para ele reler a configuração, e reprocesse:

```bash
python scripts/redispatch.py CASO_...
```

Esperado: `✓ CASO_... -> HTTP 202`. Espere alguns segundos e confira:

```bash
npx supabase db query --local "select f.case_id, f.document_status, d.status, g.status from form_submissions f join dispatches d using (case_id) join generated_documents g on g.dispatch_key = d.dispatch_key where f.case_id = 'CASO_...';"
```

Esperado: `document_status = completed`, `dispatches.status = sent`, `generated_documents.status = email_skipped`. É o mecanismo de recuperação provado sem depender da Task 3.

- [ ] **Step 4: Conferir a guarda de assinatura**

Um script que POSTa payload assinado precisa falhar fechado quando o segredo estiver errado:

```bash
PIPELINE_HMAC_SECRET=errado python scripts/redispatch.py CASO_...
```

Esperado: `✗ CASO_... -> HTTP 401` e código de saída `1`. Se responder 202, a verificação HMAC do `main.py` não está sendo exercitada — investigue antes de seguir.

- [ ] **Step 5: Rodar de novo o mesmo caso, agora já completo**

```bash
python scripts/redispatch.py CASO_...
```

Esperado: `202` de novo (o pipeline aceita), mas o estado no banco **não muda** — o `worker.py` vê `document_status == "completed"` e sai sem refazer trabalho. Confirma que o script é seguro contra execução repetida, inclusive num `--all-failed` disparado duas vezes.

- [ ] **Step 6: Commit**

```bash
git add scripts/redispatch.py
git commit -m "feat(scripts): reprocessa casos presos em failed

Enquanto o e-mail esteve bloqueado, todo caso pago terminou em failed com o
PDF já no Storage — e nenhum caminho do produto reprocessava, porque
attempt_dispatch exige pending e o reenvio do formulário cai no dup_guard.
O script assina o payload da Edge e reusa o dispatch_key existente; o worker
sai sozinho se o caso já estiver completo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017A5JfBk1448b6ospTGuzUy"
```

---

### Task 5: Atualizar a documentação que agora está errada

Duas afirmações do `CLAUDE.md` deixam de valer com a Task 1, e o `PROGRESSO.md` precisa da entrada da sessão — é convenção declarada do repositório.

**Files:**
- Modify: `CLAUDE.md` (seção "Modelo de dados"; seção "Comandos")
- Modify: `PROGRESSO.md` (pendências 14 e 16; nova entrada de sessão)

**Interfaces:**
- Consumes: os resultados verificados das Tasks 1 a 4.
- Produces: nada que outra task consuma.

- [ ] **Step 1: Corrigir o `CLAUDE.md`**

Na seção "Modelo de dados", remover a linha:

```
Requer setup manual no Dashboard: bucket **privado** (`generated-recursos`) + políticas de Storage para a service role.
```

e pôr no lugar:

```
Os dois buckets privados (`generated-recursos` e `evidencias`) e suas políticas de Storage vêm por migration — nada de setup manual no Dashboard. `tests/sql/assert_storage_setup.sql` falha se algum deles sumir.
```

Na seção "Comandos", acrescentar ao bloco do pipeline:

```bash
npx supabase db query --local -f tests/sql/assert_storage_setup.sql  # buckets no lugar?
cd pipeline && python check_email.py                                  # a entrega de e-mail sai?
python scripts/redispatch.py --all-failed                             # reprocessa casos em failed
```

- [ ] **Step 2: Atualizar as pendências no `PROGRESSO.md`**

Riscar a pendência 14 (`~~...~~`) com a nota de que a migration `20260908000000` versiona o bucket e a asserção guarda a regressão. Na 16, registrar o achado de DNS — zona no parking da Hostinger com o registro do domínio em dia até 2027-08-23, confirmado por Google DNS, Cloudflare DNS e RDAP da Verisign — e o desfecho conforme a Task 3 tenha ou não sido concluída. **Se a Task 3 ficou bloqueada esperando o Klaus, diga isso e mantenha a pendência aberta.** Não risque o que não foi verificado.

- [ ] **Step 3: Escrever a entrada da sessão no `PROGRESSO.md`**

Acrescentar ao fim, seguindo o tom das entradas existentes: o que rodou, com que saída, o que ficou de fora e o estado deixado na máquina. Mencionar explicitamente que o `db reset` da Task 1 apagou os casos de teste anteriores, e o que restou no banco.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md PROGRESSO.md
git commit -m "docs: bucket deixa de ser setup manual; registra o DNS por trás da pendência 16

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017A5JfBk1448b6ospTGuzUy"
```

---

## Notas de execução

**A Task 3 depende de uma ação humana e pode não fechar nesta rodada.** Se a zona DNS não voltar, as Tasks 1, 2, 4 e 5 ainda entregam valor completo por conta própria: o bucket para de sumir, existe um comando com veredito, e há um caminho de recuperação pronto para o dia em que a entrega liberar. Nesse caso a pendência 16 permanece aberta no `PROGRESSO.md`, com o diagnóstico de DNS registrado — que é um avanço real sobre "o domínio não está verificado".

**Uma armadilha que atravessa o plano inteiro:** enquanto `.env.local` existir, o perfil ativo é o local, e ele zera `DEEPSEEK_API_KEY` e `SMTP_HOST` de propósito. Para exercitar e-mail, renomeie o arquivo (`.env.local.off`) — editar o `.env` não tem efeito.
