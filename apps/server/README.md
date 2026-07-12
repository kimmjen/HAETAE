# Haetae Server

Local-only backend for Haetae. Binds to `127.0.0.1:3001`. Owns all file-system, SQLite, and Anthropic Admin API access — secrets never reach the web bundle.

## Develop

From the repo root:

```bash
pnpm dev
```

Or this package only:

```bash
pnpm --filter haetae-server dev
```

## Routes (current — mock)

- `GET /api/rules/list` — mock `~/.claude/` tree
- `GET /api/usage/local` — mock daily/project token data

Real implementations land in Phase 1 (`services/claude-fs.ts`) and Phase 4 (`services/jsonl-parser.ts`).
