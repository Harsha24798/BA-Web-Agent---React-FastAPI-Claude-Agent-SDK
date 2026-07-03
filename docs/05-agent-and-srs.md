# 05 — Agent & SRS Generation

## Claude Agent SDK basics

Package: `claude-agent-sdk` (Python). It wraps the Claude Code engine (needs Node + the Claude Code
CLI). Core API:

```python
from claude_agent_sdk import query, ClaudeAgentOptions

options = ClaudeAgentOptions(
    system_prompt=master_prompt_text,      # our verbatim admin master prompt (+ appended contract)
    allowed_tools=enabled_tool_keys,       # from agent_tools registry, e.g. ["Read","Glob","Grep"]
    cwd=str(workspace_dir),                # per-project workspace with extracted .md docs
    model=chosen_model_id,                 # from the user's model pick
    include_partial_messages=True,         # stream token deltas → drives the live progress feed
    # output_format / structured output: see "Getting srs.json" below
)

async for message in query(prompt=run_instruction, options=options):
    handle(message)   # map message types → progress phases; capture the final result
```

`query()` yields messages (assistant text blocks, tool-use blocks, partial stream events, and a final
result). We consume the stream to (a) drive progress and (b) capture the SRS output.

## What the agent is told

The **prompt** assembled in `agent/prompt.py` has three clearly-delimited parts:

1. **Master prompt (verbatim)** — the active `agent_prompts.content`, used **exactly as the admin
   wrote it**. The code does not rewrite or override it. This defines the agent's behavior, quality
   bar, tone, and how to analyze the documents.
2. **SRS template (injected)** — the active `templates.content` (Markdown), given as *"the SRS
   structure you must follow."* The master prompt refers to it.
3. **Output contract (appended)** — a short, fenced instruction: *"Produce the SRS as JSON matching
   this schema"* + the contents of `agent/srs_schema.json`. This is a **format requirement**, not a
   behavior change, and is the only thing the code adds on top of the master prompt.

The run `prompt` (user turn) tells the agent to read all documents in `context/` (via `INDEX.md`),
analyze them, and produce the SRS per the template + schema.

## Getting `srs.json` reliably

Preferred: request **structured output** so the SDK returns JSON shaped by `srs_schema.json`. The
server then validates it with `jsonschema`.

Fallback (if structured output isn't used/available): instruct the agent to emit a single fenced
```json block as its final answer; the server extracts and validates it.

Either way: **validation is mandatory.** If the JSON is invalid, the job **fails** with a clear error
rather than saving garbage. `agent/srs_schema.json` is the contract.

## `srs.json` contract

A stable, versioned, machine-first document for the downstream BA Agent — **not** a dump of the
Markdown.

```jsonc
{
  "schema_version": "1.0",
  "srs_id": "<uuid>",
  "project": { "id": "...", "name": "...", "generated_at": "...", "srs_version": 2 },
  "source": {
    "documents": [ { "filename": "brief.pdf", "content_hash": "...", "type": "pdf" } ],
    "template_id": "...", "template_version": 3,
    "model": "claude-opus-4-8", "sdk_session_id": "..."
  },
  "meta": { "domain": "Odoo", "modules": ["sale", "stock"], "odoo_version": "17" },
  "requirements": [
    {
      "id": "FR-001",                                  // stable ID across versions
      "type": "functional",                            // functional|non_functional|constraint|assumption
      "title": "...", "description": "...",
      "priority": "must",                              // must|should|could|wont (MoSCoW)
      "odoo_module": "sale",
      "actors": ["Sales Manager"],
      "acceptance_criteria": ["..."],
      "dependencies": ["FR-002"],
      "source_refs": [ { "document": "brief.pdf", "quote": "..." } ],  // traceability
      "status": "proposed"
    }
  ],
  "non_functional": [ /* {id: "NFR-001", category, description, metric} */ ],
  "actors": [ { "id": "A1", "name": "Sales Manager", "role": "..." } ],
  "glossary": [ { "term": "...", "definition": "..." } ],
  "open_questions": [ { "id": "Q1", "question": "...", "blocking": true } ],
  "traceability": [ { "requirement_id": "FR-001", "source_document": "brief.pdf", "confidence": 0.9 } ]
}
```

**Why these fields matter**
- **Stable IDs** (`FR-001`) let the downstream agent track requirements across regenerations.
- **`source_refs`** tie every requirement to the originating document + quote — audits hallucination.
- **`open_questions`** capture ambiguity explicitly instead of the agent inventing details.
- **Odoo fields** (`odoo_module`, `odoo_version`) make the downstream Odoo dev agent's job far easier.

`srs.md` is **rendered from** `srs.json` so the human doc and the machine doc never diverge.

## Model selection & access

- `llm_models` holds the available models (admin toggles `is_enabled`, sets `is_default`).
- `user_models` optionally restricts a user to specific models. No rows → all enabled models allowed.
- `GET /models` returns the caller's allowed list; **ModelSelect.tsx** shows it before generation.
- `POST /generate` accepts `model_id`; the server **re-validates** the caller is allowed it (never
  trust the client), records it on the job + `srs_versions.model_id` + `srs.json.source.model`, and
  passes it as `ClaudeAgentOptions(model=...)`.

## Output writing & versioning

Handled in `services/srs_output.py` — see [phase-4](phases/phase-4-agent-generation.md):
1. Validate JSON against schema (fail job if invalid).
2. Render `srs.md` from JSON (Markdown).
3. Build `srs.docx` (`python-docx`) and `srs.pdf` (WeasyPrint/reportlab).
4. Write to a temp dir, then **atomic move** into `BA Output/<slug>/v<N>/` (immutable).
5. Update `srs_versions`, project pointer, `srs_status='generated'`, `source_docs_hash`.
6. Trigger the **srs_generated** email to the job's `triggered_by` user.
