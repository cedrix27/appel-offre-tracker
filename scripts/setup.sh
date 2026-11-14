#!/usr/bin/env bash
# Installation locale de SRC Digital (macOS + PostgreSQL 17 Homebrew, sans Docker).
#   bash scripts/setup.sh          → vérifie, installe, crée les bases, migre, seed
#   bash scripts/setup.sh --check  → vérifie uniquement les prérequis
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✘\033[0m %s\n' "$1"; MISSING=1; }

MISSING=0
echo "Prérequis :"
if command -v node >/dev/null; then
  NODE_V="$(node -p 'process.versions.node')"
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=11)?0:1)' \
    && ok "Node $NODE_V" || fail "Node >= 22.11 requis (trouvé $NODE_V)"
else fail "Node absent (https://nodejs.org)"; fi
command -v pnpm >/dev/null && ok "pnpm $(pnpm -v)" || fail "pnpm absent (corepack enable)"
PY="$(command -v python3.12 || true)"
[[ -n "$PY" ]] && ok "Python 3.12 ($PY)" || fail "python3.12 absent (pyenv install 3.12)"
command -v psql >/dev/null && ok "psql $(psql --version | awk '{print $3}')" || fail "PostgreSQL absent (brew install postgresql@17)"
command -v pdftotext >/dev/null && ok "pdftotext" || fail "pdftotext absent (brew install poppler)"
if command -v pg_isready >/dev/null && pg_isready -q; then ok "PostgreSQL accepte les connexions"
else fail "PostgreSQL arrêté (brew services start postgresql@17)"; fi

if [[ "$MISSING" -ne 0 ]]; then echo; echo "Corrigez les prérequis ci-dessus puis relancez."; exit 1; fi
$CHECK_ONLY && { echo; echo "Tout est prêt."; exit 0; }

echo; echo "Configuration :"
if [[ ! -f .env ]]; then
  cp .env.example .env
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
  USER_NAME="$(whoami)"
  sed -i '' "s|postgresql://postgres:postgres@localhost|postgresql://$USER_NAME@localhost|g" .env
  ok ".env créé depuis .env.example (JWT_SECRET généré) — complétez SUPER_ADMIN_* si besoin"
else ok ".env existant conservé"; fi

source "$ROOT/scripts/lib-env.sh"; load_env "$ROOT/.env"

echo; echo "Dépendances :"
pnpm install --frozen-lockfile
( cd services/collector && [[ -d .venv ]] || "$PY" -m venv .venv; .venv/bin/pip install -q -e '.[dev]' )
ok "Node et Python installés"

echo; echo "Bases de données :"
db_name() { node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$1"; }
for URL_VAR in DATABASE_URL TEST_DATABASE_URL; do
  URL="${!URL_VAR:-}"
  [[ -z "$URL" ]] && { warn "$URL_VAR non défini"; continue; }
  NAME="$(db_name "$URL")"
  if psql -lqt | cut -d '|' -f1 | grep -qw "$NAME"; then ok "base $NAME existante"
  else createdb "$NAME" && ok "base $NAME créée"; fi
done

pnpm --filter api exec prisma generate >/dev/null
pnpm --filter api exec prisma migrate deploy
pnpm --filter api db:seed
ok "migrations appliquées, seed exécuté"

echo; echo "Installation terminée. Lancez : pnpm dev  (API :4000, web :3000)"
