#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError

NOTION_API_BASE = "https://api.notion.com"
NOTION_VERSION = "2025-09-03"


def _token() -> str:
    t = (
        os.environ.get("NOTION_API_KEY")
        or os.environ.get("NOTION_TOKEN")
        or os.environ.get("NOTION_API_TOKEN")
        or ""
    ).strip()
    if t:
        return t
    p = Path("~/.config/notion/api_key").expanduser()
    if p.exists():
        v = p.read_text(encoding="utf-8").strip()
        if v:
            return v
    raise RuntimeError("Missing NOTION_API_KEY (or NOTION_TOKEN/NOTION_API_TOKEN)")


def http_json(method: str, api_path: str, payload: Any | None = None) -> dict:
    p = api_path if api_path.startswith("/") else f"/{api_path}"
    if not p.startswith("/v1/"):
        p = f"/v1{p}"
    url = f"{NOTION_API_BASE}{p}"
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        url,
        data=data,
        method=method.upper(),
        headers={
            "Authorization": f"Bearer {_token()}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        raise RuntimeError(f"Notion HTTP {e.code} {api_path}: {body}")
