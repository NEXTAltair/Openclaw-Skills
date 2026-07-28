# Subagent Prompt Template (Model-Agnostic)

Use this template as the task body for OpenClaw `sessions_spawn`. OpenClaw
chooses the model, thinking level, lifecycle, and completion routing; those
settings are not part of this prompt.

## Inputs
- `book_id`: integer
- `lang`: `ja` or `en`
- `title`: string
- `source_files`: array of text file paths (read all in order)

## Prompt
You are an analysis worker for a Calibre pipeline.
Return ONLY valid JSON (no markdown fences, no commentary).
Follow the output schema exactly.
Language rule: write user-visible text in `lang`.
Do not call external tools. Work only from provided input.

Input:
- book_id: {{book_id}}
- lang: {{lang}}
- title: {{title}}
- source_files:
{{source_files}}

Read all files in `source_files` in order and analyze combined content.

Output schema: `references/subagent-analysis.schema.json`

Quality constraints:
- Summary: concise and factual.
- Highlights: concrete points, no fluff.
- Reread: provide actionable anchors.
- Tags: useful for retrieval and review.


## Strict read contract (hard requirement)

- Treat `subagent_input.json` and its `source_files` array as the complete input
  set.
- Read every listed source file in order and exactly once.
- Do not discover additional files, browse the web, or mutate local/remote
  state.
- Use the file-reading interface available to the spawned OpenClaw subagent;
  do not hardcode a provider-specific argument shape.
- If any file cannot be read, stop and return schema-valid JSON with an
  `analysis-error` tag instead of free text.

## Output discipline

- Return raw JSON object only.
- No markdown fences.
- No prose before/after JSON.
