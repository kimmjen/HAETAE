#!/usr/bin/env bash
# Bootstrap the Haetae development environment on a fresh machine.
# Idempotent — safe to re-run.
set -euo pipefail

# Anchor to repo root regardless of caller's cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v mise >/dev/null 2>&1; then
  cat <<'MSG' >&2
mise is required but not installed.

Install:
  curl https://mise.run | sh

Then add the activation snippet for your shell (printed by the installer)
and re-run:
  bash scripts/bootstrap.sh
MSG
  exit 1
fi

echo "==> installing pinned Node + pnpm versions from .tool-versions"
mise install

echo "==> installing workspace dependencies"
mise exec -- pnpm install

echo "==> setting up apps/notebooklm Python venv (ADR 0010)"
mise exec -- python -m venv apps/notebooklm/.venv
apps/notebooklm/.venv/bin/pip install --quiet --upgrade pip
apps/notebooklm/.venv/bin/pip install --quiet -e "apps/notebooklm[dev]"
# NotebookLM browser auth (`notebooklm login`) needs the Playwright chromium
# binary — the [browser] extra installs the python pkg, this fetches the browser.
apps/notebooklm/.venv/bin/playwright install chromium

cat <<'MSG'

Bootstrap complete.

Next:
  pnpm dev      # web :5173, server :3001, notebooklm (FastAPI) :4100

Optional:
  cp apps/server/.env.example apps/server/.env.local   # for Phase 5 Admin API
MSG
