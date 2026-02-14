# video-unwatched-pipeline ops notes

## Primary logs

- Move apply logs: `<host-data-root>/move/move_apply_*.jsonl`
- Move plan logs: `<host-data-root>/move/move_plan_from_inventory_*.jsonl`
- Remaining snapshot: `<host-data-root>/move/remaining_unwatched_*.txt`

Resolve `<host-data-root>` from `skills/video-unwatched-pipeline/state/paths.json`.

## Common failure signatures

- `python: command not found`
  - Cause: bare `python` call in runtime path
  - Fix: run through wrapper (`uv run python ...`)

- `pwsh failed rc=*`
  - Cause: Windows script failure (`apply_move_plan.ps1`, inventory, normalize)
  - Fix: inspect latest `move_apply_*.jsonl` and PowerShell output

## Manual quick checks

```bash
# dry-run
skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs --limit 100

# apply
skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs --limit 500 --apply
```

## Config

- Default config file: `skills/video-unwatched-pipeline/state/paths.json`
- Template: `skills/video-unwatched-pipeline/state/paths.template.json`
- Optional env overrides:
  - `VIDEO_PIPELINE_CONFIG`
  - `VIDEO_PIPELINE_MEDIAOPS_DIR`
