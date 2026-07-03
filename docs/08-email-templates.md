# 08 — Email Templates

Emails are sent via free SMTP (`services/email.py`) using **Jinja2** HTML templates in
`backend/app/agent/templates/email/`. Each template has an HTML and a plain-text fallback.

## Configuration

`.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_BASE_URL`, `DEV_EMAIL`.

- **SMTP unset** → the app does not fail. It logs the fully-rendered email + any link, and surfaces
  the link in the admin UI (for approvals) so the flow still works locally.
- **`DEV_EMAIL` set** → all outgoing mail is redirected to that address (so dev testing never emails
  real clients). The original intended recipient is shown in the body.

## The three templates

### 1. `signup.html` — to the **admin**
Sent when a user self-registers.
- Subject: *"New user pending approval — <full_name>"*
- Body: user's name + email, when they registered, and a button linking to the AdminUsers pending
  queue (`APP_BASE_URL/admin/users`).
- Purpose: prompt the admin to approve/reject.

### 2. `approved.html` — to the **user**
Sent when the admin approves the account.
- Subject: *"Your BA Agent account is approved — set your password"*
- Body: welcome message + a prominent **Set Password** button linking to
  `APP_BASE_URL/set-password?token=<raw token>`.
- Note: link expires in 48h and is single-use; body says so and mentions requesting a new one.

### 3. `srs_generated.html` — to the **triggering user only**
Sent when generation completes. Recipient = `generation_jobs.triggered_by` (the currently
logged-in user who clicked Generate) — **not** all users.
- Subject: *"SRS ready: <project name> (v<N>)"*
- Body: project name, **model used**, version number, a short summary (e.g. counts of requirements /
  open questions pulled from `srs.json`), and a **Download** button linking to the project page.
- Purpose: tell the person who requested it that their SRS is done.

> There is also a reset-password email reusing the `approved.html` layout with reset wording, sent by
> `POST /users/{id}/reset-password` and `POST /auth/request-reset`.

## Template design

- Simple, responsive, inline-CSS HTML (email clients strip `<style>` blocks) with a clear header,
  one primary button, and a plain-text alternative.
- Shared partial for header/footer/branding so all three look consistent.
- All dynamic values passed as Jinja2 context; never string-concatenate untrusted content into HTML
  without escaping (Jinja2 autoescape on).

## Sending logic (`services/email.py`)

```
send_email(to, subject, template_name, context):
    if DEV_EMAIL: to = DEV_EMAIL         # redirect in dev
    html = render(template_name + ".html", context)
    text = render(template_name + ".txt", context)
    if not SMTP configured:
        log(html + any link); record link for admin UI; return
    smtp.send(from=SMTP_FROM, to=to, subject, html, text)
```

Email sending happens **outside** DB transactions and never blocks the API response longer than
necessary (fire in a background task / thread if slow). A failed email must not fail the underlying
action (approval still succeeds; the link is still retrievable in the admin UI).
