#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = ROOT / "state"
CFG_PATH = STATE_DIR / "spawn-profiles.json"
LOG_PATH = STATE_DIR / "build-log.jsonl"


def load_cfg() -> dict:
    if not CFG_PATH.exists():
        raise SystemExit(
            f"Missing config: {CFG_PATH}\n"
            f"Create it from template: {STATE_DIR / 'spawn-profiles.template.json'}"
        )
    return json.loads(CFG_PATH.read_text(encoding="utf-8"))


def pick(cli_val, profile: dict, defaults: dict, key: str):
    if cli_val not in (None, ""):
        return cli_val
    if key in profile and profile.get(key) not in (None, ""):
        return profile.get(key)
    return defaults.get(key)


def main() -> None:
    ap = argparse.ArgumentParser(description="Build sessions_spawn payload from local JSON profiles")
    ap.add_argument("--profile", required=True, help="profile key in state/spawn-profiles.json")
    ap.add_argument("--task", required=True, help="task text for subagent")

    # Official sessions_spawn params (optional overrides)
    ap.add_argument("--label", default="", help="sessions_spawn.label")
    ap.add_argument("--agent-id", default="", help="sessions_spawn.agentId")
    ap.add_argument("--model", default="", help="sessions_spawn.model")
    ap.add_argument("--thinking", default="", help="sessions_spawn.thinking")
    ap.add_argument("--run-timeout-seconds", type=int, default=None, help="sessions_spawn.runTimeoutSeconds")
    ap.add_argument("--cleanup", choices=["keep", "delete"], default="", help="sessions_spawn.cleanup")

    args = ap.parse_args()

    cfg = load_cfg()
    profile = (cfg.get("profiles") or {}).get(args.profile)
    if not profile:
        raise SystemExit(f"Unknown profile: {args.profile}")
    defaults = cfg.get("defaults") or {}

    payload = {"task": args.task}

    label = pick(args.label, profile, defaults, "label")
    if label not in (None, ""):
        payload["label"] = label
    else:
        payload["label"] = f"{args.profile}-{int(time.time())}"

    agent_id = pick(args.agent_id, profile, defaults, "agentId")
    if agent_id not in (None, ""):
        payload["agentId"] = agent_id

    model = pick(args.model, profile, defaults, "model")
    if model not in (None, "", "<set-by-user>"):
        payload["model"] = model

    thinking = pick(args.thinking, profile, defaults, "thinking")
    if thinking not in (None, ""):
        payload["thinking"] = thinking

    rts = pick(args.run_timeout_seconds, profile, defaults, "runTimeoutSeconds")
    if rts not in (None, ""):
        payload["runTimeoutSeconds"] = int(rts)

    cleanup = pick(args.cleanup, profile, defaults, "cleanup")
    if cleanup not in (None, ""):
        payload["cleanup"] = cleanup

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), "profile": args.profile, "payload": payload}, ensure_ascii=False) + "\n")

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
