---
name: "calibre-catalog-read"
description: "Calibre catalog lookup, viewing, and delegated one-book analysis."
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

Read the workspace `AGENTS.md` `## Tools` section for Content server URL, library id, auth policy, and reading script.

Connection bootstrap:
- Do not ask the user for `--with-library` first.
- First try scripts without explicit `--with-library`; they auto-load `.env` and saved defaults.
- Ask for URL only if resolution fails (`missing --with-library` or unable to resolve usable library).
- Non-SSL auth is Digest; do not pass auth-mode/auth-scheme flags.
- Never start `calibre-server` from chat.
- Do not assume localhost/127.0.0.1; the workspace `AGENTS.md` `## Tools` section has the reachable server.

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

Delegate only full-book reading. Main remains the control plane.

1. Confirm target `book_id`.
2. Prepare input with `scripts/prepare_subagent_input.mjs`.
3. Build a self-contained task from `references/subagent-analysis.prompt.md` and the generated `subagent_input.json` path.
4. Call OpenClaw `sessions_spawn` with the live tool schema:
   - `runtime: "subagent"`
   - `agentId: "calibre-reader"`
   - `mode: "run"`
   - `context: "isolated"`
   - `lightContext: true`
   - omit `model` and `thinking`; the target agent profile owns them.
5. Save the returned run/session identifiers with `scripts/run_state.mjs upsert`.
6. Use `sessions_yield` when completion belongs in a later turn. Do not poll session or subagent lists.
7. On completion, validate the raw JSON against `references/subagent-analysis.schema.json`, then run `scripts/handle_completion.mjs`.

Use Swarm only for an explicitly requested independent multi-book batch. Keep one book per child and preserve the same input/output contract.

Hard rules:
- One book per child run.
- Main owns user-facing replies and Calibre comments apply.
- Child reads prepared input and emits analysis JSON only; it must not apply metadata or message the user.
- Use `references/subagent-analysis.prompt.md`; do not send relaxed ad-hoc instructions.
- Input schema: `references/subagent-input.schema.json`; output schema: `references/subagent-analysis.schema.json`.
- Exclude manga/comic-centric books from this text pipeline.
- If extracted text is too short, stop and ask for confirmation.
- Keep `state/runs.json` to active/failed records only.
- At completion, missing runId means stale/duplicate; do not apply blindly.

## Cache And Language

Cache DB is `skills/calibre-catalog-read/state/calibre_analysis.sqlite`. Treat cache as acceleration, not authority; final user-visible analysis must reflect the current target and completed run.

Language policy:
- Do not hardcode user-language prose in pipeline scripts.
- Generate user-visible analysis from child output, controlled by user settings and the `lang` input.
- Local fallback analysis is generic/minimal; prefer output following the prompt template.
