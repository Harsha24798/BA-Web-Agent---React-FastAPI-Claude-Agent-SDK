# 09 — Agent Configuration (Master Prompt · Tools · Template)

The admin controls **three independent things** that shape the agent. They are kept **separate** so
editing one never clobbers another, and each is **versioned/auditable**.

| Config | Table | What it is | How it's used |
|--------|-------|-----------|---------------|
| **SRS Template** | `templates` | Markdown describing the SRS document's sections/structure | Injected into the prompt as "the structure to follow" |
| **Agent Master Prompt** | `agent_prompts` | The system prompt / behavior of the agent | Used **verbatim** as `system_prompt` |
| **Tools Access** | `agent_tools` | Which tools the agent may use | Enabled keys → `allowed_tools` |

## 1. Agent Master Prompt (used verbatim — not overridden)

- The **active** `agent_prompts` row's `content` becomes the SDK `system_prompt` **exactly as
  written**. The code does **not** rewrite, wrap, or override the admin's instructions — the agent
  does exactly what the master prompt says.
- The **only** addition is a clearly-delimited **output contract** appended after the master prompt:
  *"Return the SRS as JSON matching this schema: <srs_schema.json>."* This is a machine-format
  requirement so the pipeline can validate and render outputs — it does not change the agent's
  analytical behavior. This separation is deliberate and documented so expectations are clear.
- **Versioning:** saving edits creates a new version and flips `is_active`. Old versions are kept;
  the admin can **roll back** to any previous version.
- **Editing UI:** `AdminMasterPrompt.tsx` uses the Markdown editor with **Edit + Preview** so the
  admin sees a readable, formatted view while writing.

### Suggested default master prompt (seeded)
A senior Odoo business-analyst persona: read every document in `context/`, cross-reference them,
extract functional & non-functional requirements, map them to Odoo modules, assign MoSCoW priority,
record traceability to source quotes, and list open questions instead of inventing details. The
default is a starting point — the admin owns it from then on.

## 2. Tools Access (CRUD + enable/disable)

- `agent_tools` is a registry the admin fully manages: **add**, **edit**, **delete**, and toggle
  **enable/disable** each tool.
- On generation, the **enabled** `tool_key`s become `ClaudeAgentOptions.allowed_tools`. Disabled or
  deleted tools are simply not passed to the agent.
- **Seed defaults:** `Read`, `Glob`, `Grep` (enabled) — enough for the agent to discover and read the
  extracted documents in its workspace.
- Future MCP tools (e.g. a `get_document` or `list_requirements` tool for the downstream handoff) can
  be registered here by `tool_key` once implemented.
- **Editing UI:** `AdminTools.tsx` is a table with inline add/edit/delete + enable switches. Changes
  stamp `updated_by`/`updated_at`.

> Guardrail: at least one read tool must stay enabled, otherwise the agent can't read the documents.
> The UI warns if the admin disables all reading tools.

## 3. SRS Template

- The **active** `templates` row's Markdown is injected into the prompt as the required SRS structure.
- Versioned like the master prompt (save → new version, rollback supported).
- **Editing UI:** `AdminTemplate.tsx` — same Markdown editor (Edit + Preview).

## How they combine at generation time (`agent/prompt.py`)

```
system_prompt = active_master_prompt.content                      # verbatim
             + "\n\n---\nSRS STRUCTURE TO FOLLOW:\n"              # separator
             + active_template.content                            # injected template
             + "\n\n---\nOUTPUT CONTRACT:\n"                      # separator
             + "Return JSON matching this schema:\n" + srs_schema # appended contract

allowed_tools = [t.tool_key for t in agent_tools if t.is_enabled]
model         = user's chosen model
cwd           = project workspace (extracted .md docs)
```

The clear separators keep the three configs distinct and make it obvious to the agent (and to a
human reading logs) which part is behavior, which is structure, and which is output format.

## Markdown editor (shared component)

`components/MarkdownEditor.tsx` wraps `@uiw/react-md-editor`:
- **Edit / Preview / split** modes; live preview renders the Markdown as it will read.
- Used by `AdminMasterPrompt`, `AdminTemplate` (and available elsewhere).
- Save button posts a new version; a version-history dropdown lists prior versions with a **Restore**
  action.
