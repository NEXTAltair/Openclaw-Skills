---
name: video-unwatched-pipeline
description: Run and maintain an end-to-end Unwatched→VideoLibrary pipeline using mediaops. Use when organizing an unwatched source folder into a destination library by program/date, fixing scheduled auto-organize failures, checking move/plan logs, or updating pipeline run commands (uv run).
metadata: {"openclaw":{"requires":{"bins":["node","uv","python3"]},"localReads":["<workspace>/mediaops/**","<host-data-root>/**"],"localWrites":["<host-data-root>/move/**","<host-data-root>/llm/**"]}}
disable-model-invocation: true
---

# video-unwatched-pipeline

Use this as the single skill for the video organization workflow.

## Scope

Handle these operations as one pipeline:
- inventory ingest into `mediaops.sqlite`
- metadata queue + extraction + upsert
- move plan generation
- Windows move apply
- DB path update
- audit log rotation

## Entry points

- Main runner: `<workspace>/mediaops/unwatched_pipeline_runner.py`
- Stable wrapper: `skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs`
- Path config: `skills/video-unwatched-pipeline/state/paths.json` (copy from `paths.template.json`)

Always prefer wrapper execution from workspace root:

```bash
skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs --limit 500 --apply
```

Default paths (`--db` / `--source-root` / `--dest-root`) are loaded from:
- `skills/video-unwatched-pipeline/state/paths.json`

Override config file when needed:

```bash
skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs \
  --config /path/to/paths.json \
  --limit 500 --apply
```

If `mediaops/` is not under the current workspace, pass it explicitly:

```bash
skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs \
  --mediaops-dir /path/to/mediaops \
  --limit 500 --apply
```

## Runtime rules

- Use `uv run python` for Python execution paths.
- Do not call bare `python`/`python3` in run commands.
- Keep host file operations in the host-side script layer (`*.ps1` or equivalent) via the runner.

## Operations

### 1) Dry-run verification

```bash
skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs --limit 100
```

### 2) Apply run

```bash
skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs --limit 500 --apply
```

### 3) Parse result

The runner prints one JSON summary. Read these keys first:
- `applied_rows`
- `remaining_files`
- `plan_stats`
- `inventory` / `queue` / `plan` / `applied`

### 4) Alert conditions (for cron/manual checks)

Treat as anomaly if any:
- non-zero exit or exception
- `remaining_files > 0` and `applied_rows == 0`
- `plan_stats.skipped_needs_review > 0`
- `plan_stats.skipped_missing_fields > 0`
- `plan_stats.skipped_outside > 0`
- apply log reports Windows script errors

## References

For troubleshooting patterns and log pointers, read:
- `references/ops-notes.md`
