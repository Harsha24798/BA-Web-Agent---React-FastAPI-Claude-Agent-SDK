"""Admin: agent master prompt & SRS template (named library) + tools registry."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db.database import get_db
from app.db.models import AgentPrompt, AgentTool, Template, User
from app.schemas import (
    MessageOut,
    NamedConfigIn,
    NamedConfigOut,
    ToolIn,
    ToolOut,
    ToolUpdateIn,
)

router = APIRouter(prefix="/admin", tags=["agent-config"], dependencies=[Depends(require_admin)])


# ---------------- generic named-library helpers (master prompt & template) ----------------
def _list(db: Session, Model):
    active = db.scalar(select(Model).where(Model.is_active == True))  # noqa: E712
    items = db.scalars(select(Model).order_by(Model.updated_at.desc()))
    return {
        "active": NamedConfigOut.model_validate(active) if active else None,
        "items": [NamedConfigOut.model_validate(m) for m in items],
    }


def _assert_unique_name(
    db: Session, Model, name: str, noun: str, exclude_id: str | None = None
) -> None:
    query = select(Model).where(func.lower(Model.name) == name.lower())
    if exclude_id is not None:
        query = query.where(Model.id != exclude_id)
    if db.scalar(query) is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f'A {noun} named "{name}" already exists.'
        )


def _create(db: Session, Model, body: NamedConfigIn, admin: User, noun: str):
    name = body.name.strip()
    _assert_unique_name(db, Model, name, noun)
    has_any = db.scalar(select(Model)) is not None
    row = Model(name=name, content=body.content, is_active=not has_any,
                updated_by=admin.id, updated_at=datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    return NamedConfigOut.model_validate(row)


def _update(db: Session, Model, item_id: str, body: NamedConfigIn, noun: str):
    row = db.get(Model, item_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    name = body.name.strip()
    _assert_unique_name(db, Model, name, noun, exclude_id=item_id)
    row.name = name
    row.content = body.content
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return NamedConfigOut.model_validate(row)


def _delete(db: Session, Model, item_id: str):
    row = db.get(Model, item_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if row.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Cannot delete the active item. Activate another first.")
    db.delete(row)
    db.commit()
    return MessageOut(detail="Deleted.")


def _activate(db: Session, Model, item_id: str):
    row = db.get(Model, item_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    for r in db.scalars(select(Model).where(Model.is_active == True)):  # noqa: E712
        r.is_active = False
    row.is_active = True
    db.commit()
    return NamedConfigOut.model_validate(row)


# ---------------- master prompt ----------------
@router.get("/master-prompt")
def get_master_prompt(db: Session = Depends(get_db)):
    return _list(db, AgentPrompt)


@router.post("/master-prompt", response_model=NamedConfigOut)
def create_master_prompt(body: NamedConfigIn, admin: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    return _create(db, AgentPrompt, body, admin, "master prompt")


@router.put("/master-prompt/{item_id}", response_model=NamedConfigOut)
def update_master_prompt(item_id: str, body: NamedConfigIn, db: Session = Depends(get_db)):
    return _update(db, AgentPrompt, item_id, body, "master prompt")


@router.delete("/master-prompt/{item_id}", response_model=MessageOut)
def delete_master_prompt(item_id: str, db: Session = Depends(get_db)):
    return _delete(db, AgentPrompt, item_id)


@router.post("/master-prompt/{item_id}/activate", response_model=NamedConfigOut)
def activate_master_prompt(item_id: str, db: Session = Depends(get_db)):
    return _activate(db, AgentPrompt, item_id)


# ---------------- SRS template ----------------
@router.get("/template")
def get_template(db: Session = Depends(get_db)):
    return _list(db, Template)


@router.post("/template", response_model=NamedConfigOut)
def create_template(body: NamedConfigIn, admin: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return _create(db, Template, body, admin, "SRS template")


@router.put("/template/{item_id}", response_model=NamedConfigOut)
def update_template(item_id: str, body: NamedConfigIn, db: Session = Depends(get_db)):
    return _update(db, Template, item_id, body, "SRS template")


@router.delete("/template/{item_id}", response_model=MessageOut)
def delete_template(item_id: str, db: Session = Depends(get_db)):
    return _delete(db, Template, item_id)


@router.post("/template/{item_id}/activate", response_model=NamedConfigOut)
def activate_template(item_id: str, db: Session = Depends(get_db)):
    return _activate(db, Template, item_id)


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
