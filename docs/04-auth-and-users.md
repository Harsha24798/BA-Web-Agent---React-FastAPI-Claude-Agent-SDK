# 04 — Auth & Users

## Model

- **JWT** bearer tokens (HS256, signed with `JWT_SECRET`). Sent as `Authorization: Bearer <token>`.
- Passwords hashed with **argon2** (`argon2-cffi`). Never stored plaintext.
- Only users with `status='active'` **and** a non-null `password_hash` can log in.
- Roles: `user`, `admin`. Route guards are FastAPI dependencies: `require_active`, `require_admin`.

## Seeded first admin (bootstrap)

On first startup, if no admin exists, the app inserts one from `.env`:
`ADMIN_EMAIL`, `ADMIN_PASSWORD` → user with `role='admin'`, `status='active'`, hashed password.
Log in with those and **change the password after first login**. No email/approval needed for it.

## Registration → approval → set-password flow

```
User: POST /auth/register {full_name, email}
        │  create users row (role=user, status=pending, password_hash=null)
        │  email admin (signup.html) + show in admin pending queue
        ▼
Admin: POST /users/{id}/approve
        │  status=active; create auth_tokens row (purpose=set_password, 48h, hashed)
        │  email user (approved.html) with APP_BASE_URL/set-password?token=<raw>
        ▼
User: opens link → POST /auth/set-password {token, password}
        │  validate token (exists, not used, not expired) → set password_hash, mark token used
        ▼
User: POST /auth/login {email, password} → JWT
```

Rejection: `POST /users/{id}/reject` sets `status='rejected'` (cannot log in; can be re-approved).

### Security details
- **No user enumeration**: `/auth/register` returns the same neutral success message whether or not
  the email already exists.
- **Tokens** are single-use and time-limited; only a **hash** of the token is stored. A used or
  expired token returns a clear error and the UI offers "request a new link".
- Set-password enforces a minimum strength (length ≥ 8; configurable).
- If SMTP is not configured, the approval/reset link is **logged and shown in the admin UI** so the
  flow still works locally. In dev, `DEV_EMAIL` redirects all mail to you.

## Admin user management (AdminUsers page)

- **Pending queue** — list `status='pending'` users; Approve / Reject.
- **Active users** — list; Disable/Enable (`status` toggling), **Reset password** (re-issue token +
  email), **Change role** (`user` ↔ `admin`).
- **Per-user model access** — grant/revoke `user_models` rows (see [05](05-agent-and-srs.md)).
- Guardrails: an admin cannot disable/demote the **last remaining active admin** (prevents lockout).

## Endpoints (see [10-api-reference.md](10-api-reference.md) for full detail)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | public | self-register (name+email) |
| POST | `/auth/set-password` | public (token) | set password from email link |
| POST | `/auth/request-reset` | public | request a reset link |
| POST | `/auth/login` | public | get JWT |
| GET | `/auth/me` | active | current user profile |
| GET | `/users` | admin | list users (filter by status) |
| GET | `/users/pending` | admin | pending queue |
| POST | `/users/{id}/approve` | admin | approve + email link |
| POST | `/users/{id}/reject` | admin | reject |
| POST | `/users/{id}/disable` / `/enable` | admin | toggle active |
| POST | `/users/{id}/reset-password` | admin | re-issue set-password link |
| POST | `/users/{id}/role` | admin | change role |
| PUT | `/users/{id}/models` | admin | set per-user model grants |

## Frontend

- **Register.tsx** — name + email; on submit shows a "pending approval" confirmation screen.
- **SetPassword.tsx** — reads `?token=`; password + confirm; on success redirects to login with a
  toast.
- **Login.tsx** — email + password; stores JWT in memory + `localStorage`; role-aware nav.
- **Route guards** — `RequireAuth` and `RequireAdmin` wrappers redirect unauthorized users.
