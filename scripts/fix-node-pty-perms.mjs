#!/usr/bin/env node
// node-pty's prebuilt `spawn-helper` ships in the tarball without the
// executable bit on some pnpm/npm installs, which makes `posix_spawnp`
// fail at runtime ("pty spawn failed"). Re-apply +x after install.
//
// Why a manual walker instead of `node:fs/promises.glob`:
// `**` in Node's built-in glob skips dot-prefixed directories by default,
// so on pnpm machines (where every package lives under `node_modules/.pnpm/`)
// the previous glob pattern silently matched nothing — the script ran on
// every install but never chmod'd anything. We walk by hand to be explicit.
import { chmodSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function* findNodePtyDirs(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name === "node-pty") {
      yield full;
      continue;
    }
    yield* findNodePtyDirs(full);
  }
}

let fixed = 0;
for (const ptyDir of findNodePtyDirs("node_modules")) {
  const prebuilds = join(ptyDir, "prebuilds");
  let platforms;
  try {
    platforms = readdirSync(prebuilds, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const platform of platforms) {
    if (!platform.isDirectory()) continue;
    const helper = join(prebuilds, platform.name, "spawn-helper");
    try {
      const mode = statSync(helper).mode;
      if ((mode & 0o111) === 0o111) continue;
      chmodSync(helper, mode | 0o755);
      fixed += 1;
    } catch {
      // missing on this platform, or removed mid-scan — skip
    }
  }
}

if (fixed > 0) {
  console.log(
    `[fix-node-pty-perms] chmod +x on ${fixed} spawn-helper binar${fixed === 1 ? "y" : "ies"}`,
  );
}
