from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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

    # SMTP (leave host empty to skip sending — still completes pipeline for testing)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    mail_from: str = ""
    mail_subject: str = "Seu recurso de multa — Amo Recorrer"


settings = Settings()
