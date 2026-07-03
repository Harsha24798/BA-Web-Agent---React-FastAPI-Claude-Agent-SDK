# Phase 1 — Auth & Users

**Goal:** Full account lifecycle: self-register → admin approve → email set-password → login, plus
admin user management. Reference: [04-auth-and-users.md](../04-auth-and-users.md).

## Files
- `backend/app/auth/` — `security.py` (argon2 hash, JWT encode/decode), `deps.py`
  (`get_current_user`, `require_active`, `require_admin`), `tokens.py` (create/validate auth_tokens)
- `backend/app/api/auth.py`, `backend/app/api/users.py`
- `backend/app/services/email.py` + `backend/app/agent/templates/email/{signup,approved,srs_generated}.{html,txt}`
- `frontend/src/pages/{Login,Register,SetPassword}.tsx`, `frontend/src/pages/AdminUsers.tsx`
- `frontend/src/auth/` — auth context, `RequireAuth`, `RequireAdmin`

## Steps
1. **Security utils** — argon2 hashing; JWT (HS256, `JWT_SECRET`, exp). `deps.py` guards; only
   `active` users with a password pass `require_active`.
2. **Register** — `POST /auth/register` creates `pending` user (no password), emails admin
   (`signup.html`), neutral response for existing email.
3. **Approve/reject** — `POST /users/{id}/approve` sets `active`, mints a `set_password` token (48h,
   store hash), emails user (`approved.html`) with `APP_BASE_URL/set-password?token=`. `/reject` sets
   `rejected`.
4. **Set-password** — `POST /auth/set-password` validates token (unused/unexpired), sets hash, marks
   token used.
5. **Login / me** — `POST /auth/login` returns JWT + user; `GET /auth/me`.
6. **Admin user mgmt** — list/pending, disable/enable, reset-password (re-issue token+email), change
   role (guard: ≥1 active admin), per-user model grants stub (`PUT /users/{id}/models`).
7. **Email service** — Jinja2 render; `DEV_EMAIL` redirect; SMTP-unset fallback logs+returns link;
   never fail the action if email fails.
8. **Frontend** — Login/Register/SetPassword pages; AdminUsers (pending + all tabs); auth context
   stores JWT; guards; toasts on every action; show set-password link in AdminUsers when SMTP off.

## Done-check
- Register a user → appears in AdminUsers pending; cannot log in.
- Approve → link emailed (or shown in-app) → set password → login works.
- Expired/used token rejected with a clear message.
- Non-admin gets 403 on `/users/*`; last-admin demotion blocked.
