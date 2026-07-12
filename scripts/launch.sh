#!/usr/bin/env bash
# Launch Haetae in dev or production-build mode.
#
# Usage:
#   bash scripts/launch.sh           # dev (Vite HMR + tsx watch)
#   bash scripts/launch.sh --prod    # build then run dist + vite preview
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="dev"
case "${1:-}" in
  --prod|-p|prod)
    MODE="prod"
    ;;
  ""|--dev|-d|dev)
    MODE="dev"
    ;;
  *)
    echo "Unknown mode: $1" >&2
    echo "Usage: bash scripts/launch.sh [--dev | --prod]" >&2
    exit 64
    ;;
esac

if [ "$MODE" = "prod" ]; then
  echo "==> building both packages"
  pnpm build
  echo "==> starting from build output (web preview + node dist)"
  exec pnpm start
fi

echo "==> starting dev (web HMR + server tsx watch)"
exec pnpm dev
