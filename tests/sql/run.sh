#!/usr/bin/env bash
# Roda os testes de SQL num Postgres TEMPORÁRIO (nunca toca em nenhum banco seu).
# Precisa de initdb/pg_ctl/psql: defina PG_BIN=/caminho/bin ou deixe a busca automática (Postgres 12+).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
if [ -z "${PG_BIN:-}" ]; then
  if command -v initdb >/dev/null 2>&1; then PG_BIN="$(dirname "$(command -v initdb)")"
  else PG_BIN="$(ls -d /Library/PostgreSQL/*/bin /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql*/bin 2>/dev/null | sort -V | tail -1 || true)"; fi
fi
if [ -z "${PG_BIN:-}" ] || [ ! -x "$PG_BIN/initdb" ]; then echo "SQL: Postgres não encontrado (defina PG_BIN). Pulando." >&2; exit 2; fi
export PATH="$PG_BIN:$PATH"
DATA="$(mktemp -d)"; SOCK="$(mktemp -d /tmp/azpgXXXX)"; PORT=$((54000 + RANDOM % 900))
cleanup() { pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"; }
trap cleanup EXIT
initdb -D "$DATA" -U tester --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK" -l "$DATA/log" -w start >/dev/null
P() { psql -h "$SOCK" -p "$PORT" -U tester -v ON_ERROR_STOP=1 -q -At "$@"; }
P -d postgres -c "create database az" >/dev/null
P -d az -f "$HERE/stub_auth.sql" >/dev/null
for n in 1 2; do
  if P -d az -f "$ROOT/supabase/schema.sql" 2>&1 | grep -i "error"; then echo "FALHOU: schema.sql com erro (rodada $n)"; exit 1; fi
done
echo "schema.sql: roda 2x sem erro"
for f in record_match_elo friends_elo rate_limit leaderboard; do P -d az -f "$HERE/$f.sql" | tail -1; done
