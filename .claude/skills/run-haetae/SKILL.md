---
name: run-haetae
description: Build, launch, screenshot, and smoke-test the Haetae app (web + Fastify server + NotebookLM sidecar). Use when asked to run Haetae, start the dev server, take a screenshot of a page, or confirm a UI change actually works in the browser rather than only in tests.
---

# Run Haetae

Local-only console for Claude Code. `pnpm dev` fans out to three processes —
web (Vite, `5173`), server (Fastify, `3001`), NotebookLM sidecar (FastAPI,
`4100`). The agent path is `.claude/skills/run-haetae/driver.py`, which drives
a real Chromium against the running web origin.

All paths below are relative to the repo root.

**Why a driver instead of just `pnpm test`:** `pnpm lint` / `pnpm test` /
`pnpm build` were all green while a dropdown label advertised a model tiering
that had been deleted, and while a broken port env var silently pointed the
proxy at a sidecar that was not there. Neither is reachable without opening
the page.

## Prerequisites

Nothing to install for the driver — the NotebookLM sidecar's venv already
carries Playwright and its Chromium (`bootstrap.sh` installs them for ADR 0010).
Use that interpreter:

```bash
apps/notebooklm/.venv/bin/python --version
```

If it is missing, `bash scripts/bootstrap.sh` creates it (needs `mise` + bash).

## Run: agent path

Pick free ports first — `3001` in particular is a common Next.js default and
is frequently taken:

```bash
lsof -nP -i:5173 -i:3001 -sTCP:LISTEN
```

Launch the two packages that the browser needs. `HAETAE_SERVER_PORT` moves the
Fastify server **and** Vite's `/api` + `/ws` proxy targets together, so set the
same value for both processes:

```bash
HAETAE_SERVER_PORT=3021 pnpm --filter haetae-server dev &
HAETAE_SERVER_PORT=3021 pnpm --filter haetae-web dev &
```

Wait until both answer, then drive it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3021/api/usage/local/pricing-info

apps/notebooklm/.venv/bin/python .claude/skills/run-haetae/driver.py check
```

`check` exits non-zero on failure and writes `overview.png` and
`project-wiki.png` to `/tmp/haetae-shots`. **Open the screenshots.** It asserts:
the page renders, the footer `PRICING:` stamp and sidebar version badge are
present, a project is registered, the Wiki tab opens, the model picker renders,
its values are tier aliases (a `claude-*` value means a pinned model id crept
back in), and no unexpected HTTP/page errors occurred.

One route, with the server on a non-default port:

```bash
apps/notebooklm/.venv/bin/python .claude/skills/run-haetae/driver.py \
  --base http://127.0.0.1:5183 --out /tmp/shots shot /watching/local
```

## Run: human path

```bash
pnpm dev          # web 5173 + server 3001 + sidecar 4100, then open 127.0.0.1:5173
```

Only useful with a browser in front of you, and it dies if any of the three
ports is taken.

## Gotchas

- **`pnpm --filter haetae-web dev -- --port 5183` does not work.** The `--` is
  passed to Vite literally and the flag is ignored — Vite silently stays on
  5173. Drop it: `pnpm --filter haetae-web dev --port 5183` (or
  `pnpm --filter haetae-web exec vite --port 5184`).
- **Two Vite servers can share 5173.** `vite.config.ts` pins `port: 5173` with
  `strictPort: true`, so a clash should be fatal — but Haetae binds
  `127.0.0.1` (IPv4) while some tools bind `[::1]` (IPv6). `lsof` showing 5173
  busy does not mean Haetae cannot start; check the address family, and confirm
  with `curl http://127.0.0.1:5173/ | grep '<title>'`.
- **The model picker is not on the project page's default tab.** It lives under
  the Wiki tab. Query `select option` before clicking `button:has-text('Wiki')`
  and you get an empty list — a check written that way passes while proving
  nothing.
- **`/api/wiki/*` returning 404 is normal.** It is the documented "wiki not
  found" response for a project whose brain has not been generated. Every fresh
  install has such projects; the driver filters these and flags everything else.
- **Screenshot after `networkidle` plus a beat.** The dashboard fires a burst of
  `/api` calls after first paint; earlier captures show empty panels.
- **Generating a brain spends real Claude quota.** `BUILD BRAIN` / `GENERATE`
  shell out to `claude --print` against the user's own subscription. Do not
  click them to "verify the app works" — the read paths above are free.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Server exits immediately, `EADDRINUSE` on 3001 | Another dev server owns it. `HAETAE_SERVER_PORT=3021` on **both** processes. |
| Page loads but every panel is empty / `/api` calls fail | Web and server disagree on the port. The web process needs the same `HAETAE_SERVER_PORT` as the server — it feeds Vite's proxy target. |
| `driver.py` fails with `ModuleNotFoundError: playwright` | Wrong interpreter. Use `apps/notebooklm/.venv/bin/python`, not the system one. |
| Sidecar unreachable at a moved `HAETAE_NOTEBOOKLM_PORT` | Fixed for `pnpm dev`; if a stale checkout hardcodes `--port 4100` in `apps/notebooklm/package.json`, it will ignore the env var. |
| Costs on screen look wrong after a `pricing.ts` edit | Cost is frozen at index time and never recomputed. Run `pnpm --filter haetae-server reprice` (dry run) then `-- --apply`. |
