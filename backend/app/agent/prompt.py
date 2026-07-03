"""Assemble the agent system prompt (master prompt verbatim + template + output contract)."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AgentPrompt, AgentTool, Template

_SCHEMA_PATH = Path(__file__).resolve().parent / "srs_schema.json"


def load_schema() -> dict:
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def active_master_prompt(db: Session) -> str:
    row = db.scalar(select(AgentPrompt).where(AgentPrompt.is_active == True))  # noqa: E712
    return row.content if row else ""


def active_template(db: Session) -> Template | None:
    return db.scalar(select(Template).where(Template.is_active == True))  # noqa: E712


def enabled_tool_keys(db: Session) -> list[str]:
    rows = db.scalars(
        select(AgentTool.tool_key).where(AgentTool.is_enabled == True)  # noqa: E712
        .order_by(AgentTool.sort_order)
    )
    return list(rows)


def build_system_prompt(db: Session) -> str:
    """Master prompt VERBATIM + injected template + appended output contract."""
    master = active_master_prompt(db)
    template = active_template(db)
    schema = json.dumps(load_schema(), indent=2)

    parts = [master.strip()]

    if template:
        parts.append(
            "\n\n---\n# SRS STRUCTURE TO FOLLOW\n"
            "(This is the required document structure. Follow it.)\n\n"
            + template.content.strip()
        )

    parts.append(
        "\n\n---\n# OUTPUT CONTRACT (format requirement)\n"
        "When you are finished analyzing the documents, output the SRS as a SINGLE JSON object that "
        "validates against the JSON Schema below. Output the JSON inside one ```json fenced code "
        "block as your final message, and nothing after it. Use stable requirement IDs like "
        "FR-001 / NFR-001, MoSCoW priorities (must/should/could/wont), and include source_refs "
        "(document + quote) for traceability. Do not invent requirements without a source.\n\n"
        "```json-schema\n" + schema + "\n```"
    )
    return "\n".join(parts)


def build_run_prompt() -> str:
    return (
        "Read every document in the `context/` folder (start with context/INDEX.md), analyze them "
        "thoroughly, and produce the SRS as specified by your instructions and the output contract. "
        "Begin by listing and reading the documents."
    )
