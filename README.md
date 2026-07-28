# Openclaw-Skills

自家製カスタムスキル

## Included custom skills

- calibre-catalog-read
- calibre-metadata-apply
- diy-pc-ingest
- soul-in-sapphire
- rr-renamer

## Notes

- Skills installed from ClawHub are excluded via `.gitignore`.
- Runtime state files (e.g. per-skill `state/runs.json`) are not tracked.
- Delegate heavy work by calling OpenClaw `sessions_spawn` directly. Do not add
  shared spawn-payload builder skills.
