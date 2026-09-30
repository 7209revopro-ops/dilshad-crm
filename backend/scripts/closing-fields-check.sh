#!/usr/bin/env bash
#
# Stands up a throwaway mongod and checks that a close cannot be made without
# what finance needs from it: the language, how the money was taken, and proof
# that it was. Tears it down after.
#
# Nothing here touches a configured database: the scratch mongod runs on its own
# port with its own data directory under /tmp, and the driver refuses to start
# unless MONGODB_URI names a scratch database.
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${CLOSING_FIELDS_MONGO_PORT:-27085}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/closing-fields-check.XXXXXX")"

cleanup() {
  local code=$?
  mongod --dbpath "$WORK/db" --port "$PORT" --shutdown >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit $code
}
trap cleanup EXIT INT TERM

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Set CLOSINGS_MONGO_PORT." >&2
  exit 1
fi

mkdir -p "$WORK/db" "$WORK/log"
mongod --dbpath "$WORK/db" --port "$PORT" --bind_ip 127.0.0.1 --fork --logpath "$WORK/log/mongod.log" >/dev/null

cd "$REPO"
MONGODB_URI="mongodb://127.0.0.1:$PORT/crm-scratch" bun run scripts/closing-fields-check.ts
