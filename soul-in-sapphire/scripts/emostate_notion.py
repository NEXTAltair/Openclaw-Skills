#!/usr/bin/env python3
"""Notion helpers for Valentina emotion-state system (data_sources generation)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure workspace root on sys.path
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from notion_http import http_json


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _rt(s: str):
    s = str(s)
    if not s:
        return {"rich_text": []}
    return {"rich_text": [{"type": "text", "text": {"content": s}}]}


def _title(s: str):
    return {"title": [{"type": "text", "text": {"content": str(s)}}]}


def _select(name: str | None):
    return {"select": None if not name else {"name": str(name)}}


def _multi(names):
    names = names or []
    return {"multi_select": [{"name": str(n)} for n in names if str(n).strip()]}


def _date(start_iso: str | None):
    return {"date": None if not start_iso else {"start": start_iso}}


def _num(x):
    if x is None or x == "":
        return {"number": None}
    return {"number": float(x)}


def _url(u: str | None):
    return {"url": None if not u else str(u)}


def clamp_0_10(x: float) -> float:
    if x < 0:
        return 0.0
    if x > 10:
        return 10.0
    return x


def query_recent(ds_id: str, page_size: int = 10):
    # Notion's query supports sorts; use created_time
    body = {"page_size": page_size, "sorts": [{"timestamp": "created_time", "direction": "descending"}]}
    res = http_json("POST", f"/data_sources/{ds_id}/query", body)
    return (res or {}).get("results") or []


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
        return [x.get("name") for x in ms if x.get("name")]
    if t == "number":
        return prop.get("number")
    if t == "date":
        d = prop.get("date")
        return (d or {}).get("start") or ""
    if t == "url":
        return prop.get("url") or ""
    if t == "relation":
        rel = prop.get("relation") or []
        return [x.get("id") for x in rel if x.get("id")]
    return ""


def create_page(database_id: str, properties: dict):
    return http_json("POST", "/pages", {"parent": {"database_id": database_id}, "properties": properties})


def patch_page(page_id: str, properties: dict | None = None, archived: bool | None = None):
    body = {}
    if properties is not None:
        body["properties"] = properties
    if archived is not None:
        body["archived"] = bool(archived)
    return http_json("PATCH", f"/pages/{page_id}", body)


def build_event_props(obj: dict):
    when = obj.get("when") or now_iso()
    return {
        "Name": _title(obj.get("title") or obj.get("Name") or "(event)"),
        "when": _date(when),
        "importance": _select(str(obj.get("importance")) if obj.get("importance") is not None else None),
        "trigger": _select(obj.get("trigger")),
        "context": _rt(obj.get("context") or ""),
        "source": _select(obj.get("source") or "other"),
        "link": _url(obj.get("link")),
        "uncertainty": _num(obj.get("uncertainty")),
        "control": _num(obj.get("control")),
    }


def build_emotion_props(obj: dict, event_page_id: str | None = None):
    props = {
        "Name": _title(obj.get("title") or f"{obj.get('axis')}={obj.get('level')}"),
        "axis": _select(obj.get("axis")),
        "level": _num(obj.get("level")),
        "comment": _rt(obj.get("comment") or ""),
        "weight": _num(obj.get("weight")),
        "body_signal": _multi(obj.get("body_signal") or []),
        "need": _select(obj.get("need")),
        "coping": _select(obj.get("coping")),
    }
    if event_page_id:
        props["event"] = {"relation": [{"id": event_page_id}]}
    return props


def build_state_props(obj: dict, event_page_id: str | None = None):
    when = obj.get("when") or now_iso()
    props = {
        "Name": _title(obj.get("title") or f"state@{when}"),
        "when": _date(when),
        "state_json": _rt(json.dumps(obj.get("state_json") or {}, ensure_ascii=False)),
        "reason": _rt(obj.get("reason") or ""),
        "source": _select(obj.get("source") or "manual"),
        "mood_label": _select(obj.get("mood_label")),
        "intent": _select(obj.get("intent")),
        "need_stack": _select(obj.get("need_stack")),
        "need_level": _num(obj.get("need_level")),
        "avoid": _multi(obj.get("avoid") or []),
    }
    if event_page_id:
        props["event"] = {"relation": [{"id": event_page_id}]}
    return props
