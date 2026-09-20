from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# A configuração vive em TRÊS arquivos na raiz do repositório, não dentro de
# `pipeline/`: `.env` (Supabase na web), `.env.local` (Supabase em Docker) e
# `.env.production`. Ancoramos pelo caminho DESTE arquivo, e não pelo diretório
# de trabalho, porque o uvicorn é iniciado de dentro de `pipeline/`.
REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # A ORDEM NÃO É COSMÉTICA: o pydantic-settings dá prioridade ao ÚLTIMO
        # arquivo da tupla, então `.env.local` sobrescreve `.env` — a mesma regra
        # do Vite e do `server/src/index.ts`. Enquanto `.env.local` existir, o
        # perfil ativo é o local; para testar contra a web, renomeie o arquivo.
        # Foi a divergência dessa regra entre os serviços que já derrubou o
        # dispatch inteiro em 401, silenciosamente.
        env_file=(REPO_ROOT / ".env", REPO_ROOT / ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Must match PIPELINE_HMAC_SECRET on Edge (DISPATCH_PIPELINE_HMAC_SECRET / N8N) and Express API
    pipeline_hmac_secret: str = ""

    # Internal Express API URL (HTTPS in production behind tunnel or deploy)
    express_internal_url: str = "http://127.0.0.1:3001"

    # Supabase Storage (private bucket) — same project as Edge; use service role for upload
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    storage_bucket: str = "generated-recursos"  # override with STORAGE_BUCKET in .env

    # Public URL FastAPI listens on (logging only); bind address is uvicorn CLI
    pipeline_listen_host: str = "0.0.0.0"
    pipeline_listen_port: int = 8000

    # DeepSeek OpenAI-compatible API
    deepseek_api_key: str = ""
    deepseek_api_base: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # Runtime mode: production requires SMTP; development/test may skip email.
    pipeline_env: str = "development"

    # SMTP via Resend. Port 587 uses STARTTLS and matches aiosmtplib start_tls=True.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = "resend"
    smtp_password: str = ""
    mail_from: str = ""
    mail_subject: str = "Seu recurso de multa - Amo Recorrer"


settings = Settings()
