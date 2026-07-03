"""Email delivery via SMTP with Jinja2 HTML templates.

If SMTP is not configured, emails are logged and any action link is captured in-memory so the
admin UI can display it. Email failures never raise to the caller.
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings

logger = logging.getLogger("ba-agent.email")

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "agent" / "templates" / "email"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)

# When SMTP is off, we stash the most recent action link per user email so the admin UI can show it.
pending_links: dict[str, str] = {}


def _render(name: str, context: dict) -> str:
    return _env.get_template(name).render(**context)


def send_email(to: str, subject: str, template: str, context: dict, link: str | None = None) -> None:
    recipient = settings.dev_email or to
    try:
        html = _render(f"{template}.html", context)
    except Exception:  # template missing → plain fallback
        html = f"<p>{subject}</p>"
    try:
        text = _render(f"{template}.txt", context)
    except Exception:
        text = subject

    if link:
        pending_links[to.lower()] = link

    if not settings.smtp_configured:
        logger.info("[EMAIL:not-sent] to=%s subject=%s link=%s", recipient, subject, link or "")
        logger.info("[EMAIL:body]\n%s", text)
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from
        msg["To"] = recipient
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_pass)
            smtp.sendmail(settings.smtp_from, [recipient], msg.as_string())
        logger.info("[EMAIL:sent] to=%s subject=%s", recipient, subject)
    except Exception as e:  # never fail the underlying action
        logger.error("[EMAIL:error] to=%s subject=%s err=%s", recipient, subject, e)


def send_signup_admin(admin_email: str, full_name: str, email: str) -> None:
    send_email(
        to=admin_email,
        subject=f"New user pending approval — {full_name}",
        template="signup",
        context={"full_name": full_name, "email": email,
                 "admin_url": f"{settings.app_base_url}/admin/users"},
    )


def send_approved(email: str, full_name: str, raw_token: str) -> None:
    link = f"{settings.app_base_url}/set-password?token={raw_token}"
    send_email(
        to=email,
        subject="Your BA Agent account is approved — set your password",
        template="approved",
        context={"full_name": full_name, "link": link, "ttl_hours": 48},
        link=link,
    )


def send_reset(email: str, full_name: str, raw_token: str) -> None:
    link = f"{settings.app_base_url}/set-password?token={raw_token}"
    send_email(
        to=email,
        subject="Reset your BA Agent password",
        template="approved",
        context={"full_name": full_name, "link": link, "ttl_hours": 48, "reset": True},
        link=link,
    )


def send_srs_generated(email: str, full_name: str, project_name: str, version_no: int,
                       model: str, summary: str, project_url: str) -> None:
    send_email(
        to=email,
        subject=f"SRS ready: {project_name} (v{version_no})",
        template="srs_generated",
        context={"full_name": full_name, "project_name": project_name,
                 "version_no": version_no, "model": model, "summary": summary,
                 "project_url": project_url},
    )
