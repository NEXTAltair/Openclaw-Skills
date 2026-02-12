#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
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
    if not isinstance(data.get("runs"), dict):
        data["runs"] = {}
    return data


def save_state(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def mark_failed(path: Path, run_id: str, error: str) -> None:
    data = load_state(path)
    runs = data.setdefault("runs", {})
    entry = runs.get(run_id)
    if not entry:
        return
    entry["status"] = "failed"
    entry["error"] = error
    entry["updated_at"] = now_iso()
    save_state(path, data)


def remove_run(path: Path, run_id: str) -> bool:
    data = load_state(path)
    runs = data.setdefault("runs", {})
    existed = run_id in runs
    runs.pop(run_id, None)
    save_state(path, data)
    return existed


def run_apply(args: argparse.Namespace, book_id: int) -> subprocess.CompletedProcess:
    script_dir = Path(__file__).resolve().parent
    pipeline = script_dir / "run_analysis_pipeline.py"
    cmd = [
        "python3",
        str(pipeline),
        "--with-library",
        args.with_library,
        "--book-id",
        str(book_id),
        "--lang",
        args.lang,
        "--analysis-json",
        str(args.analysis_json),
    ]
    if args.username:
        cmd += ["--username", args.username]
    if args.password_env:
        cmd += ["--password-env", args.password_env]

    env = os.environ.copy()
    return subprocess.run(cmd, capture_output=True, text=True, env=env)


def main() -> int:
    ap = argparse.ArgumentParser(description="Completion handler: get -> apply -> remove/fail")
    ap.add_argument("--state", type=Path, default=Path("skills/calibre-catalog-read/state/runs.json"))
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--analysis-json", type=Path, required=True)
    ap.add_argument("--with-library", required=True)
    ap.add_argument("--username", default="")
    ap.add_argument("--password-env", default="")
    ap.add_argument("--lang", default="ja")
    args = ap.parse_args()

    data = load_state(args.state)
    runs = data.get("runs", {})
    run = runs.get(args.run_id)
    if not run:
        print(json.dumps({"ok": True, "status": "stale_or_duplicate", "runId": args.run_id}))
        return 0

    book_id = int(run["book_id"])

    if not args.analysis_json.exists():
        err = f"analysis_json_not_found: {args.analysis_json}"
        mark_failed(args.state, args.run_id, err)
        print(json.dumps({"ok": False, "status": "failed", "runId": args.run_id, "error": err}))
        return 1

    cp = run_apply(args, book_id)
    if cp.returncode != 0:
        err = f"apply_failed (exit={cp.returncode})"
        mark_failed(args.state, args.run_id, err)
        print(json.dumps({
            "ok": False,
            "status": "failed",
            "runId": args.run_id,
            "book_id": book_id,
            "error": err,
            "stdout": cp.stdout,
            "stderr": cp.stderr,
        }, ensure_ascii=False))
        return cp.returncode

    remove_run(args.state, args.run_id)
    print(json.dumps({
        "ok": True,
        "status": "applied_and_removed",
        "runId": args.run_id,
        "book_id": book_id,
        "stdout": cp.stdout,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
