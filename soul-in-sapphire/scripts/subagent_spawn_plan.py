#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = ROOT / "state"
CFG_PATH = STATE_DIR / "subagent-models.json"
LOG_PATH = STATE_DIR / "subagent-spawn-log.jsonl"


def load_cfg() -> dict:
    if not CFG_PATH.exists():
        raise SystemExit(f"Missing config: {CFG_PATH}")
    return json.loads(CFG_PATH.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser(description="Build sessions_spawn payload from skill-local JSON presets")
    ap.add_argument("--profile", required=True, help="profile key in state/subagent-models.json (e.g. heartbeat, journal)")
    ap.add_argument("--task", required=True, help="sub-agent task text")
    ap.add_argument("--label", default="", help="optional run label")
    args = ap.parse_args()

    cfg = load_cfg()
    profiles = cfg.get("profiles") or {}
    p = profiles.get(args.profile)
    if not p:
        raise SystemExit(f"Unknown profile: {args.profile}")

    defaults = cfg.get("defaults") or {}
    payload = {
        "label": args.label or f"{args.profile}-{int(time.time())}",
        "task": args.task,
        "model": p.get("model"),
        "thinking": p.get("thinking"),
        "runTimeoutSeconds": int(defaults.get("runTimeoutSeconds", 180)),
        "timeoutSeconds": int(defaults.get("runTimeoutSeconds", 180)),
        "cleanup": defaults.get("cleanup", "keep"),
    }

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), "profile": args.profile, "payload": payload}, ensure_ascii=False) + "\n")

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
