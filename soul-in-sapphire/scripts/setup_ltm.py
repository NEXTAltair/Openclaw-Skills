#!/usr/bin/env python3
"""Interactive initial setup for soul-in-sapphire Notion LTM + emotion/state DBs.

Creates (or reuses) 4 databases under a given Notion parent page:
- <base>-mem
- <base>-events
- <base>-emotions
- <base>-state

Where <base> defaults to the agent name from workspace IDENTITY.md if available.

This avoids relying on Notion /v1/search (which can be inconsistent).
Instead it discovers child databases directly from the parent page blocks.

Requires:
- NOTION_API_KEY (or NOTION_TOKEN)
- The parent page must be shared with the integration.

Usage:
  python3 skills/soul-in-sapphire/scripts/setup_ltm.py
  python3 skills/soul-in-sapphire/scripts/setup_ltm.py --parent "https://www.notion.so/..." --base "Valentina" --yes
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Ensure workspace root on sys.path
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from notion_http import http_json

CONFIG_PATH_DEFAULT = str(Path("~/.config/soul-in-sapphire/config.json").expanduser())


def _prompt(msg: str, default: str | None = None) -> str:
    if default:
        msg = f"{msg} [{default}]"
    msg += ": "
    s = input(msg).strip()
    return s or (default or "")


def _extract_page_id(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return ""
    m = re.search(r"([0-9a-fA-F]{32})", s)
    if m:
        raw = m.group(1).lower()
        return f"{raw[0:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:32]}"
    m = re.search(r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})", s)
    if m:
        return m.group(1).lower()
    return ""


def _identity_agent_name() -> str | None:
    p = _ROOT / "IDENTITY.md"
    if not p.exists():
        return None
    m = re.search(r"^\s*-\s*\*\*Name:\*\*\s*(.+?)\s*$", p.read_text(encoding="utf-8"), re.M)
    if not m:
        return None
    # strip any parenthetical
    name = m.group(1).strip()
    name = re.sub(r"\s*\(.*?\)\s*$", "", name).strip()
    return name or None


def _list_child_databases(parent_page_id: str) -> dict[str, str]:
    res = http_json("GET", f"/blocks/{parent_page_id}/children?page_size=100")
    out = {}
    for b in (res or {}).get("results") or []:
        if b.get("type") != "child_database":
            continue
        title = b.get("child_database", {}).get("title")
        dbid = b.get("id")
        if title and dbid:
            out[title] = dbid
    return out


def _db_data_source_id(dbid: str) -> str:
    db = http_json("GET", f"/databases/{dbid}")
    ds_id = (db.get("data_sources") or [{}])[0].get("id")
    if not ds_id:
        raise SystemExit(f"Database {dbid} missing data_sources[].id")
    return ds_id


def _create_database(parent_page_id: str, title: str, properties: dict):
    payload = {
        "parent": {"type": "page_id", "page_id": parent_page_id},
        "title": [{"type": "text", "text": {"content": title}}],
        "properties": properties,
    }
    return http_json("POST", "/databases", payload)


def _ensure_schema(ds_id: str, props_patch: dict):
    # data_sources generation: patch schema here
    http_json("PATCH", f"/data_sources/{ds_id}", {"properties": props_patch})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parent", default=None, help="Parent Notion page URL or page_id")
    ap.add_argument("--base", default=None, help="Base name for DBs (default from IDENTITY.md Name)")
    ap.add_argument("--out", default=CONFIG_PATH_DEFAULT, help="Config output path")
    ap.add_argument("--yes", action="store_true", help="Non-interactive (requires --parent)")
    args = ap.parse_args()

    parent = (args.parent or "").strip()
    if not parent:
        if args.yes:
            raise SystemExit("Missing --parent in --yes mode")
        parent = _prompt("Parent page URL or page_id (where to create DBs)")

    parent_page_id = _extract_page_id(parent)
    if not parent_page_id:
        raise SystemExit("Could not parse parent page_id from input. Paste the Notion page URL or the page_id.")

    default_base = _identity_agent_name() or "Valentina"
    base = (args.base or "").strip()
    if not base:
        if args.yes:
            base = default_base
        else:
            base = _prompt("Base name for emotion/state DBs", default_base)

    names = {
        "mem": f"{base}-mem",
        "events": f"{base}-events",
        "emotions": f"{base}-emotions",
        "state": f"{base}-state",
    }

    if not args.yes:
        ans = _prompt(
            f"Create/reuse DBs under page {parent_page_id}? ({', '.join(names.values())}) (y/N)",
            "N",
        )
        if ans.lower() not in ("y", "yes"):
            raise SystemExit("Cancelled")

    existing = _list_child_databases(parent_page_id)

    # Create missing DBs with minimal properties
    created = {}

    def ensure_db(key: str, properties: dict):
        title = names[key]
        if title in existing:
            dbid = existing[title]
            created[key] = {"database_id": dbid, "created": False}
            return dbid
        db = _create_database(parent_page_id, title, properties)
        created[key] = {"database_id": db["id"], "created": True, "url": db.get("url")}
        return db["id"]

    mem_dbid = ensure_db("mem", {"Name": {"title": {}}, "Type": {"select": {"options": []}}, "Tags": {"multi_select": {"options": []}}, "Content": {"rich_text": {}}})

    events_dbid = ensure_db(
        "events",
        {
            "Name": {"title": {}},
            "when": {"date": {}},
            "importance": {"select": {"options": [{"name": str(i)} for i in range(1, 6)]}},
            "trigger": {"select": {"options": [{"name": n} for n in ["progress", "boundary", "ambiguity", "external_action", "manual"]]}},
            "context": {"rich_text": {}},
            "source": {"select": {"options": [{"name": n} for n in ["discord", "cli", "cron", "heartbeat", "other"]]}},
            "link": {"url": {}},
            "uncertainty": {"number": {}},
            "control": {"number": {}},
        },
    )

    emotions_dbid = ensure_db(
        "emotions",
        {
            "Name": {"title": {}},
            "axis": {"select": {"options": [{"name": n} for n in [
                "arousal","valence","focus","confidence","stress","curiosity","social","solitude",
                "joy","anger","sadness","fun","pain"
            ]]}},
            "level": {"number": {}},
            "comment": {"rich_text": {}},
            "weight": {"number": {}},
            "body_signal": {"multi_select": {"options": [{"name": n} for n in ["tension","relief","fatigue","heat","cold"]]}},
            "need": {"select": {"options": [{"name": n} for n in ["safety","progress","recognition","autonomy","rest","novelty"]]}},
            "coping": {"select": {"options": [{"name": n} for n in ["log","ask","pause","act","defer"]]}},
        },
    )

    state_dbid = ensure_db(
        "state",
        {
            "Name": {"title": {}},
            "when": {"date": {}},
            "state_json": {"rich_text": {}},
            "reason": {"rich_text": {}},
            "source": {"select": {"options": [{"name": n} for n in ["event","cron","heartbeat","manual"]]}},
            "mood_label": {"select": {"options": [{"name": n} for n in ["clear","wired","dull","tense","playful","guarded","tender"]]}},
            "intent": {"select": {"options": [{"name": n} for n in ["build","fix","organize","explore","rest","socialize","reflect"]]}},
            "need_stack": {"select": {"options": [{"name": n} for n in ["safety","stability","belonging","esteem","growth"]]}},
            "need_level": {"number": {}},
            "avoid": {"multi_select": {"options": [{"name": n} for n in ["risk","noise","long_tasks","external_actions","ambiguity"]]}},
        },
    )

    # Resolve data_source_ids
    mem_ds = _db_data_source_id(mem_dbid)
    events_ds = _db_data_source_id(events_dbid)
    emotions_ds = _db_data_source_id(emotions_dbid)
    state_ds = _db_data_source_id(state_dbid)

    # Patch relations on data_sources (single_property)
    rel = lambda dbid, dsid: {"relation": {"database_id": dbid, "data_source_id": dsid, "type": "single_property", "single_property": {}}}

    _ensure_schema(events_ds, {
        "emotions": rel(emotions_dbid, emotions_ds)["relation"],
        "state": rel(state_dbid, state_ds)["relation"],
    })
    _ensure_schema(emotions_ds, {
        "event": rel(events_dbid, events_ds)["relation"],
    })
    _ensure_schema(state_ds, {
        "event": rel(events_dbid, events_ds)["relation"],
    })

    cfg = {
        "base": base,
        "parent_page_id": parent_page_id,
        "mem": {"database_id": mem_dbid, "data_source_id": mem_ds},
        "events": {"database_id": events_dbid, "data_source_id": events_ds},
        "emotions": {"database_id": emotions_dbid, "data_source_id": emotions_ds},
        "state": {"database_id": state_dbid, "data_source_id": state_ds},

        # Back-compat flat keys used by scripts
        "valentina_events_database_id": events_dbid,
        "valentina_emotions_database_id": emotions_dbid,
        "valentina_state_database_id": state_dbid,
        "valentina_state_data_source_id": state_ds,
    }

    outp = Path(args.out).expanduser()
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")

    print(json.dumps({"ok": True, "out": str(outp), "created": created, "config": cfg}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
