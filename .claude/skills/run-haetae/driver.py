#!/usr/bin/env python3
"""Drive a running Haetae dev server through a real browser.

Run it with the NotebookLM sidecar's venv interpreter — that venv already has
Playwright and its chromium (bootstrap.sh installs them for ADR 0010), so there
is nothing extra to install:

    apps/notebooklm/.venv/bin/python .claude/skills/run-haetae/driver.py check

Commands
    check            smoke the read paths; exits 1 on any failure
    shot <route>     screenshot one route into --out

The point of this file is the things you cannot guess from the source:
the model picker lives behind a tab click, and browser-only breakage (a lying
label, a dead panel) is invisible to `pnpm lint` / `pnpm test`.
"""

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

DEFAULT_BASE = "http://127.0.0.1:5173"
DEFAULT_OUT = Path("/tmp/haetae-shots")


def _note_response(r, errors):
    """Record genuinely broken responses.

    `/api/wiki/*` answers 404 for a project whose brain has not been generated
    yet — that is the documented "wiki not found" path, not a failure, and every
    fresh install has such projects. Flagging it would make `check` red on a
    healthy machine and train the next agent to ignore this section.
    """
    if r.status < 400:
        return
    if r.status == 404 and "/api/wiki/" in r.url:
        return
    errors.append(f"HTTP {r.status} {r.request.method} {r.url}")


def _page(pw, base, errors):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={"width": 1440, "height": 1000})
    # Both matter: React swallows some failures into console.error without
    # ever raising, so listening only for pageerror under-reports.
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    # Chromium's console message for a failed fetch omits the URL, which makes a
    # bare console listener useless for triage ("404" — of what?). Watch responses
    # instead and report method + status + path.
    pg.on("response", lambda r: _note_response(r, errors))
    pg.on(
        "console",
        lambda m: errors.append(f"console.error: {m.text}")
        if m.type == "error" and "Failed to load resource" not in m.text
        else None,
    )
    return br, pg


def _goto(pg, url):
    # networkidle, not load: the dashboard fires a burst of /api calls after
    # first paint and screenshots taken earlier catch empty panels.
    pg.goto(url, wait_until="networkidle", timeout=60_000)
    pg.wait_for_timeout(2_000)


def cmd_shot(args):
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{args.name or args.route.strip('/').replace('/', '-') or 'index'}.png"
    errors: list[str] = []
    with sync_playwright() as pw:
        br, pg = _page(pw, args.base, errors)
        _goto(pg, args.base + args.route)
        pg.screenshot(path=str(dest))
        br.close()
    print(f"saved  {dest}")
    for e in errors:
        print(f"  ! {e}")
    return 0


def cmd_check(args):
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    fails: list[str] = []

    def expect(cond, label):
        print(f"  {'ok  ' if cond else 'FAIL'}  {label}")
        if not cond:
            fails.append(label)

    with sync_playwright() as pw:
        br, pg = _page(pw, args.base, errors)

        print("overview")
        _goto(pg, args.base + "/")
        pg.screenshot(path=str(out / "overview.png"))
        body = pg.inner_text("body")
        expect("HAETAE" in pg.title().upper() or "Haetae" in pg.title(), "title renders")
        # Footer stamps are the cheapest proof the server answered and the
        # build is the one you think it is.
        expect("PRICING:" in body, "footer carries the PRICING stamp")
        expect("-LCL" in body, "sidebar carries the version badge")

        links = pg.eval_on_selector_all(
            "a[href^='/projects/']", "els => els.map(e => e.getAttribute('href'))"
        )
        expect(bool(links), "at least one project is registered")

        if links:
            print(f"project  {links[0]}")
            _goto(pg, args.base + links[0])
            # The model picker is NOT on the default tab. Without this click the
            # page has zero <select> and a check here silently proves nothing.
            tab = pg.query_selector("button:has-text('Wiki')")
            expect(tab is not None, "Wiki tab button exists")
            if tab:
                tab.click()
                pg.wait_for_timeout(2_500)
                pg.screenshot(path=str(out / "project-wiki.png"))
                opts = pg.eval_on_selector_all(
                    "select option", "els => els.map(e => e.value)"
                )
                expect(bool(opts), "model picker rendered")
                # Values are CLI tier aliases since #404. A pinned id here means
                # something reintroduced a hardcoded model.
                pinned = sorted({o for o in opts if o.startswith("claude-")})
                expect(not pinned, f"model values are tier aliases (found pinned: {pinned})")

        br.close()

    expect(not errors, f"no console/page errors ({len(errors)} seen)")
    for e in errors:
        print(f"    ! {e}")

    print(f"\nshots in {out}")
    if fails:
        print(f"FAILED: {len(fails)}")
        return 1
    print("all checks passed")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default=DEFAULT_BASE, help=f"web origin (default {DEFAULT_BASE})")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help=f"screenshot dir (default {DEFAULT_OUT})")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    s = sub.add_parser("shot")
    s.add_argument("route")
    s.add_argument("name", nargs="?")
    args = ap.parse_args()
    return cmd_check(args) if args.cmd == "check" else cmd_shot(args)


if __name__ == "__main__":
    sys.exit(main())
