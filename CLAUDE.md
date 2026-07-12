# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Haetae is a **local-only personal console** for managing Claude Code rules/skills and visualizing token usage. Single user, `127.0.0.1` only — no auth, no multi-user, no external hosting. Source of truth for spec / roadmap / decisions is [`docs/`](./docs/README.md); read it before changing behavior.

## Repo layout

The pnpm workspace is **only** `apps/*` (see `pnpm-workspace.yaml`):

- `apps/web/` — Vite + React 19 + TS + Tailwind v4, port `5173` (`haetae-web`)
- `apps/server/` — Fastify 5 + TS + Drizzle/better-sqlite3 + node-pty, port `3001` (`haetae-server`)
- `apps/notebooklm/` — NotebookLM Python sidecar (FastAPI, port `4100`, ADR 0010); not a pnpm member
- `docs/` — single source of truth (architecture, ADRs, phases, workflow)
- `scripts/bootstrap.sh` — fresh-machine setup (requires `mise`)

## Commands

Run from repo root (uses `concurrently` to fan out to filtered packages):

```
pnpm dev         # web (5173 HMR) + server (3001 tsx watch) together
pnpm build       # web only — server runs from source via tsx, no build needed
pnpm start       # NODE_ENV=production; server alone serves web/dist + /api on 3001 (single-origin)
pnpm start:build # build && start
pnpm lint        # tsc --noEmit in both packages (no ESLint configured)
pnpm test        # Vitest in both packages
pnpm clean       # rm -rf apps/web/dist
```

Per-package (filter):

```
pnpm --filter haetae-web <script>
pnpm --filter haetae-server <script>
pnpm --filter haetae-server db:generate   # drizzle-kit migration
pnpm --filter haetae-server db:studio
```

Single test:

```
pnpm --filter haetae-server vitest run src/services/usage/indexer.test.ts
pnpm --filter haetae-web    vitest run src/views/SettingsView.test.tsx -t "name"
```

Dev URL: `http://127.0.0.1:5173` (Vite proxies `/api/*` and `/ws/*` → `:3001`).
Prod URL: `http://127.0.0.1:3001` (server serves both API and `apps/web/dist`).

Node + pnpm versions are pinned in `.tool-versions` (mise/asdf). `pnpm install` triggers `postinstall` → `scripts/fix-node-pty-perms.mjs` and builds `better-sqlite3` / `node-pty` natively (allowlisted in `pnpm-workspace.yaml`).

## Architecture (the big picture)

Data flow is one-directional and the server owns everything sensitive:

```
Page (views/) → useQuery/useMutation → lib/api-client.ts → fetch('/api/...')
  → Vite proxy → Fastify route (routes/*.ts, thin)
  → services/* (business logic)
  → FS (~/.claude) / SQLite (Drizzle) / Anthropic Admin API / PTY (node-pty)
```

**Routes stay thin; logic lives in `apps/server/src/services/`** so the server language could be swapped without rewriting business rules. Major service folders:

- `services/usage/` — JSONL indexer for `~/.claude/projects/*/<sessionId>.jsonl`, pricing, session metadata. Uses incremental cursor (`usage_file_cursor`) to avoid re-parsing. Cost stored as **integer micro-USD** (USD × 1e6) — divide by 1e6 only at the UI boundary; never use floats in SQL.
- `services/usage-api/` — Anthropic Organization Admin API mirror (Phase 5).
- `services/claude-fs/` — whitelisted FS access to `~/.claude/`. All writes go through `backup.ts` (append-only `file_backups` row before overwrite). `guard.ts` enforces path scope; never bypass it.
- `services/pty/` — node-pty manager + cwd guard for the integrated terminal (Phase 3). cwd must be in the project-roots whitelist.
- `services/projects/` — project roots from env seed (`HAETAE_PROJECT_ROOTS`) + DB CRUD (`project_roots`).
- `services/system/` — shells out to `claude auth status --json` and (macOS only) `security find-generic-password` for OAuth → real `5h/7d` limits.

DB: SQLite via Drizzle, WAL + foreign keys on. Schema lives in `apps/server/src/db/schema.ts` — **read the column-level comments**, they encode invariants (e.g. why `cost_usd_micro` is integer, why scope is needed in `file_backups`, why empty-string defaults vs NULL in `usage_api_events`).

Cache DB (`cache.db`) is regenerable from `~/.claude/`; do not treat it as authoritative state worth migrating.

Web: TanStack Router (file-based routes in `apps/web/src/routes/`, generated tree in `routeTree.gen.ts` — don't hand-edit), TanStack Query, Zustand for global state, Monaco editor (locally bundled, no CDN), Recharts, Tailwind v4 via `@tailwindcss/vite`.

## Hard rules — these have bitten us, do not violate

**Server binding & secrets**

- Server binds `127.0.0.1` only. Never `0.0.0.0`.
- Anything secret (`ANTHROPIC_ADMIN_KEY`, etc.) goes in `apps/server/.env.local` only. **Never `VITE_*` prefix for secrets** — Vite inlines those into the client bundle. Verify with `pnpm build && grep -rE 'sk-ant-[A-Za-z0-9_-]{20,}' apps/web/dist/` (must be empty — checks for a real key *value*; the env-var name `ANTHROPIC_ADMIN_KEY` / the `sk-ant-admin-...` placeholder appearing in UI text is fine, not a leak).
- FS access is whitelist-only via `services/claude-fs/guard.ts`. PTY cwd is whitelist-only. No `unlink` — backup or `.bak` instead.

**Style & UI**

- **No emojis anywhere** — UI, docs, code, commit messages. None.
- **No CSS gradients.**
- **No raw color classes** (`bg-black`, `text-gray-500`, `bg-[#fff]`, `text-[#abc123]`). Only the 3-tier design tokens in `apps/web/src/index.css` (primitive → semantic → component). Tailwind utilities like `bg-bg-primary` / `text-text-muted` come from the `@theme` bridge over the semantic CSS vars.
- All number/time/USD/byte formatting goes through `apps/web/src/lib/format/*` — no inline `Intl.NumberFormat`.
- Interactive elements must be `<button>`. No clickable `<div>`. `disabled` ⇒ `aria-disabled` + `cursor-not-allowed` + `text-text-subtle`.
- Page-level inline JSX is forbidden — extract meaningful/repeated units into `views/` (page-shaped) or `components/` (reusable).
- Comments answer "why," not "what." Identifiers carry the "what."

**Pricing**

- `apps/server/src/services/usage/pricing.ts` is **hard-coded** to a stamped date. UI footer surfaces `PRICING: <date>`. If you change rates, update the stamp in the same PR.

**Git / commits**

- Conventional Commits, Korean subject is the house style (see recent `git log`). Body explains the *why* in 1–3 sentences.
- **Never** add `Co-Authored-By: Claude`, "Generated with Claude Code", or any AI attribution line to commits.
- **No emojis in commit messages.**
- Branch naming: `<type>/<issue>-<slug>` (e.g. `feat/142-rolling-window-real-limits`). No direct commits to `main`.
- PR merge is squash; close issues with `Closes #N` in the body.

Pre-merge checklist lives in [`docs/workflow.md`](./docs/workflow.md) — `pnpm lint && pnpm test && pnpm build` all green, dark/light parity, keyboard-only navigability with `focus-visible`, raw-color grep clean, server bound to `127.0.0.1`.

## Optional Claude CLI integration

These features only light up when the `claude` CLI is on `PATH` and the user is logged in:

| Feature | Depends on |
|---|---|
| Sidebar ACCOUNT (subscription tier, email) | `claude auth status --json` |
| Rolling Windows real `5h/7d` limits | macOS Keychain via `security find-generic-password -s 'Claude Code-credentials' -w` (calls undocumented `https://api.anthropic.com/api/oauth/usage`) |

If absent / failing, fall back gracefully to user-defined thresholds — never crash. Schema of the OAuth usage endpoint can change without notice (see the "known limits" section of the README and `docs/research/claude-code-data-sources.md`).

## Where to look first

- New feature scoping → [`docs/requirements.md`](./docs/requirements.md), [`docs/roadmap.md`](./docs/roadmap.md)
- Architecture / data flow → [`docs/architecture.md`](./docs/architecture.md)
- A specific decision (Vite, Fastify, Drizzle, TanStack Router, direct UI…) → [`docs/decisions/`](./docs/decisions/) (numbered ADRs); pending ones in `decisions/pending.md`
- Workflow / commit / PR conventions → [`docs/workflow.md`](./docs/workflow.md)
- Design tokens / formatting / component rules → [`docs/design-system.md`](./docs/design-system.md)
- Phase 3 terminal spec → [`docs/phases/phase-3-terminal.md`](./docs/phases/phase-3-terminal.md)

Update the relevant docs in the same PR when a decision is finalized — there's a 4-place drift check in `docs/workflow.md` (ADR + decisions/README + pending.md + stack.md).
