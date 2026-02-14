---
name: video-metadata-extract
description: Use the agent's LLM to extract structured metadata (program title / episode / subtitle / air date) from recorded video filenames and paths, then write results as JSONL for ingestion into mediaops.sqlite path_metadata.
disable-model-invocation: false
---

# video-metadata-extract

This skill runs **LLM-based parsing** for recorded video filenames.
Rule-based parsing is intentionally avoided due to broadcast-specific variability.

## Inputs

### Queue JSONL
Produced by `video-archive-db`:
- `mediaops/make_metadata_queue.py --out queue.jsonl`

Each line (except the first `_meta` line) contains at least:
- `path_id`
- `path`
- `name` / `dir` / `ext`
- `size_bytes`, `mtime_utc`

## Output

### Extracted JSONL
One JSON object per file (line-based), suitable for:
- `mediaops/upsert_path_metadata_jsonl.py --in extracted.jsonl --source llm`

## Required fields (v1)

Write these keys to each output record:
- `path_id` (preferred) and/or `path`
- `program_title`
- `episode_no` (number or null)
- `subtitle` (string or null)
- `air_date` ("YYYY-MM-DD" or null)
- `confidence` (0.0–1.0)
- `needs_review` (bool)
- `model` (string; the LLM name used)
- `extraction_version` (string; e.g. "prompt_v1")
- `normalized_program_key` (string; folder-safe key)
- `evidence` (object; include `raw` filename snippet used)

### Normalized program key guidelines
- Use the final `program_title` as the base
- Normalize spaces to `_` and collapse repeated `_`
- Avoid characters that break Windows paths (`<>:"/\\|?*`) by removing/replacing

## Workflow

1) Generate a queue:
- Use `video-archive-db` to make `queue.jsonl`.

2) Extract in batches (recommended 200–500 lines per batch):
- Read a slice of the queue (skip the `_meta` line).
- For each file, produce one output JSON record.

3) Save `extracted.jsonl` under `B:\\_AI_WORK\\llm\\` (or another explicit OutDir).

4) Ingest into DB:
- `uv run python mediaops/upsert_path_metadata_jsonl.py --in extracted.jsonl --source llm`

## Air date extraction (preferred)

Recorded filenames typically end with a timestamp before the extension:
- `YYYY_MM_DD_HH_mm` (usually underscore-separated)
- Sometimes space-separated: `YYYY MM DD HH mm`

**Prefer extracting `air_date` deterministically from this suffix**.
If the suffix cannot be found, set `air_date=null` (do not guess from prose).

## Safety / quality gates

- Always emit `confidence` (0–1). Do **not** hardcode a global acceptance threshold here.
  - Downstream steps (e.g. folder-move plan generation) should choose a `--min-confidence`.
- Set `needs_review=true` when confidence is low or key fields are missing.
- Never hallucinate episode/subtitle: use null when uncertain.
- Prefer **not classifying** over wrong classification.

## Suggested prompt (prompt_v1)

System/task framing for the LLM extraction step (agent-side):

- Input: Windows path string + filename
- Output: JSON object with the required fields
- Constraints:
  - No extra commentary, JSON only
  - Use null when unknown
  - Provide confidence 0–1 and needs_review
  - normalized_program_key must be Windows-folder-safe
