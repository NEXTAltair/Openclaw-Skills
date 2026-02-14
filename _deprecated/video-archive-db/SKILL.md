---
name: video-archive-db
description: Manage a local SQLite database that inventories recorded video files (paths, sizes, timestamps), keeps per-scan snapshots, and stores rename/move audit history. Use when ingesting inventory JSONL into SQLite, generating reports from the DB, or recording applied rename plans into the DB for rollback/auditing.
disable-model-invocation: true
---

# Video archive DB (SQLite) operations

This skill is the **database backbone** for the recorded video library workflow.

It manages and queries `mediaops.sqlite` (SQLite) which stores:
- `runs` (each scan/apply)
- `paths` + `observations` (inventory snapshots)
- `events` (rename/move audit)

> Safety: DB writes are allowed, but file operations are **not** performed by this skill.

## Inputs / outputs

### Inventory input
- JSONL produced by `scripts/inventory_scan.ps1`

### Apply/audit input
- `applied_*.jsonl` produced by `skills/media-name-normalize/scripts/apply_plan.ps1`

## Core commands (current implementation)

Implementation lives in `/home/altair/.openclaw/workspace/val/mediaops/`.

### 1) Ingest inventory JSONL → DB

- Script: `mediaops/ingest_inventory_jsonl.py`
- Creates a new `runs(kind=inventory)` and upserts `paths` + `observations`.

Run:

1. Activate env:
   - `cd /home/altair/.openclaw/workspace/val/mediaops`
2. Execute:
   - `uv run python ingest_inventory_jsonl.py --jsonl <jsonl> --target-root <win-root>`

### 2) Ingest applied rename JSONL → DB events

- Script: `mediaops/ingest_applied_jsonl_to_events.py`
- Creates a new `runs(kind=apply)` and inserts `events` rows.

Run:
- `uv run python ingest_applied_jsonl_to_events.py --applied <applied.jsonl> --notes <notes>`

## LLM metadata extraction support

`video-archive-db` treats episode/program/subtitle as **LLM-extracted metadata**.
We persist the result as JSON into `path_metadata.data_json` so it is:
- auditable
- re-runnable (stale detection)
- decoupled from fragile rule-based parsing

### 3) Create an extraction queue (JSONL)

- Script: `mediaops/make_metadata_queue.py`

This emits a JSONL stream of paths that are **missing** metadata (or stale if you pass `--stale-before`).

Example:
- `uv run python make_metadata_queue.py --target-root "B:\\未視聴" --limit 2000 --out queue.jsonl`

### 4) Upsert extracted metadata JSONL → DB

- Script: `mediaops/upsert_path_metadata_jsonl.py`

Example:
- `uv run python upsert_path_metadata_jsonl.py --in extracted.jsonl --source llm`

## Reporting

For now, use SQL queries via Python/SQLite as needed.
(We can add a dedicated `db_report.py` later.)

## Parameters to always ask/confirm

- DB path (recommend placing on a path the agent can read, e.g. `B:\_AI_WORK\db\mediaops.sqlite`)
- Inventory JSONL path
- Target root (Windows path like `B:\未視聴`)
