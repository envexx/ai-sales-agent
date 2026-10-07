#!/usr/bin/env python
"""
camoufox_fetch.py — ambil satu halaman memakai browser stealth Camoufox.

Dipakai oleh adapter Node `src/integrations/camoufox.ts` sebagai engine
ingestion kedua (setelah Firecrawl). Mencetak SATU objek JSON ke stdout:

    {"url": ..., "title": ..., "text": ..., "html": ..., "screenshotPath": ...}

Semua log/error ditulis ke stderr agar stdout tetap JSON murni.
"""

from __future__ import annotations

import argparse
import json
import os
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch a page with Camoufox")
    parser.add_argument("url", help="URL to fetch")
    parser.add_argument("--timeout", type=int, default=45000, help="Navigation timeout in ms")
    parser.add_argument("--wait", type=int, default=2500, help="Extra wait (ms) for JS to settle")
    parser.add_argument("--screenshot-dir", default=None, help="Directory to save a screenshot")
    parser.add_argument("--screenshot-name", default=None, help="Screenshot file name")
    parser.add_argument("--headless", action="store_true", default=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # Pastikan stdout UTF-8 (Windows default bisa cp1252).
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover - older Python
        pass

    try:
        from camoufox.sync_api import Camoufox
    except Exception as exc:  # noqa: BLE001
        print(f"camoufox import failed: {exc}", file=sys.stderr)
        return 2

    screenshot_path = None
    try:
        with Camoufox(headless=args.headless, humanize=False) as browser:
            page = browser.new_page()
            page.goto(args.url, wait_until="domcontentloaded", timeout=args.timeout)
            page.wait_for_timeout(args.wait)

            title = ""
            html = ""
            text = ""
            try:
                title = page.title() or ""
            except Exception:  # noqa: BLE001
                pass
            try:
                html = page.content() or ""
            except Exception:  # noqa: BLE001
                pass
            try:
                text = page.inner_text("body") or ""
            except Exception:  # noqa: BLE001
                pass

            if args.screenshot_dir:
                os.makedirs(args.screenshot_dir, exist_ok=True)
                name = args.screenshot_name or "screenshot.png"
                target = os.path.join(args.screenshot_dir, name)
                try:
                    page.screenshot(path=target, full_page=False)
                    screenshot_path = target
                except Exception as exc:  # noqa: BLE001
                    print(f"screenshot failed: {exc}", file=sys.stderr)

        print(
            json.dumps(
                {
                    "url": args.url,
                    "title": title.strip(),
                    "text": text,
                    "html": html,
                    "screenshotPath": screenshot_path,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"camoufox fetch failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
