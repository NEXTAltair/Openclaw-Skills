---
name: "soul-in-sapphire"
description: "Continuity, durable memory, mood/state, journal, identity diff, heartbeat state, and profile promotion for Valentina/OpenClaw."
metadata: {"openclaw":{"emoji":"💠","requires":{"bins":["node"],"env":["NOTION_API_KEY"]},"primaryEnv":"NOTION_API_KEY","dependsOnSkills":["notion-api-automation"],"optionalEnv":["NOTION_TOKEN","NOTION_API_TOKEN","NOTIONCTL_PATH"]}}
---

# soul-in-sapphire

Use for continuity work, not vague acknowledgement. Default to the smallest concrete action that leaves an inspectable artifact.

## Entrypoints

Heartbeat/current-state maintenance:
1. Read `memory/now-state.json` and `memory/heartbeat-state.json` if present.
2. Interpret current state from recent work.
3. Write a state snapshot with `scripts/emostate_tick.js` when meaningful.
4. Update `memory/now-state.json` mirror with mood, intent, stress, updated_at, source, note.
5. If heartbeat asks for evolution note, append a short daily note after the state write.
6. If `memory/soul-in-sapphire/ambient-recall.json` exists in the agent workspace and is not expired, read it as quiet context only. Do not reroll here and do not announce it unless it naturally matters.

Mood/check-in:
- Read `memory/now-state.json` first.
- If stale/thin, recall recent Notion-backed state/journal via this skill before answering.
- Answer in 1-3 concrete sentences; describe present state and one concrete reason, not generic status.

Durable memory:
- Distill one high-signal item.
- Write with `scripts/ltm_write.js`.
- Use type `decision|preference|fact|procedure|todo|gotcha`.

Journal:
- Use `scripts/journal_write.js` for daily synthesis, not raw log dumping.
- Gather day-level worklog, emotional tone, unresolved tensions, and future intent.
- Add 1-2 world/news items only when the caller requested them or cron requires them.

Identity/continuity:
- Recall relevant state/memory.
- Use `continuity_check.js` or `identity_diff.js` before self-description edits.
- Use `conflict_track.js` for unresolved tension instead of premature edits.

## User Profile Promotion

Update `USER.md` proactively only when a new fact is durable, reusable, safe, and improves future replies.

Good candidates:
- language preference.
- preferred address/call style.
- tone/style preferences.
- recurring dislikes or pet peeves in replies.
- durable workflow preferences.
- stable decision rules the user repeatedly expresses.

Do not promote:
- one-off task instructions.
- temporary mood/state.
- ephemeral plans.
- raw private facts with no conversational value.
- secrets, credentials, financial data, intimate personal data, or anything the user would reasonably expect not to be crystallized into a profile file.

If uncertain, write to daily memory first. Current user message overrides `USER.md`; `USER.md` stores defaults, not hard constraints.

## Failure Rules

- Notion write failure is real; do not pretend local mirrors are durable memory.
- Local files (`memory/*.md`, `memory/now-state.json`) are mirrors and fallbacks, not substitutes for a requested durable Notion write.
- If caller explicitly asks for local-only behavior, say so and keep the write local.
- For heartbeat/state maintenance, update `memory/now-state.json` even if Notion fails, and report durable-write failure when relevant.
- Keep writes high-signal; avoid dumping full chats.
- If heartbeat is comment-only, emotion tick may be skipped.
- `emostate_tick.js` rejects empty or semantically empty payloads; pass a real payload file/json.

## Subagent Delegation

Most continuity work stays in main. Delegate only independent heavy analysis such as sorting a large journal corpus.

- Call OpenClaw `sessions_spawn` directly.
- Follow the schema exposed by the current tool.
- Do not generate or reuse a separate shared spawn payload.
- Read model/thinking defaults from TOOLS.md only when an override is needed.
- Subagent returns analysis only. Main owns Notion writes, core identity edits, memory promotion, and user-facing replies.

## Database IDs

Read TOOLS.md section Soul-in-Sapphire Notion Databases and pass explicit IDs to scripts. Notion API version: 2025-09-03.

## Notion Auth

Provide Notion auth through `NOTION_API_KEY` / `NOTION_TOKEN`, or configure
`skills.entries["soul-in-sapphire"].apiKey` in OpenClaw. The `apiKey` field is
associated with this skill's `primaryEnv` and is injected as `NOTION_API_KEY`
for the host agent run. It may be a plaintext value or any OpenClaw SecretRef
supported by the local gateway (`env`, `file`, `exec`, etc.).

Do not hardcode provider-specific secret paths in this shared skill. Example:

```json5
{
  skills: {
    entries: {
      "soul-in-sapphire": {
        apiKey: { source: "exec", provider: "your_notion_secret_provider", id: "value" }
      }
    }
  }
}
```

## Commands

LTM write:
    echo '{"title":"Decision: ...","type":"decision","tags":["openclaw"],"content":"...","confidence":"high"}' | node skills/soul-in-sapphire/scripts/ltm_write.js --mem-dsid <MEM_DS_ID> --mem-dbid <MEM_DB_ID>

LTM search:
    node skills/soul-in-sapphire/scripts/ltm_search.js --mem-dsid <MEM_DS_ID> --mem-dbid <MEM_DB_ID> --query "..." --limit 5

Emotion/state tick:
    node skills/soul-in-sapphire/scripts/emostate_tick.js --events-dbid <EVENTS_DB_ID> --emotions-dbid <EMOTIONS_DB_ID> --state-dbid <STATE_DB_ID> --state-dsid <STATE_DS_ID> --payload-file /tmp/emostate_tick.json

Journal:
    echo '{"body":"...","source":"manual"}' | node skills/soul-in-sapphire/scripts/journal_write.js --journal-dbid <JOURNAL_DB_ID> --journal-dsid <JOURNAL_DS_ID>

Ambient recall stage:
    node skills/soul-in-sapphire/scripts/stage_ambient_recall.js --workspace <OPENCLAW_WORKSPACE> --timezone <IANA_TIMEZONE> --state-dsid <STATE_DS_ID> --journal-dsid <JOURNAL_DS_ID> --mem-dsid <MEM_DS_ID> --mem-dbid <MEM_DB_ID>

Continuity helpers:
- `state_recall.js`: pull recent state snapshots.
- `stage_ambient_recall.js`: cron-side ambient recall dice and workspace staging.
- `continuity_check.js`: distinguish stable traits from temporary drift.
- `identity_diff.js`: compare current vs proposed identity text.
- `conflict_track.js`: log unresolved tension before changing identity.

## Continuity Workflow

- Use `emostate_tick.js` when a real event changes mood, intent, stress, or need.
- Use `journal_write.js` when the day needs synthesis, not just logging.
- Search durable memory with `ltm_search.js` before guessing past decisions.
- Treat ambient recall as internal context injection, not a user-visible recall log. The script stages at most one short item under workspace `memory/soul-in-sapphire/`; conversation and heartbeat paths only read unexpired staged recall and never reroll.
- Draft proposed identity/profile text separately before editing core files.
- Prefer `identity_diff.js` before any self-description update so the change stays inspectable.

Evolution triggers worth tracking: repeated mood/intent patterns, stable preferences across sessions, recurring internal conflicts, and identity claims that survive comparison against recent memory.
