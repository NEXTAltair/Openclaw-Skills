# Notion target IDs

Read target IDs from the local workspace `AGENTS.md` Tools section. Pass them to the JS CLI as `--<target>-dsid` and `--<target>-dbid`; it does not read config.json.

To locate IDs, use the configured Notion integration to search tables and read their data sources. Use `data_source_id` for query/schema and creation parents. `database_id` is retained as an explicit target argument and for validating older page-parent responses.

Keep real IDs and records outside the public repository. `config.example.json` is a reference for the legacy Python implementation only, not an active JS configuration. Provide auth through the host's protected SecretRef path; never paste secret values into commands or chat.
