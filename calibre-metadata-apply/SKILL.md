---
name: calibre-metadata-apply
description: "Primary skill for Calibre metadata edits over a running Content server. Use only when the user explicitly requests changing/editing/fixing title, authors, series, series_index, tags, publisher, pubdate, languages, comments, or analysis metadata. Never for read-only lookups."
metadata: {"openclaw":{"requires":{"bins":["node","calibredb"],"env":["CALIBRE_PASSWORD"]},"optionalBins":["pdffonts"],"optionalEnv":["CALIBRE_USERNAME"],"primaryEnv":"CALIBRE_PASSWORD","dependsOnSkills":["subagent-spawn-command-builder"],"localWrites":["skills/calibre-metadata-apply/state/runs.json"],"modifiesRemoteData":["calibre:metadata"]}}
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

Do not use for read-only requests such as ID1021 を確認して, 詳細, show/view/check. Route those to calibre-catalog-read.

ID + edit verb means this skill. ID without edit verb means read-only.

## Safety contract

Required flow:
1. Run read-only lookup to narrow candidates.
2. Show id,title,authors,series,series_index.
3. Get user confirmation for target IDs.
4. Build JSONL only for confirmed IDs.
5. Dry-run first.
6. Apply only after explicit user approval.
7. Re-read and report final values.

Never:
- Apply ambiguous title matches.
- Include unconfirmed IDs.
- Auto-fill low-confidence candidates.
- Start calibre-server.
- Pass Calibre password inline.

## Local facts

Read TOOLS.md for Content server URL, library id, auth, and reading script.

Connection bootstrap:
- First use saved defaults with no explicit --with-library.
- Scripts auto-load .env.
- Non-SSL auth is Digest; do not pass auth-mode/auth-scheme flags.
- Ask for URL only after connection resolution fails.

## Commands

Dry-run:
    cat changes.jsonl | node skills/calibre-metadata-apply/scripts/calibredb_apply.mjs --password-env CALIBRE_PASSWORD --lang ja

Apply:
    cat changes.jsonl | node skills/calibre-metadata-apply/scripts/calibredb_apply.mjs --password-env CALIBRE_PASSWORD --lang ja --apply

Use wrapper scripts, not direct calibredb, for chat/agent edits.

## Unknown-document recovery

Default stage is light pass:
1. Analyze existing metadata only.
2. Present all rows, not samples.
3. Stop for user instruction before deeper inspection.

On request:
- Page-1 pass: first page only.
- Deep pass: first 5 + last 5 pages and web evidence.
- Apply gate: explicit approval before writes.

Use pending-review tag for unresolved items; do not guess.

## Heavy analysis

Use subagent-spawn-command-builder for heavy proposal generation, profile calibre-meta.
Main session owns decisions, dry-run, apply, and final report.

For library-wide heavy processing, split turns:
- Turn 1: define scope, spawn subagent, save state/runs.json, reply started.
- Turn 2: handle completion through scripts and show proposal/apply result.

Detailed legacy notes and command variants: references/full-pre-prune-2026-05-27.md.
