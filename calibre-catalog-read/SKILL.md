---
name: calibre-catalog-read
description: Read Calibre catalog data via calibredb over a Content server, and run one-book analysis workflow that writes HTML analysis block back to comments while caching analysis state in SQLite. Use for list/search/id lookups and AI reading pipeline for a selected book.
---

# calibre-catalog-read

Use this skill for:
- Read-only catalog lookup (`list/search/id`)
- One-book AI reading workflow (`export -> analyze -> cache -> comments HTML apply`)

## Requirements

- `calibredb` available on PATH in the runtime where scripts are executed.
- `ebook-convert` available for text extraction.
- Reachable Calibre Content server URL in `--with-library` format:
  - `http://HOST:PORT/#LIBRARY_ID`
- Do not assume localhost/127.0.0.1; always pass explicit reachable `HOST:PORT`.
- If auth is enabled, pass:
  - `--username <user>`
  - `--password-env <ENV_VAR_NAME>`

## Commands

List books (JSON):

```bash
node skills/calibre-catalog-read/scripts/calibredb_read.mjs list \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --username user --password-env CALIBRE_PASSWORD \
  --limit 50
```

Search books (JSON):

```bash
node skills/calibre-catalog-read/scripts/calibredb_read.mjs search \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --username user --password-env CALIBRE_PASSWORD \
  --query 'series:"中公文庫"'
```

Get one book by id (JSON):

```bash
node skills/calibre-catalog-read/scripts/calibredb_read.mjs id \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --username user --password-env CALIBRE_PASSWORD \
  --book-id 3
```

Run one-book pipeline (analyze + comments HTML apply + cache):

```bash
python3 skills/calibre-catalog-read/scripts/run_analysis_pipeline.py \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --username user --password-env CALIBRE_PASSWORD \
  --book-id 3 --lang ja
```

## Cache DB

Initialize DB schema:

```bash
python3 skills/calibre-catalog-read/scripts/analysis_db.py init \
  --db /home/altair/clawd/data/calibre_analysis.sqlite
```

Check current hash state:

```bash
python3 skills/calibre-catalog-read/scripts/analysis_db.py status \
  --db /home/altair/clawd/data/calibre_analysis.sqlite \
  --book-id 3 --format EPUB
```


## Main vs Subagent responsibility (strict split)

Use this split to avoid long blocking turns on chat listeners.

### Main agent (fast control plane)
- Validate user intent and target `book_id`.
- Confirm subagent runtime knobs: `model`, `thinking`, `runTimeoutSeconds`.
- Start subagent and return a short progress reply quickly.
- After subagent result arrives, run DB upsert + Calibre apply.
- Report final result to user.

### Subagent (heavy analysis plane)
- Read extracted source payload.
- Generate analysis JSON strictly by schema.
- Do not run metadata apply or user-facing channel actions.

### Never do in main when avoidable
- Long-form content analysis generation.
- Multi-step heavy reasoning over full excerpts.

### Turn policy
- One book per run.
- Prefer asynchronous flow: quick ack first, final result after analysis.
- If analysis is unavailable, either ask user or use fallback only when explicitly acceptable.

## Subagent pre-flight (required)

Before first subagent run in a session, confirm once:
- `model`
- `thinking` (`low`/`medium`/`high`)
- `runTimeoutSeconds`

Do not ask on every run. Reuse the confirmed settings for subsequent books in the same session unless the user asks to change them.

## Subagent support (model-agnostic)

Book-reading analysis is a heavy task. Use a subagent with a lightweight model for analysis generation, then return results to main agent for cache/apply steps.

- Prompt template: `references/subagent-analysis.prompt.md`
- Input schema: `references/subagent-input.schema.json`
- Output schema: `references/subagent-analysis.schema.json`
- Input preparation helper: `scripts/prepare_subagent_input.py`
  - Splits extracted text into multiple files to avoid read-tool single-line size issues.

Rules:
- Use subagent only for heavy analysis generation; keep main agent lightweight and non-blocking.
- Keep final DB upsert and Calibre metadata apply in main agent.
- Process one book per run.
- Confirm model/thinking/timeout once per session, then reuse; do not hardcode provider-specific model IDs in the skill.
- Configure callback/announce behavior and rate-limit fallbacks using OpenClaw default model/subagent/fallback settings (not hardcoded in this skill).
- Exclude manga/comic-centric books from this text pipeline (skip when title/tags indicate manga/comic).
- If extracted text is too short, stop and ask user for confirmation before continuing.
  - The pipeline returns `reason: low_text_requires_confirmation` with `prompt_en` text.

## Language policy

- Do not hardcode user-language prose in pipeline scripts.
- Generate user-visible analysis text from subagent output, with language controlled by user-selected settings and `lang` input.
- Fallback local analysis in scripts is generic/minimal; preferred path is subagent output following the prompt template.


## Orchestration note (important)

`run_analysis_pipeline.py` is a local script and does **not** call OpenClaw tools by itself.
Subagent execution must be orchestrated by the agent layer using `sessions_spawn`.

Required runtime sequence:
1. Main agent prepares `subagent_input.json` + chunked `source_files` from extracted text.
   - Use:
   ```bash
   python3 skills/calibre-catalog-read/scripts/prepare_subagent_input.py \
     --book-id <id> --title "<title>" --lang ja \
     --text-path /tmp/book_<id>.txt --out-dir /tmp/calibre_subagent_<id>
   ```
2. Main agent calls `sessions_spawn` (model/thinking/timeout confirmed with user).
3. Subagent reads all `source_files` and returns analysis JSON (schema-conformant).
4. Main agent passes that file via `--analysis-json` to `run_analysis_pipeline.py` for DB/apply.

If step 2 is skipped, pipeline falls back to local minimal analysis (only for emergency/testing).


## Chat execution model (required, strict)

For Discord/chat, always run as **two separate turns**.

### Turn A: start only (must be fast)
- Select one target book.
- Call `sessions_spawn`.
- Record run state (`runId`) via `run_state.py upsert`.
- Reply to user with selected title + "running in background".
- **Stop turn here.**

### Turn B: completion only (separate later turn)
Trigger: completion announce/event for that run.
- Run one command only (completion handler):
  - `scripts/handle_completion.py` (`get -> apply -> remove`, and `fail` on error).
- If `runId` is missing, handler returns `stale_or_duplicate` and does nothing.
- Send completion/failure reply from handler result.

Hard rule:
- Never poll/wait/apply in Turn A.
- Never keep a chat listener turn open waiting for subagent completion.

## Run state management (single-file, required)

For one-book-at-a-time operation, keep a single JSON state file:
- `skills/calibre-catalog-read/state/runs.json`

Use `runId` as the primary key (subagent execution id).

Lifecycle:
1. On spawn acceptance, upsert one record:
   - `runId`, `book_id`, `title`, `status: "running"`, `started_at`
2. Do not wait/poll inside the same chat turn.
3. On completion announce, load record by `runId` and run apply.
4. On successful apply, delete that record immediately.
5. On failure, set `status: "failed"` + `error` and keep record for retry/debug.

Rules:
- Keep this file small and operational (active/failed records only).
- Ignore duplicate completion events when record is already removed.
- If record is missing at completion time, report as stale/unknown run and do not apply blindly.

Use helper scripts (avoid ad-hoc env var mistakes):

```bash
# Turn A: register running task
python3 skills/calibre-catalog-read/scripts/run_state.py upsert \
  --state skills/calibre-catalog-read/state/runs.json \
  --run-id <RUN_ID> --book-id <BOOK_ID> --title "<TITLE>"

# Turn B: completion handler (preferred)
python3 skills/calibre-catalog-read/scripts/handle_completion.py \
  --state skills/calibre-catalog-read/state/runs.json \
  --run-id <RUN_ID> \
  --analysis-json /tmp/calibre_<BOOK_ID>/analysis.json \
  --with-library "http://HOST:PORT/#LIBRARY_ID" \
  --username user --password-env CALIBRE_PASSWORD --lang ja
```
