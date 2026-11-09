---
name: "diy-pc-ingest"
description: "Ingest pasted PC parts receipts or specs into Notion DIY_PC tables with classification, enrichment, verified upsert, and provisional records when serials are unknown."
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["NOTION_API_KEY"]},"primaryEnv":"NOTION_API_KEY"}}
---

# diy-pc-ingest

## Setup (required)

This skill is intended to be shared. Do **not** hardcode your Notion IDs or token in the skill.

Resolve and read the installed Notion dependency before execution:

- Its model-facing skill name is `notion`; its ClawHub package slug is
  `notion-api-automation`. Read it with `skills_read(name="notion")`.
  If unavailable, use `skills_search` to locate an eligible Notion CLI skill and
  read its complete instructions. A slug or directory name is not a skill name.
- Use the returned `SKILL.md` location to resolve `scripts/notionctl.mjs` on the
  same execution host as this skill. Do not assume both skills share a parent
  directory: workspace, grouped, managed, extra and revision paths can differ.
- Pass that absolute CLI path with `--notionctl-path` (preferred) or set the
  non-secret `NOTIONCTL_PATH` environment variable. Explicit paths take priority
  over the legacy sibling/scoped-root fallback; invalid explicit paths fail
  without searching another route.
- Check `node <resolved-notionctl-path> --help` for `api`, `--compact`,
  `--method`, `--path` and `--body-json`. The API bridge must return
  `{ok:true,result:...}`. Discovery/metadata does not guarantee this capability.
  Do not reinstall a working dependency just because this skill was updated.

Only if the dependency is missing, use OpenClaw's install path for the intended
agent (replace `<agent-id>` with the configured agent, not a human profile ID):

```bash
openclaw skills install @tristanmanchester/notion-api-automation --agent <agent-id>
```

OpenClaw does not enforce cross-skill dependencies or optional environment
variables through `dependsOnSkills`, `optionalEnv` or `network` metadata fields.
The checks above and the data-flow rules below are part of this skill's procedure.

1) Read the `DIY-PC Notion Targets` table in the workspace `AGENTS.md` `## Tools` section for the data_source_id and database_id values for each target. Pass them as explicit CLI arguments:
- `--pcconfig-dsid`, `--pcconfig-dbid`
- `--pcinput-dsid`, `--pcinput-dbid`
- `--storage-dsid`, `--storage-dbid`
- `--enclosure-dsid`, `--enclosure-dbid`

2) Provide Notion auth for `notion-api-automation` (`notionctl`):
- env: `NOTION_API_KEY` (legacy shell/service env remains supported)
- OpenClaw config: `skills.entries["diy-pc-ingest"].apiKey`

`apiKey` is associated with `metadata.openclaw.primaryEnv` and is injected as
`NOTION_API_KEY` for the host agent run. Use an
OpenClaw SecretRef supported by the local gateway (`env`, `file`, `exec`, etc.).
Do not hardcode provider-specific secret paths in this shared skill.

Example SecretRef shape:

```json5
{
  skills: {
    entries: {
      "diy-pc-ingest": {
        apiKey: { source: "exec", provider: "your_notion_secret_provider", id: "value" }
      }
    }
  }
}
```

Notes:
- The dependency must use Notion-Version `2025-09-03`.
- `NOTIONCTL_PATH` is an optional, non-secret path override. The dependency CLI
  can also accept `NOTION_TOKEN` / `NOTION_API_TOKEN`, but this skill's OpenClaw
  readiness gate still requires `NOTION_API_KEY` or the configured `apiKey`.
- Auth injection is scoped to the host agent run, not automatically to a
  sandbox or a different node. Use the configured execution host and credential
  delivery; do not copy secrets across hosts to make a missing gate pass.
- Preserve host-injected auth/proxy environment;
  never extract credentials into chat, commands, logs or shell variables.

## Data flow disclosure

- Local input: pasted receipts/spec notes are parsed locally.
- External enrichment (optional): `web_search`/`web_fetch` may send partial product text to external web providers.
- Notion write path: records are queried/upserted via `notion-api-automation/scripts/notionctl.mjs`.

Security rules:
- If user does not want external enrichment, skip `web_search`/`web_fetch` and proceed with local extraction only.
- Use minimal-scope Notion integration permissions (only target DIY_PC data sources).

## Canonical Notion targets

Use **data_sources** endpoints for schema/query, and **pages** endpoint for row creation.

IDs are documented in the `DIY-PC Notion Targets` table in the workspace `AGENTS.md` `## Tools` section. Pass them as CLI arguments at runtime. See [references/notion-ids.md](references/notion-ids.md) for lookup and parent-ID rules.

## Workflow (A: user pastes raw text)

1) **Read the pasted text** and decide target table per item:
   - **エンクロージャー**: USB/RAID/HDDケース/ドック、ベイ数、JAN/型番、"安全な取り外し"表示名。
   - **ストレージ**: HDD/SSD/NVMe/SATA/容量/シリアル/健康状態。
   - **PCConfig**: CPU/GPU/RAM/PSU/MB/ケース/冷却/NIC/キャプチャ等。

2) **Extract fields** (best-effort). Prefer Japanese column names as they exist in each table.

3) **Enrich specs using web_search/web_fetch** when it reduces user work (e.g., bay count, interface, capacity, form factor). Keep it minimal; don't overfill.

4) **Ask follow-up questions** only for fields needed to avoid ambiguity or bad joins.
   - **ストレージ / PCInput**: Serial missing is allowed. Omit it and proceed with
     a provisional identity; do not ask solely to obtain a serial. Missing,
     null, blank, `不明`, `シリアル不明`, `未確認`, `未取得`, `unknown`, `n/a`
     and `-` are treated as unknown, not shared serial keys.
   - **エンクロージャー**: ベイ数 or USB/Thunderbolt/LAN unclear → ask.
   - **PCConfig**: Identifier/型番 missing but needed to match existing row → ask.
- If a key collides with multiple rows, do not write; ask user.

5) **Plan using live reads** with `scripts/notion_apply_records.js --plan` (`--dry-run` is an alias; no mode also defaults to plan). Feed JSONL on stdin and explicit target IDs. Plan covers direct updates, upserts, archive and storage mirrors without write requests. Inspect each target/key/action, before/after, and blocked diagnostics. Missing keys/schema fields or multiple matches block the entire apply preflight; resolve them before applying.

6) **Review scope** against the user's existing authorization. Proceed without redundant approval for already-authorized changes. Ask only for unresolved identity/values or a concrete operation outside that scope, especially archive/overwrite. A plan is not authorization.

7) **Apply** the same JSONL with `--apply` and the same IDs. Apply re-reads the current ledger, preflights the whole batch, and rechecks each operation before writing. It fills empty fields unless `overwrite=true`; identical values are skipped even with overwrite. The plan is a preview, not an immutable transaction: do not run concurrent ingests for the same keys.

8) **Inspect results, verify, then record success**. Only `status:applied` counts as success after page read-back; `skipped` is unchanged. Keep `blocked`, `failed` and `not_executed` separate. Exit 1 / `ok:false` means the batch is not fully successful. A failed write/read-back can have an unverified remote effect; retain its ID if returned and reconcile before retrying. Never mark daily memory/progress complete before inspecting results.

9) **Stop on rejection** from either CLI or connector (`isError`, `ok:false`, exception or tool refusal). Do not switch tools/auth/routes to bypass it. Report only the returned reason; unknown causes stay unknown. For authorized resumption after the refusal/blocker is resolved, search/read the current original and replacement rows again, plan only pending changes, and avoid recreating already-created rows. Report skill implementation/deployment separately from the original ledger task's completion.

## Commands

Run from the installed skill directory identified by `SKILL.md` (including owner-qualified paths). Use the dependency path resolved in Setup. Keep private input and plan output outside the repository.

```bash
node scripts/notion_apply_records.js --plan --notionctl-path "<RESOLVED_NOTIONCTL_PATH>" --storage-dsid <STORAGE_DS_ID> --storage-dbid <STORAGE_DB_ID> < records.jsonl
node scripts/notion_apply_records.js --apply --notionctl-path "<RESOLVED_NOTIONCTL_PATH>" --storage-dsid <STORAGE_DS_ID> --storage-dbid <STORAGE_DB_ID> < records.jsonl
```

Add `--pcconfig-dsid` / `--pcconfig-dbid` for mirrors. The script reads no config file and does not auto-discover database IDs.

## Upsert keys (rules)

- **ストレージ**: Use a known `シリアル` as the exact primary key. When unknown,
  use exact `Name` + provided `購入日` / `価格(円)` as the provisional key.
  Search only unknown-serial candidates within those descriptive matches. A later
  known serial first searches its exact key, then the same provisional fallback
  to fill the existing row. Never join a different known serial by title.
- **エンクロージャー**: `取り外し表示名` (exact) else title/name.
- **PCConfig**: `(Name + Purchase Date)` を複合キーとして扱う（exact）。重複ヒット時は書き込まず質問。
- **PCInput**: Use `(型番 + Serial + 名前)` when Serial is known. Otherwise use
  `(型番 + 名前)` + provided `購入日` / `価格(円)` against unknown-Serial rows.
  A later Serial can post-fill that provisional row without creating another.
- Required descriptive keys must be present; serial itself is optional for
  storage and PCInput. Use a verified `page_id` for direct post-fill if identity
  remains unresolved. Exact queries follow pagination; incomplete queries block writes.
- If a key collides with multiple rows, do not write; ask user.
- Two serial-less items with the same provisional identity in one batch block
  preflight rather than being silently folded together. Combine repeated edits
  to one item into one record; give separate physical units distinct item names
  (e.g. a bay/unit suffix), purchase details or verified page IDs. Do not invent
  fake serial numbers. After a serial is filled, use it or the recorded page ID.

## JSONL input format for the apply script

Each line is a JSON object:

```json
{"target":"enclosure","title":"RATOC RS-EC32-R5G","properties":{"種別":"USBケース","接続":"USB","ベイ数":2,"普段つないでるPC":"RECRYZEN","購入日":"2026-01-18","購入店":"PCワンズ","価格(円)":8977,"取り外し表示名":"RS-EC32-R5G","メモ":"JAN: 4949090752191"}}
```

Optional control fields (for cleanup / manual fixes):
- `page_id` (or `id`): update this Notion page directly (bypasses upsert matching)
- `archive: true`: archive an existing matched or directly addressed page; never creates a row. An already archived direct page is skipped.
- `overwrite: true`: allow overwriting existing values (including clearing with null)
  - Unknown serial labels/blank input never erase a known serial. Only explicit
    `null` together with `page_id`/`id` and `overwrite:true` clears that identity field.

Optional behavior flags:
- `mirror_to_pcconfig: true` (only for `target=storage`): also create/update a `pcconfig` row for the installed component.
  - requires: `現在の接続先PC`, `購入日`, `Name`
  - Unknown serials leave mirrored `Spec` empty so a later real serial can fill it.

Targets: `enclosure | storage | pcconfig | pcinput`

Serial-less storage example (registration does not require a serial question):

```json
{"target":"storage","properties":{"Name":"Example SSD","購入日":"2026-10-05","価格(円)":5000,"メモ":"シリアル未確認"}}
```

Property value encoding:
- select/status: string name
- rich_text: string
- number: number
- date: `YYYY-MM-DD`
- checkbox: boolean
- relation: array of page_ids (advanced; avoid unless needed)

## Notes

- Always use Notion-Version `2025-09-03`.
- Prefer `POST /v1/data_sources/{id}/query` over `/databases/{id}/query`.
- Relation schema updates require `relation.data_source_id` (not database_id).


## Note (implementation)
- JS implementation is the default: `scripts/notion_apply_records.js`
- Legacy Python implementation is reference-only: `scripts/_deprecated/notion_apply_records.py`. Do not use it for plan/apply or as a rejection fallback.


## Notion tooling
- Primary ingestion path is `scripts/notion_apply_records.js`.
- For diagnostics, use the actual CLI path obtained by reading the installed
  `notion` skill. Never substitute a fixed `skills/<slug>/...` path or use a
  different credential/tool route after rejection.
