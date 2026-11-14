#!/usr/bin/env bash
# Réinitialise la base de DÉVELOPPEMENT (supprime toutes les données), migre puis seed.
#   bash scripts/db-reset.sh [--yes]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib-env.sh"; load_env "$ROOT/.env"

if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "Refusé : NODE_ENV=production." >&2; exit 1
fi
NAME="$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$DATABASE_URL")"
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Supprimer TOUTES les données de la base « $NAME » ? Tapez le nom pour confirmer : " ANSWER
  [[ "$ANSWER" == "$NAME" ]] || { echo "Annulé."; exit 1; }
fi
pnpm --filter api exec prisma migrate reset --force --skip-seed
pnpm --filter api db:seed
echo "Base « $NAME » réinitialisée."
