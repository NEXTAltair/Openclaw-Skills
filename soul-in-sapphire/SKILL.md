---
name: soul-in-sapphire
description: "Continuity, durable memory, state tracking, journal writes, identity diffs, and mood/current-state checks for Valentina/OpenClaw. Use for memory writes/search, emotion/state ticks, heartbeat state upkeep, journal synthesis, and preserving self-state across sessions."
metadata: {"openclaw":{"emoji":"💠","requires":{"bins":["node"],"env":["NOTION_API_KEY"]},"primaryEnv":"NOTION_API_KEY","dependsOnSkills":["notion-api-automation"],"optionalEnv":["NOTIONCTL_PATH"]}}
---

# soul-in-sapphire

Use for continuity work, not vague acknowledgement. Default to the smallest concrete action that leaves an inspectable artifact.

## Entrypoints

Heartbeat/current-state maintenance:
1. Read memory/now-state.json and memory/heartbeat-state.json if present.
2. Interpret current state from recent work.
3. Write a state snapshot with scripts/emostate_tick.js when meaningful.
4. Update memory/now-state.json mirror with mood, intent, stress, updated_at, source, note.
5. If heartbeat asks for evolution note, append a short daily note after the state write.

Mood/check-in:
- Read memory/now-state.json first.
- If stale/thin, recall recent state or write a light tick.
- Answer in 1-3 concrete sentences.

Durable memory:
- Distill one high-signal item.
- Write with scripts/ltm_write.js.
- Use type decision|preference|fact|procedure|todo|gotcha.

User profile promotion:
- Update USER.md proactively only when the new fact is durable, reusable, safe, and improves future replies.
- Put uncertain items in daily memory instead.

Journal:
- Use scripts/journal_write.js for daily synthesis, not raw log dumping.

Identity/continuity:
- Recall relevant state/memory.
- Use continuity_check.js or identity_diff.js before self-description edits.
- Use conflict_track.js for unresolved tension instead of premature edits.

## Failure rules

- Notion write failure is real; do not pretend local mirrors are durable memory.
- For heartbeat/state maintenance, update memory/now-state.json even if Notion fails, and report the durable-write failure when relevant.
- Keep writes high-signal; avoid dumping full chats.

## Database IDs

Read TOOLS.md section Soul-in-Sapphire Notion Databases and pass explicit IDs to scripts.
Notion API version: 2025-09-03.

## Commands

LTM write:
    echo '{"title":"Decision: ...","type":"decision","tags":["openclaw"],"content":"...","confidence":"high"}' | node skills/soul-in-sapphire/scripts/ltm_write.js --mem-dsid <MEM_DS_ID> --mem-dbid <MEM_DB_ID>

LTM search:
    node skills/soul-in-sapphire/scripts/ltm_search.js --mem-dsid <MEM_DS_ID> --mem-dbid <MEM_DB_ID> --query "..." --limit 5

Emotion/state tick:
    node skills/soul-in-sapphire/scripts/emostate_tick.js --events-dbid <EVENTS_DB_ID> --emotions-dbid <EMOTIONS_DB_ID> --state-dbid <STATE_DB_ID> --state-dsid <STATE_DS_ID> --payload-file /tmp/emostate_tick.json

Journal:
    echo '{"body":"...","source":"manual"}' | node skills/soul-in-sapphire/scripts/journal_write.js --journal-dbid <JOURNAL_DB_ID> --journal-dsid <JOURNAL_DS_ID>

Continuity helpers are local analysis tools and do not require Notion writes:
- continuity_check.js
- identity_diff.js
- conflict_track.js
- state_recall.js

Detailed schema and legacy notes: references/full-pre-prune-2026-05-27.md.
