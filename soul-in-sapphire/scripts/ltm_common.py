#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


def load_config(path: str | None = None) -> dict:
    p = Path(path or "~/.config/soul-in-sapphire/config.json").expanduser()
    if not p.exists():
        raise SystemExit(
            f"Missing config: {p}\n"
            "Run bootstrap first: python3 skills/soul-in-sapphire/scripts/bootstrap_config.py --name 'OpenClaw LTM'"
        )
    return json.loads(p.read_text(encoding="utf-8"))


def require_ids(cfg: dict):
    for k in ("data_source_id", "database_id"):
        if not cfg.get(k):
            raise SystemExit(f"Config missing {k}: {cfg}")
