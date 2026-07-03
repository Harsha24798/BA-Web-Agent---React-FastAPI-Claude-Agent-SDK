"""LLM model listing (per-user allowed) + admin model management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.db.database import get_db
from app.db.models import LlmModel, User, UserModel
from app.schemas import LlmModelIn, LlmModelOut, MessageOut

router = APIRouter(tags=["models"])


def allowed_model_ids(db: Session, user: User) -> set[str]:
    enabled = set(db.scalars(select(LlmModel.model_id).where(LlmModel.is_enabled == True)))  # noqa: E712
    grants = set(db.scalars(select(UserModel.model_id).where(UserModel.user_id == user.id)))
    if not grants:
        return enabled
    return enabled & grants


@router.get("/models", response_model=list[LlmModelOut])
def list_allowed_models(user: User = Depends(require_active), db: Session = Depends(get_db)):
    allowed = allowed_model_ids(db, user)
    rows = db.scalars(select(LlmModel).where(LlmModel.model_id.in_(allowed))
                      .order_by(LlmModel.sort_order))
    return [LlmModelOut.model_validate(m) for m in rows]


# ----- admin -----
admin_router = APIRouter(prefix="/admin/models", tags=["admin-models"],
                         dependencies=[Depends(require_admin)])


@admin_router.get("", response_model=list[LlmModelOut])
def all_models(db: Session = Depends(get_db)):
    rows = db.scalars(select(LlmModel).order_by(LlmModel.sort_order))
    return [LlmModelOut.model_validate(m) for m in rows]


@admin_router.post("", response_model=LlmModelOut)
def add_model(body: LlmModelIn, db: Session = Depends(get_db)):
    if db.scalar(select(LlmModel).where(LlmModel.model_id == body.model_id)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Model already exists")
    if body.is_default:
        _clear_default(db)
    m = LlmModel(**body.model_dump())
    db.add(m)
    db.commit()
    return LlmModelOut.model_validate(m)


@admin_router.put("/{model_pk}", response_model=LlmModelOut)
def update_model(model_pk: str, body: LlmModelIn, db: Session = Depends(get_db)):
    m = db.get(LlmModel, model_pk)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    if body.is_default:
        _clear_default(db)
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    db.commit()
    return LlmModelOut.model_validate(m)


@admin_router.delete("/{model_pk}", response_model=MessageOut)
def delete_model(model_pk: str, db: Session = Depends(get_db)):
    m = db.get(LlmModel, model_pk)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    db.delete(m)
    db.commit()
    return MessageOut(detail="Model removed.")


def _clear_default(db: Session) -> None:
    for m in db.scalars(select(LlmModel).where(LlmModel.is_default == True)):  # noqa: E712
        m.is_default = False


router.include_router(admin_router)
