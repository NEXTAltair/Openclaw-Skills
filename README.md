# Openclaw-Skills

自家製カスタムスキル

## Included custom skills

- [calibre-catalog-read](calibre-catalog-read/README.md) - Calibreの検索・参照・書籍解析(メタデータは変更しない)
- [calibre-metadata-apply](calibre-metadata-apply/README.md) - 変更計画の確認・保存・適用・再読込検証
- diy-pc-ingest
- accidental-registry-publication-response
- compare-evolving-online-services
- home-assistant-causal-incident-analysis
- host-dependency-triage
- mcp-http-auth-fallback-diagnosis
- memory-first-historical-evidence-review
- oem-parts-catalog-identification
- openclaw-model-catalog-migration
- preinstall-release-audit
- runtime-config-propagation-debugging
- session-logs
- soul-in-sapphire
- trace-configuration-file-migrations
- [vsd-craft-operations](vsd-craft-operations/README.md) - VSD Craftの設定・導入・バックアップ・復旧
- [vsd-craft-plugin-development](vsd-craft-plugin-development/README.md) - Elgato互換調査、プラグイン雛形、検証・配布
- windows-usb-volume-triage
- worldlines-scenario-authoring

## Notes

- Skills installed from ClawHub are excluded via `.gitignore`.
- This repository is the authoring source. Published releases are installed as
  physical runtime snapshots under an OpenClaw workspace with
  `openclaw skills install @NEXTAltair/<slug>`.
- ClawHub installation copies files into the workspace; it does not create
  symlinks back to this repository. Plugin-owned skills may still be symlinks.
- Runtime state files (e.g. per-skill `state/runs.json`) are not tracked.
- Delegate heavy work by calling OpenClaw `sessions_spawn` directly. Do not add
  shared spawn-payload builder skills.
