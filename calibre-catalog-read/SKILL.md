---
name: "calibre-catalog-read"
description: "Calibre catalog search, ID lookup, book viewing, and one-book analysis. Read-only; metadata edits use calibre-metadata-apply."
metadata: {"openclaw":{"requires":{"bins":["node","uv","calibredb","ebook-convert"],"env":["CALIBRE_PASSWORD"]},"optionalEnv":["CALIBRE_USERNAME"],"primaryEnv":"CALIBRE_PASSWORD","localWrites":["skills/calibre-catalog-read/state/runs.json","skills/calibre-catalog-read/state/calibre_analysis.sqlite","skills/calibre-catalog-read/state/cache/**"],"modifiesRemoteData":["calibre:comments-metadata"]}}
---

# calibre-catalog-read

Use for Calibre read-only catalog work and the one-book analysis/comments workflow.

## Routing

Use this skill for:
- list/search/id catalog lookup.
- ID viewing: `ID 1021 を確認して`, `1021番の詳細`, `show/view/check book 1021`.
- Natural book conversation where a lightweight library lookup helps.
- One-book analysis only when the user clearly asks to read/analyze a book.

Do not use for metadata edits. If the user asks to change title/authors/series/series_index/tags/publisher/pubdate/languages, route to `calibre-metadata-apply`.

ID alone is not edit intent. 確認/見せて/教えて/詳細/check/show/view means read-only. `calibre-metadata-apply` requires explicit edit verbs such as 修正/編集/変更/直す/fix/edit/update/change.

## Local Facts

Read TOOLS.md for Content server URL, library id, auth policy, reading script, and optional subagent model defaults.

Connection bootstrap:
- Do not ask the user for `--with-library` first.
- First try scripts without explicit `--with-library`; they auto-load `.env` and saved defaults.
- Ask for URL only if resolution fails (`missing --with-library` or unable to resolve usable library).
- Non-SSL auth is Digest; do not pass auth-mode/auth-scheme flags.
- Never start `calibre-server` from chat.
- Do not assume localhost/127.0.0.1; TOOLS.md has the reachable server.

Requirements: `calibredb`, `ebook-convert`, `node`, and `uv`.

## Commands

Prefer wrapper scripts over direct `calibredb` in agent/chat.

List:
    node skills/calibre-catalog-read/scripts/calibredb_read.mjs list --password-env CALIBRE_PASSWORD --limit 50

Search:
    node skills/calibre-catalog-read/scripts/calibredb_read.mjs search --password-env CALIBRE_PASSWORD --query 'series:"中公文庫"'

Get by id:
    node skills/calibre-catalog-read/scripts/calibredb_read.mjs id --password-env CALIBRE_PASSWORD --book-id 3

One-book pipeline with prepared analysis JSON:
    uv run python skills/calibre-catalog-read/scripts/run_analysis_pipeline.py --password-env CALIBRE_PASSWORD --book-id 3 --lang ja --analysis-json /tmp/calibre_3/analysis.json

Prepare subagent input:
    node skills/calibre-catalog-read/scripts/prepare_subagent_input.mjs --book-id 3 --lang ja --out-dir /tmp/calibre_3

Run state:
    node skills/calibre-catalog-read/scripts/run_state.mjs upsert --run-id <RUN_ID> --book-id 3 --title "..." --state running
    node skills/calibre-catalog-read/scripts/handle_completion.mjs --run-id <RUN_ID> --analysis-json /tmp/analysis.json

## One-Book Analysis Flow

Use a subagent only for heavy reading. Keep main chat as control plane.

1. Confirm target `book_id`.
2. Prepare input with `scripts/prepare_subagent_input.mjs`.
3. Build a self-contained analysis task from `references/subagent-analysis.prompt.md` and the generated `subagent_input.json` path.
4. Call OpenClaw `sessions_spawn` directly with the self-contained task.
   - Follow the schema exposed by the current tool.
   - Do not generate or reuse a separate shared spawn payload.
5. Use model/thinking defaults from TOOLS.md only when an override is needed.
6. Save a run id with `scripts/run_state.mjs upsert` and keep the chat responsive. Do not busy-poll.
7. When OpenClaw delivers completion, validate the raw JSON against `references/subagent-analysis.schema.json`, then run `scripts/handle_completion.mjs`.

Hard rules:
- One book per run.
- Main session owns user-facing replies and Calibre comments apply.
- Subagent only reads the prepared input and emits analysis JSON; it must not apply metadata or message the user.
- Use `references/subagent-analysis.prompt.md`; do not send relaxed ad-hoc read instructions.
- Input schema: `references/subagent-input.schema.json`; output schema: `references/subagent-analysis.schema.json`.
- Exclude manga/comic-centric books from this text pipeline.
- If extracted text is too short, stop and ask for confirmation.
- Keep `state/runs.json` to active/failed records only.
- At completion, missing runId means stale/duplicate; do not apply blindly.

## Cache And Language

Cache DB is `skills/calibre-catalog-read/state/calibre_analysis.sqlite`. Treat cache as acceleration, not authority; final user-visible answer should reflect current target and completed run.

Language policy:
- Do not hardcode user-language prose in pipeline scripts.
- Generate user-visible analysis from subagent output, with language controlled by user-selected settings and `lang` input.
- Fallback local analysis is generic/minimal; preferred path is subagent output following the prompt template.
