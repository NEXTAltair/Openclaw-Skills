#!/usr/bin/env python3
"""Recall latest Valentina state snapshot from Notion and optionally write a local cache.

Usage:
  python3 skills/soul-in-sapphire/scripts/state_recall.py --limit 1
  python3 skills/soul-in-sapphire/scripts/state_recall.py --write memory/now-state.json

Reads ~/.config/soul-in-sapphire/config.json for state.data_source_id.
Requires NOTION_API_KEY (or NOTION_TOKEN) env as used by notion_http.py.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from emostate_config import load_config
from emostate_notion import query_recent, text_of


def now_iso_local() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def parse_state_json(s: str):
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        return {"_raw": s}


def normalize_state_page(page: dict) -> dict:
    props = (page or {}).get("properties") or {}

    when = text_of(props.get("when"))
    mood_label = text_of(props.get("mood_label"))
    intent = text_of(props.get("intent"))
    need_stack = text_of(props.get("need_stack"))
    need_level = text_of(props.get("need_level"))
    avoid = text_of(props.get("avoid"))
    reason = text_of(props.get("reason"))
    state_json_text = text_of(props.get("state_json"))

    return {
        "page_id": page.get("id"),
        "retrieved_at": now_iso_local(),
        "when": when,
        "mood_label": mood_label,
        "intent": intent,
        "need_stack": need_stack,
        "need_level": need_level,
        "avoid": avoid,
        "reason": reason,
        "state_json": parse_state_json(state_json_text),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--write", type=str, default="")
    args = ap.parse_args()

    cfg = load_config()
    ds_id = (cfg.get("state") or {}).get("data_source_id") or cfg.get("valentina_state_data_source_id")
    if not ds_id:
        raise SystemExit("Missing state.data_source_id in config.json")

    pages = query_recent(ds_id, page_size=max(1, args.limit))
    out = [normalize_state_page(p) for p in pages]

    if args.write:
        p = Path(args.write)
        p.parent.mkdir(parents=True, exist_ok=True)
        payload = out[0] if out else {"retrieved_at": now_iso_local(), "empty": True}
        p.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
