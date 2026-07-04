"""Document upload / list / delete with extraction to Markdown."""
from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active
from app.config import settings
from app.db.database import get_db
from app.db.models import Document, Project, User
from app.schemas import DocumentOut, MessageOut
from app.services import ingestion, status as status_svc

router = APIRouter(prefix="/projects", tags=["documents"])


def _get_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


def _refresh_index(db: Session, project_id: str) -> None:
    docs = db.scalars(
        select(Document).where(Document.project_id == project_id, Document.is_deleted == False)  # noqa: E712
    )
    entries = []
    for d in docs:
        if d.extracted_path:
            entries.append((d.original_filename, Path(d.extracted_path).name))
    ingestion.rebuild_index(project_id, entries)


MAX_UPLOAD_MB = 25
MAX_FILES_PER_REQUEST = 20


@router.post("/{project_id}/documents", response_model=list[DocumentOut])
async def upload_documents(
    project_id: str,
    files: list[UploadFile] = File(...),
    category: str = Form("other"),
    user: User = Depends(require_active),
    db: Session = Depends(get_db),
):
    project = _get_project(db, project_id)
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Too many files at once (max {MAX_FILES_PER_REQUEST}).")
    upload_dir = settings.uploads_dir / project_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    ctx_dir = ingestion.workspace_context_dir(project_id)

    created: list[Document] = []
    for uf in files:
        ext = Path(uf.filename or "file").suffix.lower()
        if ext not in ingestion.SUPPORTED:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ingestion.SUPPORTED))}",
            )
        data = await uf.read()
        if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"'{uf.filename}' exceeds the {MAX_UPLOAD_MB} MB limit.",
            )
        safe_name = ingestion.safe_slug(uf.filename or "file")
        stored_path = upload_dir / safe_name
        stored_path.write_bytes(data)

        # Extraction (pdfplumber/openpyxl/python-docx) is blocking — keep it off the event loop.
        md = extract_md = await asyncio.to_thread(ingestion.extract_to_markdown, stored_path)
        # Unique per document id so files that share a stem (spec.pdf vs spec.docx) don't collide.
        doc_id = str(uuid.uuid4())
        extracted_path = ctx_dir / f"{Path(safe_name).stem}-{doc_id[:8]}.md"
        header = f"# Source: {uf.filename}\n\n> Category: {category}\n\n"
        extracted_path.write_text(header + md, encoding="utf-8")

        doc = Document(
            id=doc_id,
            project_id=project_id,
            original_filename=uf.filename or safe_name,
            stored_path=str(stored_path),
            extracted_path=str(extracted_path),
            mime_type=uf.content_type or "",
            category=category,
            size_bytes=len(data),
            content_hash=ingestion.sha256_text(extract_md),
            uploaded_by=user.id,
        )
        db.add(doc)
        created.append(doc)

    db.commit()
    _refresh_index(db, project_id)
    status_svc.recompute_status(db, project)
    db.commit()
    return [DocumentOut.model_validate(d) for d in created]


@router.get("/{project_id}/documents", response_model=list[DocumentOut])
def list_documents(project_id: str, user: User = Depends(require_active),
                   db: Session = Depends(get_db)):
    _get_project(db, project_id)
    rows = db.scalars(
        select(Document).where(Document.project_id == project_id, Document.is_deleted == False)  # noqa: E712
        .order_by(Document.uploaded_at)
    )
    return [DocumentOut.model_validate(d) for d in rows]


@router.delete("/{project_id}/documents/{doc_id}", response_model=MessageOut)
def delete_document(project_id: str, doc_id: str, user: User = Depends(require_active),
                    db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    doc = db.get(Document, doc_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    doc.is_deleted = True
    if doc.extracted_path:
        Path(doc.extracted_path).unlink(missing_ok=True)
    db.commit()
    _refresh_index(db, project_id)
    status_svc.recompute_status(db, project)
    db.commit()
    return MessageOut(detail="Document deleted.")
