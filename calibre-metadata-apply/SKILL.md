---
name: "calibre-metadata-apply"
description: "Edit Calibre title, authors, series, tags, dates, comments, and analysis metadata with dry-run/apply gates."
metadata: {"openclaw":{"requires":{"bins":["node","calibredb"],"env":["CALIBRE_PASSWORD"]},"optionalBins":["pdffonts"],"optionalEnv":["CALIBRE_USERNAME"],"primaryEnv":"CALIBRE_PASSWORD","localWrites":["skills/calibre-metadata-apply/state/runs.json"],"modifiesRemoteData":["calibre:metadata"]}}
---

# calibre-metadata-apply

Use for Calibre metadata writes. This skill can change remote Calibre metadata.

## Routing

Use when user explicitly asks to edit/fix/update/change:
- title, title_sort
- authors, author_sort
- series, series_index
- tags, publisher, pubdate, languages
- comments, analysis, analysis_tags

Do not use for read-only requests such as `ID1021 を確認して`, 詳細, show/view/check. Route those to `calibre-catalog-read`.

ID + edit verb means this skill. ID without edit verb means read-only.

## Supported Fields

Core fields:
- `title`, `title_sort`
- `authors` as string with `&` or array, `author_sort`
- `series`, `series_index`
- `tags` as string or array, `publisher`, `pubdate` as `YYYY-MM-DD`, `languages`
- `comments`

Extended fields:
- `comments_html`: OC marker block upsert.
- `analysis`: auto-generates analysis HTML for comments.
- `analysis_tags`: adds tags.
- `tags_merge`: default true.
- `tags_remove`: remove specific tags after merge.

## Safety Contract

Required flow:
1. Run read-only lookup to narrow candidates.
2. Show `id,title,authors,series,series_index`.
3. Get user confirmation for target IDs.
4. Build JSONL only for confirmed IDs.
5. Dry-run first.
6. Apply only after explicit user approval.
7. Re-read and report final values.

Never:
- Apply ambiguous title matches.
- Include unconfirmed IDs.
- Auto-fill low-confidence candidates.
- Start `calibre-server`.
- Pass Calibre password inline.
- Use direct `calibredb` for chat/agent edit operations; use wrapper scripts.

## Local Facts

Read TOOLS.md for Content server URL, library id, auth, reading script, and optional subagent model defaults.

Connection bootstrap:
- Do not ask the user for `--with-library` first.
- First use saved defaults with no explicit `--with-library`.
- Scripts auto-load `.env`.
- Non-SSL auth is Digest; do not pass auth-mode/auth-scheme flags.
- Ask for URL only after command output shows unresolved connection.
- Prefer env-based password with `--password-env CALIBRE_PASSWORD`; username auto-loads from env, or override with `--username`.

Requirements: `calibredb` and `node`; `pdffonts` optional/recommended for PDF evidence checks.

## Commands

Dry-run:
    cat changes.jsonl | node skills/calibre-metadata-apply/scripts/calibredb_apply.mjs --password-env CALIBRE_PASSWORD --lang ja

Apply:
    cat changes.jsonl | node skills/calibre-metadata-apply/scripts/calibredb_apply.mjs --password-env CALIBRE_PASSWORD --lang ja --apply

Run state:
    node skills/calibre-metadata-apply/scripts/run_state.mjs upsert --run-id <RUN_ID> --session-key <RUNTIME_HANDLE> --task <TASK> --state running
    node skills/calibre-metadata-apply/scripts/handle_completion.mjs --run-id <RUN_ID> --result-json /tmp/result.json

## Unknown-Document Recovery

Use when title/author/series are missing or unreliable.

Default stage is light pass:
1. Analyze existing metadata only.
2. Present all rows, not samples.
3. Stop for user instruction before deeper inspection.

On request:
- Page-1 pass: first page only.
- Deep pass: first 5 + last 5 pages and web evidence.
- Apply gate: explicit approval before writes.

Proposal synthesis:
- Collect evidence from file extraction and web sources when metadata is missing.
- Show one merged proposal table with id, current fields, candidate fields, source, confidence high|medium|low, and sort candidates.
- Apply only approved/finalized fields.
- If confidence is low or sources conflict, keep fields empty.
- Use pending-review tag for unresolved/hold items; do not force guesses.

Required report shape for batch recovery:
- execution summary with target/changed/pending/skipped/error.
- full changed list with `id` and key before/after fields.
- full pending list with `id` and reason.
- full error list with `id` and error summary.

## Extraction And Sort

- Try `ebook-convert` first.
- If empty/failed, fallback to `pdftotext`.
- If both fail, switch to web-evidence-first mode.
- Use TOOLS.md Calibre `reading_script` for Japanese/non-Latin sort fields.
- Default policy is full reading, no truncation.
- Ask once on first use only when TOOLS.md lacks the configured reading script.

## Heavy Analysis

Use native subagent delegation only for heavy proposal generation. Main owns final decisions, dry-run, apply, and final report.

1. Main defines scope and a self-contained task with required input paths, evidence limits, and output contract.
2. Call OpenClaw `sessions_spawn` directly with the self-contained task.
   - Follow the schema exposed by the current tool.
   - Do not generate or reuse a separate shared spawn payload.
3. Use model/thinking defaults from TOOLS.md only when an override is needed.
4. Save `run_id`, the returned OpenClaw session handle, and task via `scripts/run_state.mjs upsert`.
5. Keep normal chat responsive and consume the OpenClaw completion event; do not busy-poll.
6. Save result JSON and run `scripts/handle_completion.mjs --run-id ... --result-json ...`.
7. Return a proposal or apply result only after the existing user gate is satisfied.

Data flow:
- Local execution reads Calibre metadata/files and writes Calibre metadata only after approval.
- Optional subagent execution may receive extracted source/evidence for heavy candidate generation.
- Subagent must not apply metadata or message the user.
- If user does not want external model/subagent processing, keep flow local and skip delegation.
