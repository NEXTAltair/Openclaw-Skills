---
name: calibre-catalog-read
description: "Read-only Calibre catalog lookup, ID viewing, and one-book analysis comments workflow over a running Content server. Use for list/search/id viewing, including ID requests without edit verbs. Never for title/authors/tags/series/series_index metadata edits."
metadata: {"openclaw":{"requires":{"bins":["node","uv","calibredb","ebook-convert"],"env":["CALIBRE_PASSWORD"]},"optionalEnv":["CALIBRE_USERNAME"],"primaryEnv":"CALIBRE_PASSWORD","dependsOnSkills":["subagent-spawn-command-builder"],"localWrites":["skills/calibre-catalog-read/state/runs.json","skills/calibre-catalog-read/state/calibre_analysis.sqlite","skills/calibre-catalog-read/state/cache/**"],"modifiesRemoteData":["calibre:comments-metadata"]}}
---

# calibre-catalog-read

Use for Calibre read-only catalog work and the one-book analysis/comments workflow.

## Routing

Use this skill for:
- list/search/id catalog lookup.
- ID viewing: ID 1021 を確認して, 1021番の詳細, show/view/check book 1021.
- Natural book conversation where a lightweight library lookup helps.
- One-book analysis only when the user clearly asks to read/analyze a book.

Do not use for metadata edits. If the user asks to change title/authors/series/series_index/tags/publisher/pubdate/languages, route to calibre-metadata-apply.

ID alone is not edit intent. 確認/見せて/教えて/詳細/check/show/view means read-only.

## Local facts

Read TOOLS.md for Content server URL, library id, auth policy, and reading script.

Connection bootstrap:
- First try scripts without explicit --with-library; they auto-load .env and saved defaults.
- Ask for URL only if resolution fails.
- Non-SSL auth is Digest; do not pass auth-mode/auth-scheme flags.
- Never start calibre-server from chat.

## Commands

Prefer wrapper scripts over direct calibredb.

List:
    node skills/calibre-catalog-read/scripts/calibredb_read.mjs list --password-env CALIBRE_PASSWORD --limit 50

Search:
    node skills/calibre-catalog-read/scripts/calibredb_read.mjs search --password-env CALIBRE_PASSWORD --query 'series:"中公文庫"'

Get by id:
    node skills/calibre-catalog-read/scripts/calibredb_read.mjs id --password-env CALIBRE_PASSWORD --book-id 3

One-book pipeline with prepared analysis JSON:
    uv run python skills/calibre-catalog-read/scripts/run_analysis_pipeline.py --password-env CALIBRE_PASSWORD --book-id 3 --lang ja --analysis-json /tmp/calibre_3/analysis.json

## One-book analysis flow

Use subagent only for heavy reading. Keep main chat as control plane.

Turn A, start only:
1. Confirm target book_id.
2. Prepare input with scripts/prepare_subagent_input.mjs.
3. Use subagent-spawn-command-builder with profile calibre-read.
4. Call sessions_spawn.
5. Save run state with scripts/run_state.mjs upsert.
6. Reply that analysis is running and stop the turn.

Turn B, completion only:
1. On completion event, run scripts/handle_completion.mjs with --run-id and --analysis-json.
2. It applies comments, updates DB, and removes completed run state.
3. If state is missing, treat as stale/duplicate and do not apply blindly.

Hard rules:
- Never poll/wait/apply in Turn A.
- One book per run.
- Exclude manga/comic-centric books from this text pipeline.
- If extracted text is too short, stop and ask for confirmation.
- Keep state/runs.json to active/failed records only.

Detailed legacy notes and command variants: references/full-pre-prune-2026-05-27.md.
