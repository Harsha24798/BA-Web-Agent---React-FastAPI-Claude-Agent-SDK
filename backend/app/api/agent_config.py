"""Admin: agent master prompt (versioned), SRS template (versioned), tools registry."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db.database import get_db
from app.db.models import AgentPrompt, AgentTool, Template, User
from app.schemas import (
    ContentIn,
    MessageOut,
    PromptVersionOut,
    ToolIn,
    ToolOut,
    ToolUpdateIn,
)

router = APIRouter(prefix="/admin", tags=["agent-config"], dependencies=[Depends(require_admin)])


# ---------------- master prompt ----------------
@router.get("/master-prompt")
def get_master_prompt(db: Session = Depends(get_db)):
    active = db.scalar(select(AgentPrompt).where(AgentPrompt.is_active == True))  # noqa: E712
    history = db.scalars(select(AgentPrompt).order_by(AgentPrompt.version_no.desc()))
    return {
        "active": PromptVersionOut.model_validate(active) if active else None,
        "history": [PromptVersionOut.model_validate(p) for p in history],
    }


@router.post("/master-prompt", response_model=PromptVersionOut)
def save_master_prompt(body: ContentIn, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    for p in db.scalars(select(AgentPrompt).where(AgentPrompt.is_active == True)):  # noqa: E712
        p.is_active = False
    next_no = (db.scalar(select(func.max(AgentPrompt.version_no))) or 0) + 1
    row = AgentPrompt(content=body.content, version_no=next_no, is_active=True,
                      updated_by=admin.id, updated_at=datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    return PromptVersionOut.model_validate(row)


@router.post("/master-prompt/{version_id}/restore", response_model=PromptVersionOut)
def restore_master_prompt(version_id: str, db: Session = Depends(get_db)):
    target = db.get(AgentPrompt, version_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    for p in db.scalars(select(AgentPrompt).where(AgentPrompt.is_active == True)):  # noqa: E712
        p.is_active = False
    target.is_active = True
    db.commit()
    return PromptVersionOut.model_validate(target)


# ---------------- SRS template ----------------
@router.get("/template")
def get_template(db: Session = Depends(get_db)):
    active = db.scalar(select(Template).where(Template.is_active == True))  # noqa: E712
    history = db.scalars(select(Template).order_by(Template.version_no.desc()))
    return {
        "active": PromptVersionOut.model_validate(active) if active else None,
        "history": [PromptVersionOut.model_validate(t) for t in history],
    }


@router.post("/template", response_model=PromptVersionOut)
def save_template(body: ContentIn, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    for t in db.scalars(select(Template).where(Template.is_active == True)):  # noqa: E712
        t.is_active = False
    next_no = (db.scalar(select(func.max(Template.version_no))) or 0) + 1
    row = Template(name="SRS Template", content=body.content, version_no=next_no,
                   is_active=True, updated_by=admin.id, updated_at=datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    return PromptVersionOut.model_validate(row)


@router.post("/template/{version_id}/restore", response_model=PromptVersionOut)
def restore_template(version_id: str, db: Session = Depends(get_db)):
    target = db.get(Template, version_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    for t in db.scalars(select(Template).where(Template.is_active == True)):  # noqa: E712
        t.is_active = False
    target.is_active = True
    db.commit()
    return PromptVersionOut.model_validate(target)


# ---------------- tools ----------------
_READ_TOOLS = {"Read", "Glob", "Grep"}


@router.get("/tools", response_model=list[ToolOut])
def list_tools(db: Session = Depends(get_db)):
    rows = db.scalars(select(AgentTool).order_by(AgentTool.sort_order))
    return [ToolOut.model_validate(t) for t in rows]


@router.post("/tools", response_model=ToolOut)
def add_tool(body: ToolIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(AgentTool).where(AgentTool.tool_key == body.tool_key)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tool already exists")
    row = AgentTool(**body.model_dump(), created_by=admin.id)
    db.add(row)
    db.commit()
    return ToolOut.model_validate(row)


@router.put("/tools/{tool_id}", response_model=ToolOut)
def update_tool(tool_id: str, body: ToolUpdateIn, db: Session = Depends(get_db)):
    tool = db.get(AgentTool, tool_id)
    if not tool:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tool not found")
    data = body.model_dump(exclude_unset=True)
    # guard: keep at least one read tool enabled
    if data.get("is_enabled") is False and tool.tool_key in _READ_TOOLS:
        others = db.scalars(select(AgentTool).where(AgentTool.is_enabled == True))  # noqa: E712
        remaining = [t for t in others if t.id != tool.id and t.tool_key in _READ_TOOLS]
        if not remaining:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "At least one read tool (Read/Glob/Grep) must stay enabled")
    for k, v in data.items():
        setattr(tool, k, v)
    tool.updated_at = datetime.now(timezone.utc)
    db.commit()
    return ToolOut.model_validate(tool)


@router.delete("/tools/{tool_id}", response_model=MessageOut)
def delete_tool(tool_id: str, db: Session = Depends(get_db)):
    tool = db.get(AgentTool, tool_id)
    if not tool:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tool not found")
    db.delete(tool)
    db.commit()
    return MessageOut(detail="Tool removed.")
