#!/usr/bin/env bash
# Run both local development servers; Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT/backend/.venv/bin/python"
BACKEND_PID=""
FRONTEND_PID=""

if [[ ! -x "$PYTHON" ]]; then
  echo "Backend environment missing. Follow backend setup in $ROOT/README.md" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || [[ ! -f "$ROOT/frontend/node_modules/vite/bin/vite.js" ]]; then
  echo "Node/Vite missing. Install Node, then run npm ci inside $ROOT/frontend." >&2
  exit 1
fi

"$PYTHON" - <<'PY'
import socket
import sys
for port in (8000, 5173):
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            sys.exit(f"Port {port} is occupied. Stop your existing server before running this launcher.")
print("Dependencies found; ports 8000 and 5173 are available.")
PY

if [[ "${1:-}" == "--check" ]]; then
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "Usage: bash scripts/dev.sh [--check]" >&2
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  for pid in "$FRONTEND_PID" "$BACKEND_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$FRONTEND_PID" "$BACKEND_PID"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Startup performs idempotent migration/seed; it never resets demo progress.
(
  cd "$ROOT/backend"
  exec "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
BACKEND_PID=$!

# Execute Vite directly so this launcher owns the server PID, not an npm wrapper.
(
  cd "$ROOT/frontend"
  exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
) &
FRONTEND_PID=$!

"$PYTHON" - <<'PY'
import json
import time
from urllib.request import urlopen

for url in ("http://127.0.0.1:8000/health", "http://127.0.0.1:5173/health", "http://127.0.0.1:5173/"):
    deadline = time.monotonic() + 20
    while True:
        try:
            with urlopen(url, timeout=2) as response:
                data = response.read()
                if url.endswith("/health"):
                    assert json.loads(data)["status"] == "ok"
                else:
                    assert b'id="root"' in data
            break
        except (OSError, ValueError, AssertionError):
            if time.monotonic() >= deadline:
                raise SystemExit(f"Startup failed: {url}. Check the server output above.")
            time.sleep(0.25)
print("\nBoth servers are connected and ready.")
print("Frontend: http://127.0.0.1:5173")
print("Backend:  http://127.0.0.1:8000")
print("API docs: http://127.0.0.1:8000/docs")
print("Keep this terminal open. Press Ctrl+C to stop both servers.\n")
PY

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
echo "A server stopped; shutting down the other. Check the output above." >&2
exit 1
