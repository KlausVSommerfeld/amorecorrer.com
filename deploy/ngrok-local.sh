#!/usr/bin/env bash
# Compose do modo local com ngrok (ver docker-compose.ngrok.yml). Exemplos:
#   bash deploy/ngrok-local.sh up -d --build express pipeline ngrok
#   bash deploy/ngrok-local.sh logs -f ngrok
#   bash deploy/ngrok-local.sh down
# O --env-file só serve à interpolação das variáveis do ngrok; express e pipeline
# recebem o .env da raiz pelo env_file.
cd "$(dirname "$0")" || exit 1
exec docker compose --env-file ../.env -f docker-compose.yml -f docker-compose.ngrok.yml "$@"
