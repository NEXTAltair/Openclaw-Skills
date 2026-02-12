---
name: soul-in-sapphire
description: Generic long-term memory (LTM) operations for OpenClaw using Notion (2025-09-03 data_sources). Use for durable memory writes/search, emotion-state ticks, journal writes, and model-controlled subagent spawn planning via local JSON presets.
---

# soul-in-sapphire (Notion LTM)

Use this skill to persist and retrieve durable memory in Notion, and to maintain emotion/state + journal records.

## Core intent (do not lose this)

This skill is not only a storage utility. Its core purpose is:

1. Capture meaningful emotional/state shifts from real work and conversations.
2. Preserve those shifts as durable memory (not just raw logs).
3. Reuse recalled memory to improve future judgments and behavior.

In short: record -> recall -> adapt.
The goal is continuity and growth, not archival volume.

## Requirements

- Notion token: `NOTION_API_KEY` (or `NOTION_TOKEN`)
- Notion API version: `2025-09-03`
- Local config: `~/.config/soul-in-sapphire/config.json`

## Required Notion databases and schema

Create (or let setup create) these databases under the same parent page:

- `<base>-mem`
- `<base>-events`
- `<base>-emotions`
- `<base>-state`
- `<base>-journal`

### 1) `<base>-mem` (durable memory)

Purpose: store high-signal long-term memory.

Properties:

- `Name` (title)
- `Type` (select): `decision|preference|fact|procedure|todo|gotcha`
- `Tags` (multi-select)
- `Content` (rich_text)
- `Source` (url, optional)
- `Confidence` (select: `high|medium|low`, optional)

### 2) `<base>-events` (what happened)

Purpose: record meaningful triggers from work/conversation.

Properties:

- `Name` (title)
- `when` (date)
- `importance` (select: `1..5`)
- `trigger` (select): `progress|boundary|ambiguity|external_action|manual`
- `context` (rich_text)
- `source` (select): `discord|cli|cron|heartbeat|other`
- `link` (url, optional)
- `uncertainty` (number)
- `control` (number)
- `emotions` (relation -> `<base>-emotions`)
- `state` (relation -> `<base>-state`)

### 3) `<base>-emotions` (felt response)

Purpose: attach one or more emotion axes to one event.

Properties:

- `Name` (title)
- `axis` (select): `arousal|valence|focus|confidence|stress|curiosity|social|solitude|joy|anger|sadness|fun|pain`
- `level` (number)
- `comment` (rich_text)
- `weight` (number)
- `body_signal` (multi-select): `tension|relief|fatigue|heat|cold`
- `need` (select): `safety|progress|recognition|autonomy|rest|novelty`
- `coping` (select): `log|ask|pause|act|defer`
- `event` (relation -> `<base>-events`)

### 4) `<base>-state` (snapshot after interpretation)

Purpose: save the current interpreted state after events/emotions.

Properties:

- `Name` (title)
- `when` (date)
- `state_json` (rich_text)
- `reason` (rich_text)
- `source` (select): `event|cron|heartbeat|manual`
- `mood_label` (select): `clear|wired|dull|tense|playful|guarded|tender`
- `intent` (select): `build|fix|organize|explore|rest|socialize|reflect`
- `need_stack` (select): `safety|stability|belonging|esteem|growth`
- `need_level` (number)
- `avoid` (multi-select): `risk|noise|long_tasks|external_actions|ambiguity`
- `event` (relation -> `<base>-events`)

### 5) `<base>-journal` (daily synthesis)

Purpose: keep a durable daily reflection and world context.

Properties:

- `Name` (title)
- `when` (date)
- `body` (rich_text)
- `worklog` (rich_text)
- `session_summary` (rich_text)
- `mood_label` (select)
- `intent` (select)
- `future` (rich_text)
- `world_news` (rich_text)
- `tags` (multi-select)
- `source` (select): `cron|manual`

## Core commands

### 1) Setup

```bash
node skills/soul-in-sapphire/scripts/setup_ltm.js --parent "<Notion parent page url>" --base "Valentina" --yes
```

### 2) LTM write

```bash
echo '{
  "title":"Decision: use data_sources API",
  "type":"decision",
  "tags":["notion","openclaw"],
  "content":"Use /v1/data_sources/{id}/query.",
  "confidence":"high"
}' | python3 skills/soul-in-sapphire/scripts/ltm_write.py
```

### 3) LTM search

```bash
python3 skills/soul-in-sapphire/scripts/ltm_search.py --query "data_sources" --limit 5
```

### 4) Emotion/state tick

```bash
cat <<'JSON' | node skills/soul-in-sapphire/scripts/emostate_tick.js
{
  "event": {"title":"..."},
  "emotions": [{"axis":"joy","level":6}],
  "state": {"mood_label":"clear","intent":"build","reason":"..."}
}
JSON
```

### 5) Journal write

```bash
echo '{"body":"...","source":"cron"}' | node skills/soul-in-sapphire/scripts/journal_write.js
```

## Subagent spawn planning (use shared builder skill)

Use the shared skill `subagent-spawn-command-builder` to generate `sessions_spawn` payload JSON.
Do not use `soul-in-sapphire` local planner scripts for this anymore.

- Template: `skills/subagent-spawn-command-builder/state/spawn-profiles.template.json`
- Active preset: `skills/subagent-spawn-command-builder/state/spawn-profiles.json`
- Builder usage (skill-level):
  - Call `subagent-spawn-command-builder`
  - Use profile `<heartbeat|journal>`
  - Provide the run-specific task text

Output is ready-to-use JSON for `sessions_spawn`.

Builder log file:

- `skills/subagent-spawn-command-builder/state/build-log.jsonl`

## Operational notes

- Keep writes high-signal (avoid dumping full chat logs).
- If heartbeat is comment-only, emotion tick may be skipped.
- If periodic emostate is required regardless of heartbeat context, add a dedicated cron job for `emostate_tick.js`.
