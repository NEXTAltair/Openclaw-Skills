---
name: "session-logs"
description: "Search, inspect, and analyze prior OpenClaw sessions and transcript history."
---

# Session logs

Use for exact transcript recall, recent/parent-session inspection, or debugging prior model output.

## Preferred workflow

1. For exact words or phrases, call `sessions_search`.
2. For recent, parent, child, labeled, or active sessions, call `sessions_list`.
3. Open the selected session with `sessions_history` using its returned `sessionKey`.
4. Start bounded:
   - omit `includeTools` unless tool calls/results matter
   - use a small `limit` for the newest tail
   - use `offset: 0`, then returned `nextOffset`, only when paging older history
   - use a returned message anchor when the tool exposes one
5. Report the observed session/model/timestamp and quote only the needed excerpt.

If these tools are deferred, load their exact schemas before calling them.

## Tool roles

- `sessions_search`: exact full-text search over visible user/assistant transcript text.
- `sessions_list`: discover visible sessions by agent, kind, label, search text, archive state, or recency. Use `includeLastMessage`, `includeDerivedTitles`, or bounded `messageLimit` for triage.
- `sessions_history`: read bounded surrounding context. It is sanitized and may redact, truncate, omit oversized rows, or strip internal/provider scaffolding.
- `session_status`: inspect current model, usage, runtime state, or state-version changes; not transcript search.

Honor returned visibility metadata. Missing results can mean the caller's session visibility excludes them.

## Session search vs memory search

- Use `sessions_search` for exact conversation wording.
- Use `memory_search` for durable decisions, preferences, dates, project knowledge, semantic recall, or compiled-wiki context.
- When both matter, recall durable memory first, then use session tools for transcript evidence.

## Current storage model

Canonical runtime session and transcript rows live in the per-agent SQLite database:

`~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite`

Do not treat legacy `sessions.json` or session JSONL files as the current source of truth. Files under `~/.openclaw/agents/<agentId>/sessions/` are archived/migration artifacts unless an explicit export created them.

For operator diagnostics, prefer supported read-only commands such as:

`openclaw doctor --session-sqlite inspect --session-sqlite-agent <agentId> --json`

Use `openclaw sessions --agent <agentId> --json` when agent tools are unavailable and only session listing is needed.

## Raw and archived evidence

Do not describe `sessions_history` as an exact raw dump. If sanitized history is insufficient, state the limitation. Inspect raw SQLite transcript rows or explicit exports only for a justified forensic/debugging task with appropriate local access; keep reads scoped and read-only.

Use legacy JSONL parsing only when the target is explicitly an archived/imported JSONL artifact, not for normal current-session recall.

## Verification

A successful lookup identifies the intended session and returns enough surrounding user/assistant text to support the answer. If search reports `indexing: true`, retry after reconciliation finishes before concluding that no match exists.
