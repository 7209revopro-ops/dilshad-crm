#!/usr/bin/env bash
#
# Stands up a throwaway mongod and checks that a close cannot be made without
# what finance needs from it: the client's email — the client's own, not one
# another client here holds — the language, how the money was taken, and proof
# that it was; and the read-only report of shared emails. Tears it down after.
#
# Nothing here touches a configured database or a real finance: the scratch
# mongod runs on its own port with its own data directory under /tmp, bun is
# told not to read .env — which names the live database and finance, and a
# close queues an enrolment for finance the moment it is saved — and the driver
# refuses to start unless MONGODB_URI names a scratch database.
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${CLOSING_FIELDS_MONGO_PORT:-27085}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/closing-fields-check.XXXXXX")"

cleanup() {
  local code=$?
  # Only the mongod this started, by the pid it wrote — never whatever else
  # holds the port (another check's, say, when this one found it taken).
  # mongod --shutdown is Linux only.
  if [ -f "$WORK/mongod.pid" ]; then
    local pid
    pid="$(cat "$WORK/mongod.pid")"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
  fi
  rm -rf "$WORK"
  exit $code
}
trap cleanup EXIT INT TERM

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Set CLOSING_FIELDS_MONGO_PORT." >&2
  exit 1
fi

mkdir -p "$WORK/db" "$WORK/log"
mongod --dbpath "$WORK/db" --port "$PORT" --bind_ip 127.0.0.1 --fork --logpath "$WORK/log/mongod.log" --pidfilepath "$WORK/mongod.pid" >/dev/null

cd "$REPO"
MONGODB_URI="mongodb://127.0.0.1:$PORT/crm-scratch" DOTENV_CONFIG_PATH=/nonexistent \
  JWT_SECRET=closing-fields-check-jwt JWT_REFRESH_SECRET=closing-fields-check-refresh \
  bun --no-env-file run scripts/closing-fields-check.ts
