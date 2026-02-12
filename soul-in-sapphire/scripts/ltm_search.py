#!/usr/bin/env python3
"""Search Notion LTM DB by title/content contains.

This uses /v1/data_sources/{id}/query filters (data_sources generation).

Usage:
  python3 ltm_search.py --query "data_sources" --limit 5
"""

from __future__ import annotations

import argparse
import json

import sys
from pathlib import Path as _Path

# Ensure workspace root is on sys.path when running as a script path.
_ROOT = _Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from notion_http import http_json

from ltm_common import load_config, require_ids


def text_of(prop) -> str:
    if not prop:
        return ""
    t = prop.get("type")
    if t in ("title", "rich_text"):
        arr = prop.get(t) or []
        return "".join(x.get("plain_text", "") for x in arr).strip()
    if t == "select":
        s = prop.get("select")
        return (s or {}).get("name") or ""
    if t == "multi_select":
        ms = prop.get("multi_select") or []
        return ",".join(x.get("name", "") for x in ms if x.get("name"))
    if t == "url":
        return prop.get("url") or ""
    return ""


def query_ds(ds_id: str, prop: str, kind: str, q: str, page_size: int):
    body = {
        "page_size": page_size,
        "filter": {"property": prop, kind: {"contains": q}},
    }
    res = http_json("POST", f"/data_sources/{ds_id}/query", body)
    return (res or {}).get("results") or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()

    cfg = load_config()
    require_ids(cfg)

    q = args.query.strip()
    if not q:
        raise SystemExit("Empty query")

    ds_id = cfg["data_source_id"]

    hits = []
    hits += query_ds(ds_id, "Name", "title", q, min(50, max(args.limit, 5) * 5))
    hits += query_ds(ds_id, "Content", "rich_text", q, min(50, max(args.limit, 5) * 5))

    seen = set()
    out = []
    for r in hits:
        rid = r.get("id")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        props = r.get("properties") or {}
        out.append(
            {
                "id": rid,
                "url": r.get("url"),
                "title": text_of(props.get("Name")),
                "type": text_of(props.get("Type")),
                "tags": text_of(props.get("Tags")),
                "content": text_of(props.get("Content"))[:400],
                "source": text_of(props.get("Source")),
                "confidence": text_of(props.get("Confidence")),
            }
        )
        if len(out) >= args.limit:
            break

    print(json.dumps({"ok": True, "query": q, "results": out}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
