#!/usr/bin/env bash
# Restaure une sauvegarde pg_dump dans la base DATABASE_URL (remplace les données existantes).
#   bash scripts/db-restore.sh backups/<fichier>.dump [--yes]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FILE="${1:-}"
[[ -f "$FILE" ]] || { echo "Usage : pnpm db:restore backups/<fichier>.dump" >&2; exit 1; }
source "$ROOT/scripts/lib-env.sh"; load_env "$ROOT/.env"

URL="${DATABASE_URL%%\?*}"
NAME="$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$URL")"
if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "Remplacer les données de « $NAME » par $FILE ? Tapez le nom de la base : " ANSWER
  [[ "$ANSWER" == "$NAME" ]] || { echo "Annulé."; exit 1; }
fi
pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$URL" "$FILE"
echo "Base « $NAME » restaurée depuis $FILE."
