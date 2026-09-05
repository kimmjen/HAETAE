#!/usr/bin/env bash
# HAETAE Claude Code SessionEnd hook.
#
# Ties second-brain freshness to actual work: when a Claude Code session ends,
# fold that project's new messages into its wiki (+ cascade notes/ontology/eval)
# so the NEXT session starts current — no always-on server needed.
#
# SessionEnd cannot block (~1.5s budget) and the fold is a slow LLM call, so we
# read the session cwd from stdin, spawn a DETACHED background fold, and exit 0
# immediately. The fold itself is guarded (min new messages + cooldown + a
# single global lock) in src/brain-update.ts, so trivial sessions cost nothing.
#
# Deliberately NOT `set -e`: a hook that aborts non-zero just spams the session
# transcript with errors (SessionEnd ignores the exit code anyway). Every step
# is guarded so we always reach `exit 0`, and the fold is best-effort.

input="$(cat 2>/dev/null || true)"

# Need node to parse the stdin JSON and pnpm to run the fold. If either is
# missing from the hook's PATH, do nothing rather than error out.
command -v node >/dev/null 2>&1 || exit 0
command -v pnpm >/dev/null 2>&1 || exit 0

cwd="$(printf '%s' "$input" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).cwd||""))}catch{process.stdout.write("")}})' 2>/dev/null || true)"
[ -z "${cwd:-}" ] && exit 0

# Repo root = three levels up from this script (apps/server/scripts → repo root).
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." 2>/dev/null && pwd)" || exit 0
[ -z "${repo_root:-}" ] && exit 0

HAETAE_FOLD_CWD="$cwd" nohup pnpm -C "$repo_root" --filter haetae-server -s update-brain >/dev/null 2>&1 &

exit 0
