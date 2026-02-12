#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


def config_path() -> Path:
    return Path("~/.config/soul-in-sapphire/config.json").expanduser()


def load_config() -> dict:
    p = config_path()
    if not p.exists():
        raise SystemExit(
            f"Missing config: {p}\n"
            "Run setup: node skills/soul-in-sapphire/scripts/setup_ltm.js --parent <Notion parent page url> --base <name> --yes"
        )
    return json.loads(p.read_text(encoding="utf-8"))


def save_config(cfg: dict):
    p = config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_paths(cfg: dict, keys: list[str]):
    missing = []
    for k in keys:
        if not cfg.get(k):
            missing.append(k)
    if missing:
        raise SystemExit(f"Config missing keys: {missing}. Run setup_ltm.js again.")
