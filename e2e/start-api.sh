#!/usr/bin/env bash
# Démarre l'API pour Playwright sur la base de TEST (vidée), avec le faux collecteur et les e-mails « log ».
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib-env.sh"; load_env "$ROOT/.env"

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL est requis}"
[[ "$TEST_DATABASE_URL" == *test* ]] || { echo "TEST_DATABASE_URL doit désigner une base de test" >&2; exit 1; }

export DATABASE_URL="$TEST_DATABASE_URL"
export NODE_ENV=test
export API_PORT="${E2E_API_PORT:-4100}"
export WEB_APP_URL="http://localhost:${E2E_WEB_PORT:-3100}"
export EMAIL_PROVIDER=log
export COOKIE_SECURE=false
export PIPELINE_CRON_ENABLED=false
export GLOBAL_RATE_LIMIT=100000
export AUTH_RATE_LIMIT=100000
export COLLECTOR_COMMAND="node \"$ROOT/apps/api/test/fixtures/fake-collector.js\""
export COLLECTOR_FAKE_MODE=success
export SUPER_ADMIN_EMAIL=superadmin@e2e.test
export SUPER_ADMIN_PASSWORD=MotDePasse-Admin-E2E-2026

cd apps/api
./node_modules/.bin/prisma migrate deploy >/dev/null
PSQL_URL="${DATABASE_URL%%\?*}"
TABLES="$(psql "$PSQL_URL" -tAc "SELECT string_agg(format('%I', tablename), ', ') FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'")"
[[ -n "$TABLES" ]] && psql "$PSQL_URL" -q -c "TRUNCATE TABLE $TABLES RESTART IDENTITY CASCADE"
./node_modules/.bin/ts-node --transpile-only prisma/seed.ts
[[ -f dist/main.js ]] || ./node_modules/.bin/nest build
exec node dist/main.js
