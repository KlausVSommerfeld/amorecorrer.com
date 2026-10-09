#!/usr/bin/env bash
# Duas reservas simultâneas do mesmo caso: só uma pode receber a chave.
# Spec 2026-10-09 (entrega única), §6. O pgTAP roda numa sessão só e não prova
# isto. Roda contra o banco LOCAL e apaga o que criou, mesmo se falhar:
#
#   bash supabase/tests/entrega_concorrencia.sh
set -euo pipefail

DB="${DB_CONTAINER:-$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)}"
CASO="CASO_cccccccc-0000-4000-8000-000000000001"
SAIDA="$(mktemp -d)"

psql_() { docker exec -i "$DB" psql -U postgres -d postgres -Xqt -v ON_ERROR_STOP=1 "$@"; }

limpar() {
  psql_ -c "DELETE FROM dispatches WHERE case_id = '$CASO'" >/dev/null
  psql_ -c "DELETE FROM form_submissions WHERE case_id = '$CASO'" >/dev/null
  psql_ -c "DELETE FROM stripe_sessions WHERE case_id = '$CASO'" >/dev/null
}
trap 'limpar; rm -rf "$SAIDA"' EXIT
limpar

psql_ -c "INSERT INTO stripe_sessions (id, case_id, payment_status) VALUES ('cs_concorrencia', '$CASO', 'paid')" >/dev/null
psql_ -c "INSERT INTO form_submissions (case_id, form_token, nome, email, document_status)
          VALUES ('$CASO', 'tok', 'Teste', 'teste@exemplo.com', 'pending')" >/dev/null

# A primeira sessão reserva e segura a transação por 2 s; a segunda chega no meio.
psql_ -f - > "$SAIDA/a" 2>&1 <<SQL &
BEGIN;
SELECT dispatch_key FROM reservar_entrega('$CASO');
SELECT pg_sleep(2);
COMMIT;
SQL
sleep 0.5
psql_ -f - > "$SAIDA/b" 2>&1 <<SQL &
SELECT dispatch_key FROM reservar_entrega('$CASO');
SQL
wait

A=$(grep -cE '^ *[0-9a-f]{8}-[0-9a-f]{4}-' "$SAIDA/a" || true)
B=$(grep -cE '^ *[0-9a-f]{8}-[0-9a-f]{4}-' "$SAIDA/b" || true)
echo "sessao A: $A chave(s); sessao B: $B chave(s)"
if [ "$A" = "1" ] && [ "$B" = "0" ]; then
  echo "ok - so uma reserva recebeu a chave"
else
  echo "not ok - esperado A=1 e B=0"; cat "$SAIDA/a" "$SAIDA/b"; exit 1
fi
