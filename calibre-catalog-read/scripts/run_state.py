#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_state(path: Path) -> dict:
    if not path.exists():
        return {"runs": {}}
    txt = path.read_text(encoding="utf-8").strip()
    if not txt:
        return {"runs": {}}
    data = json.loads(txt)
    if not isinstance(data, dict):
        return {"runs": {}}
    runs = data.get("runs")
    if not isinstance(runs, dict):
        data["runs"] = {}
    return data


def save_state(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def cmd_upsert(args: argparse.Namespace) -> int:
    state = load_state(args.state)
    runs = state.setdefault("runs", {})
    runs[args.run_id] = {
        "runId": args.run_id,
        "book_id": args.book_id,
        "title": args.title,
        "status": "running",
        "started_at": now_iso(),
    }
    save_state(args.state, state)
    print(json.dumps({"ok": True, "action": "upsert", "runId": args.run_id, "count": len(runs)}, ensure_ascii=False))
    return 0


def cmd_remove(args: argparse.Namespace) -> int:
    state = load_state(args.state)
    runs = state.setdefault("runs", {})
    existed = args.run_id in runs
    runs.pop(args.run_id, None)
    save_state(args.state, state)
    print(json.dumps({"ok": True, "action": "remove", "runId": args.run_id, "existed": existed, "count": len(runs)}, ensure_ascii=False))
    return 0


def cmd_fail(args: argparse.Namespace) -> int:
    state = load_state(args.state)
    runs = state.setdefault("runs", {})
    entry = runs.get(args.run_id)
    if not entry:
        print(json.dumps({"ok": False, "error": "run_not_found", "runId": args.run_id}, ensure_ascii=False))
        return 1
    entry["status"] = "failed"
    entry["error"] = args.error
    entry["updated_at"] = now_iso()
    save_state(args.state, state)
    print(json.dumps({"ok": True, "action": "fail", "runId": args.run_id}, ensure_ascii=False))
    return 0


def cmd_get(args: argparse.Namespace) -> int:
    state = load_state(args.state)
    runs = state.setdefault("runs", {})
    entry = runs.get(args.run_id)
    print(json.dumps({"ok": True, "run": entry}, ensure_ascii=False))
    return 0


def add_state_arg(sp: argparse.ArgumentParser) -> None:
    sp.add_argument(
        "--state",
        type=Path,
        default=Path("skills/calibre-catalog-read/state/runs.json"),
        help="Path to runs.json",
    )


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Manage calibre-catalog-read run state (runs.json)")

    sub = p.add_subparsers(dest="cmd", required=True)

    up = sub.add_parser("upsert", help="Insert/update running entry")
    add_state_arg(up)
    up.add_argument("--run-id", required=True)
    up.add_argument("--book-id", type=int, required=True)
    up.add_argument("--title", required=True)
    up.set_defaults(func=cmd_upsert)

    rm = sub.add_parser("remove", help="Remove entry on success")
    add_state_arg(rm)
    rm.add_argument("--run-id", required=True)
    rm.set_defaults(func=cmd_remove)

    fl = sub.add_parser("fail", help="Mark entry failed")
    add_state_arg(fl)
    fl.add_argument("--run-id", required=True)
    fl.add_argument("--error", required=True)
    fl.set_defaults(func=cmd_fail)

    gt = sub.add_parser("get", help="Get entry")
    add_state_arg(gt)
    gt.add_argument("--run-id", required=True)
    gt.set_defaults(func=cmd_get)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
