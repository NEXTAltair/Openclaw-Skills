# Openclaw-Skills

自家製カスタムスキル

## Included custom skills

- calibre-catalog-read
- calibre-metadata-apply
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
- windows-usb-volume-triage
- worldlines-scenario-authoring

## Notes

- Skills installed from ClawHub are excluded via `.gitignore`.
- This repository is the authoring source. Runtime copies are installed into an
  OpenClaw workspace with `openclaw skills install <skill-dir> --as <name>`.
- Runtime state files (e.g. per-skill `state/runs.json`) are not tracked.
- Delegate heavy work by calling OpenClaw `sessions_spawn` directly. Do not add
  shared spawn-payload builder skills.
