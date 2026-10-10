#!/usr/bin/env bash
#
# Stands up a throwaway mongod and checks correcting an enrolment finance sent back. Tears it down after.
#
# Nothing here touches a configured database or a real finance: the scratch
# mongod runs on its own port with its own data directory, bun is told not to
# read .env, finance is a stand-in the check starts itself, and the check
# refuses to start unless MONGODB_URI names a scratch database.
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${CORRECTION_MONGO_PORT:-27093}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/enrolment-correction-check.XXXXXX")"

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
  echo "Port $PORT is already in use. Set CORRECTION_MONGO_PORT." >&2
  exit 1
fi

mkdir -p "$WORK/db" "$WORK/log"
mongod --dbpath "$WORK/db" --port "$PORT" --bind_ip 127.0.0.1 --fork --logpath "$WORK/log/mongod.log" --pidfilepath "$WORK/mongod.pid" >/dev/null

cd "$REPO"
MONGODB_URI="mongodb://127.0.0.1:$PORT/crm-scratch" DOTENV_CONFIG_PATH=/nonexistent \
  bun --no-env-file run scripts/enrolment-correction-check.ts
