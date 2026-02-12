#!/usr/bin/env python3
"""Bootstrap ~/.config/soul-in-sapphire/config.json by discovering Notion IDs.

- Finds a data source (Notion database) by name via POST /v1/search
- Reads data_source_id and fetches database_id via GET /v1/data_sources/{id}

Usage:
  python3 bootstrap_config.py --name "OpenClaw LTM" [--out ~/.config/soul-in-sapphire/config.json]
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

# Reuse the workspace Notion helper
import sys
from pathlib import Path as _Path

# Ensure workspace root is on sys.path when running as a script path.
_ROOT = _Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from notion_http import http_json


def plain_title(obj) -> str:
    parts = obj.get("title") or []
    return "".join(p.get("plain_text", "") for p in parts).strip()


def resolve_one_data_source_and_database(name: str):
    """Resolve both ids:

    - data_source_id: for /v1/data_sources/{id}/query
    - database_id: for /v1/pages parent.database_id and /v1/databases

    Notion search is fuzzy; require exact title matches to avoid false positives.
    """

    res = http_json("POST", "/search", {"query": name, "page_size": 50})
    results = (res or {}).get("results") or []

    ds_exact = [r for r in results if r.get("object") == "data_source" and plain_title(r) == name]
    db_exact = [r for r in results if r.get("object") == "database" and plain_title(r) == name]

    if len(ds_exact) > 1:
        lines = "\n".join(
            f"- {plain_title(r)} (data_source_id={r.get('id')})" for r in ds_exact[:10]
        )
        raise SystemExit(f"Multiple exact data_source matches for: {name}\n{lines}")
    if len(db_exact) > 1:
        lines = "\n".join(
            f"- {plain_title(r)} (database_id={r.get('id')})" for r in db_exact[:10]
        )
        raise SystemExit(f"Multiple exact database matches for: {name}\n{lines}")

    if not ds_exact or not db_exact:
        raise SystemExit(
            f"Notion database/data_source not found by exact title via search: {name}\n"
            "- Ensure the database is shared with your integration (Connect to).\n"
            "- Ensure the title matches exactly."
        )

    return {"ltm_db_name": name, "data_source_id": ds_exact[0]["id"], "database_id": db_exact[0]["id"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True, help="Notion database name to use as LTM")
    ap.add_argument(
        "--out",
        default=str(Path("~/.config/soul-in-sapphire/config.json").expanduser()),
        help="Output config path",
    )
    args = ap.parse_args()

    cfg = resolve_one_data_source_and_database(args.name)

    outp = Path(args.out).expanduser()
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"ok": True, "out": str(outp), "config": cfg}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
