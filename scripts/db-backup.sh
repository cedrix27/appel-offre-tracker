#!/usr/bin/env bash
# Sauvegarde la base (DATABASE_URL) au format pg_dump custom dans backups/.
#   bash scripts/db-backup.sh  → backups/<base>-AAAAMMJJ-HHMMSS.dump
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib-env.sh"; load_env "$ROOT/.env"

# pg_dump ne comprend pas le paramètre Prisma ?schema=
URL="${DATABASE_URL%%\?*}"
NAME="$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$URL")"
mkdir -p backups
FILE="backups/${NAME}-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --file="$FILE" "$URL"
chmod 600 "$FILE"
echo "Sauvegarde : $FILE ($(du -h "$FILE" | cut -f1))"
