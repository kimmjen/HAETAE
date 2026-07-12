# haetae-desktop (Tauri)

Native desktop shell for HAETAE. Requires the Rust toolchain (`cargo`).

## v1 (current) — self-starting dev app

One command starts everything: Tauri's `beforeDevCommand` boots the web (Vite
HMR, :5173) + server (:3001) in parallel, waits for the dev URL, then opens the
window. No separate `pnpm start`.

```
pnpm --filter haetae-desktop tauri dev
```

On exit Tauri tears the dev servers down. The window loads `:5173`, whose
`/api` proxies to the server on `:3001`.

## Roadmap

- **v0** ✅ — window loads the separately-run server (shell + toolchain).
- **v1** ✅ — `tauri dev` auto-starts the full stack (beforeDevCommand). This is
  the dev-mode sidecar; the Rust `externalBin` sidecar (spawn from the app
  process) belongs with the bundled app below — in `tauri dev`, Tauri waits for
  the dev URL *before* the Rust app runs, so the server must be started by
  beforeDevCommand, not the app.
- **v2** — bundled standalone `.app`: Rust-side sidecar spawns a bundled Node
  server (ship `node_modules` + the prebuilt native addons better-sqlite3 /
  node-pty as resources; resolve `node` explicitly since GUI apps don't inherit
  the shell PATH). Then `.dmg` + cross-platform keychain (P6.3 goal).

No code signing / notarization for personal self-use (runs unsigned on the
owner's machine) — those are distribution concerns only.
