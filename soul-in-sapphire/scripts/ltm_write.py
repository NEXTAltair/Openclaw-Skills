#!/usr/bin/env python3
"""Write a durable memory entry to Notion LTM DB.

Input (JSON via stdin):
{
  "title": "...",
  "type": "decision|preference|fact|procedure|todo|gotcha",
  "tags": ["..."],
  "content": "...",
  "source": "https://..." (optional),
  "confidence": "high|medium|low" (optional)
}
"""

from __future__ import annotations

import json
import sys

import sys
from pathlib import Path as _Path

# Ensure workspace root is on sys.path when running as a script path.
_ROOT = _Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from notion_http import http_json

from ltm_common import load_config, require_ids


def prop_title(s: str):
    return {"title": [{"type": "text", "text": {"content": s}}]}


def prop_rich_text(s: str):
    return {"rich_text": [{"type": "text", "text": {"content": s}}]}


def prop_select(name: str | None):
    return {"select": None if not name else {"name": name}}


def prop_multi(names):
    names = names or []
    return {"multi_select": [{"name": str(n)} for n in names if str(n).strip()]}


def prop_url(u: str | None):
    return {"url": None if not u else str(u)}


def read_stdin_json():
    raw = sys.stdin.read().strip()
    if not raw:
        raise SystemExit("Expected JSON on stdin")
    return json.loads(raw)


def main():
    cfg = load_config()
    require_ids(cfg)

    obj = read_stdin_json()

    title = (obj.get("title") or "").strip()
    if not title:
        raise SystemExit("Missing title")

    # Notion databases default title property name is usually "Name".
    props = {
        "Name": prop_title(title),
        "Type": prop_select((obj.get("type") or "").strip() or None),
        "Tags": prop_multi(obj.get("tags") or []),
        "Content": prop_rich_text((obj.get("content") or "").strip()),
    }

    if obj.get("source"):
        props["Source"] = prop_url(obj.get("source"))

    if obj.get("confidence"):
        props["Confidence"] = prop_select((obj.get("confidence") or "").strip() or None)

    page = http_json(
        "POST",
        "/pages",
        {"parent": {"database_id": cfg["database_id"]}, "properties": props},
    )

    out = {
        "ok": True,
        "id": page.get("id"),
        "url": page.get("url"),
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
