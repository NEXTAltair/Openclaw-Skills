# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a custom **OpenClaw skills repository** containing self-contained agent skill packages. Each skill directory is independently installable via ClawHub. Skills installed from ClawHub are excluded from git via `.gitignore`.

**Custom (tracked) skills:** see the "Included custom skills" list in `README.md`.
Every tracked top-level skill directory must appear there. Published skills are released
to ClawHub as `@NEXTAltair/<slug>` (the slug can differ from the directory name, e.g.
`openclaw-model-catalog-migration` is published as `model-catalog-migration`).

## Skill Structure Convention

Every skill must follow this layout:

```
skill-name/
├── SKILL.md               # Required: YAML frontmatter + markdown instructions
├── README.md              # Optional: detailed docs (often Japanese)
├── scripts/               # Entry points: *.mjs (Node ESM), *.py, *.sh, *.ps1
├── state/                 # Runtime state — NOT tracked in git (gitignored)
├── references/            # Static docs, JSON schemas, prompt templates
└── assets/                # Example configs and test data
```

## SKILL.md Frontmatter

All SKILL.md files use this YAML schema:

```yaml
---
name: kebab-case-name          # Must match directory name
description: "Short description"
metadata:
  openclaw:
    requires:
      bins: [calibredb, jq]    # External CLI dependencies
      env: [NOTION_API_KEY]    # Required environment variables
    primaryEnv: NOTION_API_KEY # Main credential env var
    dependsOnSkills: []        # Other skill names this depends on
    localWrites: []            # Local file paths written to
    modifiesRemoteData: []     # External systems modified
---
```

## Scripting Conventions

- **Node.js**: Prefer ESM (`.mjs`, or `.js` with `"type": "module"` in the skill's `package.json`). Some existing `.js` scripts are CommonJS (`diy-pc-ingest`). Tests run with `node --test`
- **Python**: Invoke as `python3 scripts/foo.py` (not bare `python`); tests run with `python3 -m unittest discover -s tests`
- **Bash**: Lightweight API glue (`curl` + `jq`); used for Home Assistant, Sonos
- **PowerShell**: Windows-only skills

## Execution Model Patterns

**Synchronous** — single turn, immediate result (lightweight skills like `homeassistant-skill`)

**Async with state** — heavy skills split into start → subagent → completion:
1. Main agent validates input, writes `state/runs.json`, and calls OpenClaw
   `sessions_spawn` directly
2. Subagent does heavy work, updates `state/runs.json`
3. Main agent consumes the runtime completion event and returns results

Do not build a shared spawn payload. `sessions_spawn` publishes and validates
its own current schema.

**Dry-run / Apply gates** — Default is dry-run (no side effects). Apply requires explicit `--apply` flag or user confirmation. All write/delete operations must follow this pattern.

## Credential and Configuration Handling

- **認証情報** (API keys, passwords): `~/.openclaw/.env` の環境変数経由（gateway起動時にロード）
- **ユーザー設定** (サーバーURL, DB IDなど): ワークスペースの `AGENTS.md` `## Tools` セクションに記載。AIが読み取ってCLI引数でスクリプトに渡す
- **モデル設定**: OpenClawのagent profileで管理する
- Never commit credentials; never hardcode tokens in scripts

## State Files

`state/runs.json` tracks async task state and is gitignored. The `state/` directory is for runtime data only.

## Skill Interdependencies

```
diy-pc-ingest          ─depends on──▶  notion-api-automation (ClawHub)
soul-in-sapphire        ─depends on──▶  notion-api-automation (ClawHub)
```

## Adding a New Skill

1. Create `skill-name/SKILL.md` with complete frontmatter
2. Put scripts in `skill-name/scripts/`
3. ユーザー固有の設定値はスクリプト内に保存せず、workspaceの`AGENTS.md` `## Tools`セクション参照 + CLI引数で渡す設計にする
4. Do NOT add the skill name to `.gitignore` (that's only for ClawHub-installed skills)
5. Add the skill name to `README.md` under "Included custom skills"
