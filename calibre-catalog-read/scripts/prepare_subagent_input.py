#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def chunk_text(s: str, max_chars: int) -> list[str]:
    s = "\n".join([ln for ln in s.splitlines() if ln.strip()])
    if len(s) <= max_chars:
        return [s]
    out = []
    i = 0
    n = len(s)
    while i < n:
        j = min(i + max_chars, n)
        # prefer break at newline/period-ish near boundary
        cut = s.rfind("\n", i, j)
        if cut <= i:
            cut = s.rfind("。", i, j)
        if cut <= i:
            cut = j
        out.append(s[i:cut].strip())
        i = cut
    return [x for x in out if x]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--book-id", type=int, required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--lang", default="ja", choices=["ja", "en"])
    ap.add_argument("--text-path", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--max-chars", type=int, default=20000, help="chars per part (keep well below read-tool 50KB line cap)")
    ns = ap.parse_args()

    text = Path(ns.text_path).read_text(errors="ignore")
    parts = chunk_text(text, ns.max_chars)

    out_dir = Path(ns.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    source_files = []
    for idx, part in enumerate(parts, start=1):
        p = out_dir / f"excerpt_part_{idx:03d}.txt"
        p.write_text(part)
        source_files.append(str(p))

    payload = {
        "book_id": ns.book_id,
        "title": ns.title,
        "lang": ns.lang,
        "source_files": source_files,
        "notes": "Read all source_files in order."
    }
    payload_path = out_dir / "subagent_input.json"
    payload_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))

    print(json.dumps({"ok": True, "payload": str(payload_path), "parts": len(source_files)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
