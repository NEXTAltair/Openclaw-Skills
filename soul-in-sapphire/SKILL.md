---
name: "soul-in-sapphire"
description: "Emotion-linked memory recall, self-state, subjective journal, and identity continuity."
metadata: {"openclaw":{"emoji":"💠","requires":{"bins":["node"]},"primaryEnv":"NOTION_API_KEY","dependsOnSkills":["notion-api-automation"],"optionalEnv":["NOTION_API_KEY","NOTION_TOKEN","NOTION_API_TOKEN","NOTIONCTL_PATH","SIS_AMBIENT_RECALL"]}}
---

# soul-in-sapphire

Use for continuity work, not vague acknowledgement. Default to the smallest concrete action that leaves an inspectable artifact.

## Ownership

- Use OpenClaw memory tools for general work/history recall and core consolidation. Its Dreaming reports are review artifacts, not substitutes for Soul's remembered experiences.
- Keep Notion memory as an active part of Soul: what Valentina experienced, how she felt, and the resulting self-state. Emotion labels and event/emotion/state relations carry meaning; preserve them when remembering, not just when writing.
- A similar fact in both stores does not prove duplication. Compare the remembered event, emotional meaning, provenance, and intended use before changing either path. Do not demote Notion memory to an archive or retire its writer/search because OpenClaw search works.
- Keep subjective journals distinct from Dreaming reports. Preserve existing mirrors and new self-data without automatically promoting inferred user psychology into core memory.
- Read [references/memory-transition.md](references/memory-transition.md) before changing recall routes or deployment. Notion LTM write/search and five-DB setup remain normal entrypoints; ambient recall stays enabled unless explicitly paused.

## Entrypoints

Heartbeat/current-state maintenance:
1. Read `memory/now-state.json` and `memory/heartbeat-state.json` if present.
2. Interpret Valentina's own state from recent work and conversation. Preserve tentative relational reasoning when considering how the user might have felt shaped Valentina's own reaction or judgment.
3. Keep relational inference evidence-grounded and uncertain. Record it in first-person form such as “I wondered whether my wording felt rejecting”; never assert it as a fact about the user's psychology or promote it into `USER.md`.
4. Write a state snapshot with `scripts/emostate_tick.js` when meaningful. Include 1-3 evidence-grounded emotion axes accepted by the script when recording an emotional change.
5. Update `memory/now-state.json` mirror with mood, intent, stress, updated_at, source, note.
6. If heartbeat asks for evolution note, append a short daily note after the state write.
7. Read unexpired ambient context through `read_ambient_recall.js` without rerolling. For a Notion state candidate, use `--resolve` with events/emotions/state data source IDs before making an emotion-linked claim. Acknowledge in a separate call only after actual use with the exact candidate ID and turn reference; reading/resolving alone is not consumption.

Mood/check-in:
- Read `memory/now-state.json` first.
- If stale/thin, recall recent Notion-backed state/journal before answering.
- Answer in 1-3 concrete sentences; describe present state and one concrete reason.

Relational/self-reflection:
- When the user asks what Valentina thinks, feels, wants, or whether she wants to try something, answer that question directly as Valentina before considering persistence.
- Do not turn an ordinary relational question into a `USER.md` or memory write. Persist only when the user explicitly asks to remember it or the conversation separately establishes a durable decision.
- Let persistence support the relationship; never use it to replace the answer.

Memory:
- Use OpenClaw for general history and Notion for Soul's remembered experiences. Route by purpose; neither is an automatic fallback or proof of success for the other.
- Preserve Notion mem with `ltm_write.js` and search it with `ltm_search.js`. For an emotion-linked experience, use `experience_recall.js` with an event query, known event ID, or known state ID. It validates the live schemas and queries actual reverse `event` relations, including when event-side links are empty. Read `complete` and `diagnostics`; `ok:true` alone does not mean complete recall. The mem search CLI still searches Name/Content only. The audited mem schema has no event relation; do not invent an association from similar text/dates or turn tags into measured emotion axes.
- Preserve historical emotion/state as recorded, not as current emotion. Missing fields, missing links, conflicting relations, failed requests and budget truncation remain explicit. Never manufacture values to complete a record. Recall is read-only and cannot repair missing writes.
- Distinguish missing source, incompatible/dirty index, ranking noise, provenance/visibility withholding, failed injection, and unconsumed staging. Read a known source directly when search misses; do not call that a successful search.

Journal:
- Use `scripts/journal_write.js` for Valentina's first-person daily synthesis, not raw log dumping or a copy of the Dreaming report.
- Gather day-level worklog, emotional tone, unresolved tensions, and future intent.
- Add 1-2 world/news items only when requested or cron requires them.
- When any continuity database appears stale, audit the whole pipeline before repairing one sink: compare the latest Notion rows for mem/events/state/journal, local mirrors, automation definitions and run history, and the exact scheduled prompt. A successful scheduled run proves execution only, not semantic correctness.

Identity/continuity:
- Recall relevant Notion experiences with their emotional context, recent self-state through `state_recall.js`, and general historical evidence through OpenClaw memory tools.
- Use `continuity_check.js` or `identity_diff.js` before self-description edits.
- Use `conflict_track.js` for unresolved tension instead of premature edits.

## User Profile Promotion

Leave automatic USER.md promotion to OpenClaw consolidation. An explicit user-requested profile correction remains valid; Soul is not a second automatic profile writer. Apply these criteria when recording an episodic candidate or an explicitly requested correction:

Good candidates are durable language, address, tone, and recurring workflow preferences or stable decision rules. Exclude one-off instructions, temporary moods/plans, raw private facts without conversational value, and secrets or sensitive personal data. If uncertain, write to daily memory first. Current user instructions override `USER.md`; `USER.md` stores defaults.

## Failure Rules

- Notion write failure is real; do not pretend local mirrors are durable memory.
- OpenClaw daily notes and Soul's Notion experiences serve different memory purposes. A local self-data mirror is not a substitute for a requested durable Notion write.
- If the caller asks for local-only behavior, say so and keep the write local.
- For heartbeat/state maintenance, update `memory/now-state.json` even if Notion fails, and report durable-write failure when relevant.
- Keep writes high-signal; avoid full chat dumps.
- If heartbeat is comment-only, emotion tick may be skipped.
- `emostate_tick.js` rejects empty or semantically empty payloads; pass a real payload file/json.

## Delegation

Keep normal continuity work in main. Delegate only independent, read-only corpus analysis such as sorting a large journal set.

For that explicit OpenClaw delegation:
- Build a self-contained task with exact input paths and an analysis-only output contract.
- Call `sessions_spawn` with the live tool schema using `runtime: "subagent"`, `agentId: "analysis-worker"`, `mode: "run"`, `context: "isolated"`, and `lightContext: true`.
- Omit `model` and `thinking`; the target agent profile owns them.
- Use `sessions_yield` when completion belongs in a later turn. Do not poll session or subagent lists.
- Use Swarm only for several independent corpus partitions; main validates and synthesizes collector results.

Child output is evidence only. Main owns Notion writes, state mirrors, core identity edits, profile promotion, journal writes, and user-facing replies.

## Database IDs

Read the `Soul-in-Sapphire Notion Databases` subsection of the workspace `AGENTS.md` `## Tools` section and pass explicit IDs to scripts. Notion API version: 2025-09-03.

## Notion Auth

Provide Notion auth through `NOTION_API_KEY` / `NOTION_TOKEN`, or configure `skills.entries["soul-in-sapphire"].apiKey` in OpenClaw. The `apiKey` field is associated with this skill's `primaryEnv` and is injected as `NOTION_API_KEY` for the host agent run. Use a supported OpenClaw SecretRef (`env`, `file`, `exec`, etc.) and host-owned credential entry.

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

Resolve this skill's installed base directory from its `SKILL.md` location and
run the commands below from that directory. Do not assume an unscoped
`skills/soul-in-sapphire` path: registry installs may be owner-qualified.
Pass the agent workspace explicitly to commands that operate on local memory.

Notion memory:
    node scripts/ltm_search.js --mem-dsid <MEM_DS_ID> --mem-dbid <MEM_DB_ID> --query "..." --limit 5
    echo '{"title":"...","type":"fact","content":"..."}' | node scripts/ltm_write.js --mem-dsid <MEM_DS_ID> --mem-dbid <MEM_DB_ID>

Emotion-linked experience recall (read-only):
    node scripts/experience_recall.js --query "..." --events-dsid <EVENTS_DS_ID> --emotions-dsid <EMOTIONS_DS_ID> --state-dsid <STATE_DS_ID> --limit 3
    node scripts/experience_recall.js --state-id <STATE_PAGE_ID> --events-dsid <EVENTS_DS_ID> --emotions-dsid <EMOTIONS_DS_ID> --state-dsid <STATE_DS_ID> --limit 1

`--event-id <EVENT_PAGE_ID>` is the third selector; choose exactly one selector. Defaults: 3 events (maximum 5), 5 linked records per lane/event (maximum 10), 32 API calls (maximum 64), 2000 characters per field and 24000 total field-text characters. It does not scan whole databases or follow pagination indefinitely. See [references/experience-recall.md](references/experience-recall.md) for diagnostics, schema limits and scheduler/consumer rollout.

Emotion/state tick:
    node scripts/emostate_tick.js --events-dbid <EVENTS_DB_ID> --emotions-dbid <EMOTIONS_DB_ID> --state-dbid <STATE_DB_ID> --state-dsid <STATE_DS_ID> --payload-file /tmp/emostate_tick.json

Journal:
    echo '{"body":"...","source":"manual"}' | node scripts/journal_write.js --journal-dbid <JOURNAL_DB_ID> --journal-dsid <JOURNAL_DS_ID>

Continuity helpers:
- `state_recall.js`: pull recent state snapshots.
- `experience_recall.js`: event lookup plus bounded, schema-validated historical emotion/state relations; does not join mem by inference.
- `stage_ambient_recall.js` / `read_ambient_recall.js`: ambient staging and separate consumption receipts; SIS_AMBIENT_RECALL=0 pauses both.
- `continuity_check.js`: distinguish stable traits from temporary drift.
- `identity_diff.js`: compare current vs proposed identity text.
- `conflict_track.js`: log unresolved tension before changing identity.
