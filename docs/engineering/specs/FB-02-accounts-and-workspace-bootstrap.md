**Backlog item:** FB-02 Accounts and workspace bootstrap
**Status:** Ready for approval
**Approved by:** pending, Paperclip issue TAS-10
**Owner(s):** FlowBoard Backend (`flowboard-api` auth and me routes, `flowboard-shared` request/response schemas), FlowBoard Frontend (`flowboard-web` signup, login, logout and session handling), FlowBoard QA (`flowboard-web/e2e/FB-02-accounts.spec.ts` Playwright and axe suite, §10, in a separate task after the Frontend task; see the end-to-end ownership rule in FB-00)
**Reviewer:** FlowBoard QA
**Increment:** MVP-1

---

### 1. Goal

A visitor can create an account with an email and password and is immediately inside their own workspace, signed in, with no verification step or workspace-naming step between them and their first board. This is the start of the BM §1 metric (time-to-first-board under two minutes) and the precondition for every authenticated route in the product. FB-02 also gives the app shell (FB-03) the current-user and theme endpoints it needs.

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | §7 | Bearer-token auth over HTTPS; JSON bodies | [REQ] |
| FS | §8 security | bcrypt/argon2 password hashing; rate limiting per token | [REQ] |
| FS | §5 | `User` has `email`, `display_name`, `initials`, `avatar_color` | [REQ] |
| FS | §6 | Workspace admin role exists; FS does not say how it is assigned | [REQ] |
| FS | §4.1 | Sidebar footer shows current user avatar, name and workspace role (consumer of `GET /v1/me`) | [REQ] |
| FS | §9 | Prototype hard-codes the signed-in user; production needs real authentication | [REQ] |
| BM | §1 | Time-to-first-board under two minutes | [REQ] |
| BM | §9 | Related activation metric "time to first card under two minutes"; the first card is FB-06, but signup is on its critical path | [REQ] |
| BM | §13.3 | Instrument the funnel with v1.0 | [REQ] |
| CL | CL-E5 | Email and password, argon2id, cookie sessions plus bearer tokens, no email verification in MVP | [REQ] |
| CL | CL-E9 | Session token, cookie attributes, bearer path, `Origin` check | [ENG] |
| CL | CL-E10 | Password and email rules | [ENG] |
| CL | CL-E11 | Rate limits | [ENG] |
| CL | CL-E12 | Workspace created at signup with the creator as admin; funnel events | [ENG] |
| CL | CL-E13 | Theme stored on the user, `PATCH /v1/me` | [ENG] |
| CL | CL-E20 | Funnel events `user.signed_up`, `workspace.created` | [ENG] |
| CL | CL-O1 | No email verification before creating boards in MVP | [ASM] put to Anas with this specification |
| CL | CL-O6 | The signup user is the workspace admin | [ASM] put to Anas with this specification |
| CL | CL-D7 | Many-to-many model; single-workspace UI | [REQ] |
| PT | login-less | Visual reference only for the avatar, initials and colours | [REQ] |
| TAS-7 | §4 FB-02 | Acceptance: argon2id; httpOnly, secure, sameSite cookies; rate limiting on auth routes; integration tests for every failure path; no email verification | [REQ] |

### 3. Scope

**In scope**

- Backend: `POST /v1/auth/signup`, `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/me`, `PATCH /v1/me`; session creation and lookup (cookie and bearer); the `requireAuth` Fastify hook that populates `request.user` and `request.session`; the authorisation module skeleton (`can(user, capability, resource)`) with the workspace-level rows of FS §6 implemented and the board-level rows stubbed for FB-04; rate limiting; `Origin` check; argon2id hashing module; initials and avatar colour derivation; funnel events.
- Shared: `SignupRequest`, `LoginRequest`, `AuthResponse`, `MeResponse`, `MePatch`, `ApiError` schemas.
- Frontend: routes `/signup` and `/login` with inline validation, the API client with credentials included, a `useSession()` query, redirect to `/` after signup or login, a `Sign out` action (surfaced in the sidebar footer by FB-03; until then on the placeholder page), and the `/` placeholder reading "Signed in as <name>" that FB-03 replaces. Theme is applied from `GET /v1/me` on load (the toggle itself is FB-03).
- Message catalogue keys for all new strings.
- QA: the Playwright and axe suite in §10, written against the merged Frontend work (Frontend ships the flows and the unit tests; QA ships the end-to-end coverage).

**Out of scope**

- Email verification, password reset, change email or password (FB-19, needs CL-D6 provider).
- Workspace rename, workspace switcher, workspace member management (CL-D7; v2.0 admin console).
- Invitations (FB-09).
- Account deletion and data export (FB-19).
- Social or SSO login (v2.0, CL-E8).

### 4. Acceptance criteria

1. **[REQ, CL-E5, CL-E12]** `POST /v1/auth/signup` with a valid email, password and display name returns `201` with the user and a workspace named "<display name>'s workspace", sets the `fb_session` cookie, and in the database there is one `user`, one `workspace`, one `workspace_member` with role `admin`, one `session`, and funnel events `user.signed_up` and `workspace.created`, all written in one transaction (a forced failure after the user insert leaves no rows).
2. **[REQ, FS §8]** The stored `password_hash` is an argon2id hash (prefix `$argon2id$`); the plaintext password never appears in logs (test asserts the log output of a signup does not contain it).
3. **[ENG, CL-E10]** Signup rejects with `422` and field-level `details`: invalid email, email over 254 characters, password under 10 or over 128 characters, empty display name, display name over 80 characters. Email is stored trimmed; uniqueness is case-insensitive (`A@x.com` after `a@x.com` returns `409 email_taken`).
4. **[ENG, CL-E10]** `POST /v1/auth/login` with a wrong password or an unknown email returns the same `401 invalid_credentials` body and takes comparable time (a dummy hash is verified for unknown emails).
5. **[REQ, CL-E9]** The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV` is not `development`, with `Max-Age` of 30 days; the response body never contains the token unless `tokenResponse: true` was sent, in which case no cookie is set and `sessionToken` is in the body.
6. **[REQ, FS §7]** A request with `Authorization: Bearer <sessionToken>` and no cookie is authenticated identically to a cookie request; an invalid or expired token returns `401 unauthenticated` for both paths.
7. **[ENG, CL-E9]** A cookie-authenticated `POST`, `PATCH` or `DELETE` whose `Origin` header is present and does not match `WEB_ORIGIN` returns `403 bad_origin`; bearer requests are exempt.
8. **[REQ, CL-E9]** `POST /v1/auth/logout` returns `204`, deletes the session row and clears the cookie; the same token afterwards returns `401`.
9. **[ENG, CL-E9]** A session whose `last_seen_at` is older than one day is renewed (new `expires_at`) on use; a session past `expires_at` is rejected and deleted.
10. **[REQ, FS §8, CL-E11]** The 11th login attempt from one IP within 15 minutes, or the 6th for one email, returns `429` with `Retry-After`; the 6th signup from one IP within an hour returns `429`.
11. **[REQ, FS §4.1]** `GET /v1/me` returns the user (without hash), `workspaces` (each with the caller's role) and `currentWorkspace` (the earliest-joined); `PATCH /v1/me` with `{ theme: "dark" }` persists and is reflected by the next `GET /v1/me`; any other field is rejected with `422`.
12. **[REQ, FS §5]** Initials are the first letters of the first two words of the display name, upper-cased (single word: first two letters); avatar colour is chosen deterministically from the PT palette by hashing the user id.
13. **[REQ, BM §1]** Frontend: a visitor on `/signup` who fills three fields and presses Enter lands on `/` signed in without any intermediate screen; a signed-in user visiting `/login` or `/signup` is redirected to `/`; a signed-out user visiting `/` is redirected to `/login` (route guard is completed in FB-03, the minimal guard ships here).
14. **[REQ, FS §8 accessibility]** Signup and login forms have labelled inputs, error messages linked with `aria-describedby`, focus moved to the first invalid field on submit, and pass axe with zero violations in light and dark themes.
15. **[REQ, X-03]** Enter submits the forms; the forms are fully operable by keyboard with a visible focus ring.
16. **[REQ, FS §6, CL-O6]** Authorisation negatives: `GET /v1/me` without a session returns `401`; a user cannot read another user's data through any FB-02 route (there is no route that takes a user id; the test asserts `GET /v1/me` only ever returns the caller).

### 5. User interface

Visual reference: PT colours and typography (CL-O2). PT has no auth screens, so the layout is a centred card on the `--bg` background using the `--panel`, `--line`, `--accent` tokens.

**`/signup`** (FS §4 has no definition; engineering design)
- Fields: Display name, Email, Password (with a show/hide toggle button labelled for screen readers). Primary button "Create account". Link "Already have an account? Sign in".
- Inline validation on blur and on submit using the shared Zod schema so messages match the API. Server errors (`email_taken`, `429`) render above the form in a live region.
- On success: navigate to `/`. No toast (nothing to confirm; the user sees the app).

**`/login`**
- Fields: Email, Password. Primary button "Sign in". Link "New here? Create an account".
- `401` renders "Email or password is incorrect" (one message, CL-E10). `429` renders "Too many attempts. Try again in N minutes" using `Retry-After`.

**Sign out**: an action that calls logout, clears the query cache and navigates to `/login`. FB-03 places it in the sidebar footer menu.

**Keyboard**: Tab order follows visual order; Enter submits; Escape clears a server error banner. Focus is placed on the first field on route entry.

**Strings** (catalogue keys): `auth.signup.title`, `auth.signup.displayName`, `auth.signup.email`, `auth.signup.password`, `auth.signup.submit`, `auth.signup.haveAccount`, `auth.login.title`, `auth.login.submit`, `auth.login.noAccount`, `auth.error.invalidCredentials`, `auth.error.emailTaken`, `auth.error.rateLimited`, `auth.error.network`, `auth.password.show`, `auth.password.hide`, `auth.signOut`, `workspace.defaultName` ("{name}'s workspace"), `validation.email`, `validation.passwordLength`, `validation.required`, `validation.tooLong`.

### 6. API contract

All bodies are JSON. Errors use the `ApiError` envelope from FB-00. Schemas live in `flowboard-shared/src/schemas/auth.ts` and `me.ts`.

```
POST /v1/auth/signup
Auth: none
Request: SignupRequest { email, password, displayName, tokenResponse?: boolean }
Response 201: AuthResponse { user: User, workspace: Workspace, sessionToken?: string }
Side effects: Set-Cookie fb_session (unless tokenResponse)
Errors: 409 email_taken, 422 validation, 429 rate_limited
Activity events written: None (no card involved)
Funnel events written: user.signed_up, workspace.created (CL-E20)
WebSocket events published: None
```

```
POST /v1/auth/login
Auth: none
Request: LoginRequest { email, password, tokenResponse?: boolean }
Response 200: AuthResponse
Errors: 401 invalid_credentials, 422 validation, 429 rate_limited
Activity events written: None
```

```
POST /v1/auth/logout
Auth: session cookie or bearer token
Request: none
Response 204; clears cookie
Errors: 401 unauthenticated
```

```
GET /v1/me
Auth: session cookie or bearer token
Response 200: MeResponse { user: User, workspaces: WorkspaceMembership[] ({ workspace: Workspace, role }), currentWorkspace: Workspace }
Errors: 401 unauthenticated
```

```
PATCH /v1/me
Auth: session cookie or bearer token; Origin check for cookie auth (CL-E9)
Request: MePatch { theme: "light" | "dark" | "system" }
Response 200: User
Errors: 401, 403 bad_origin, 422 validation
```

Pagination: none (no list endpoints). `If-Match`: not used on `PATCH /v1/me` (single-owner preference, last write wins).

### 7. Data changes

No schema change; FB-01 created `user`, `workspace`, `workspace_member`, `session`, `funnel_event`. FB-02 adds no migration. Seed users from FB-01 can log in with the documented seed password, which FB-02's integration tests use.

### 8. Authorisation

| Capability | Workspace admin | Board admin | Board member | Observer | Unauthenticated |
|---|:--:|:--:|:--:|:--:|:--:|
| Sign up, log in | n/a | n/a | n/a | n/a | ✓ |
| Log out, read own profile, change own theme | ✓ | ✓ | ✓ | ✓ | 401 |

Covered by `flowboard-api/test/auth.matrix.test.ts` (every route × authenticated/unauthenticated) and the `can()` module unit tests for the workspace-level rows of FS §6 (`workspace.manageMembers` is admin-only; it has no route yet but the matrix is complete so FB-04 only adds board rows).

### 9. Dependencies

- Backlog: FB-00, FB-01. Frontend task additionally depends on the backend task of FB-02 and on FB-00's web skeleton.
- Decisions: CL-E5, CL-E9 to CL-E13, CL-E20, CL-D7; assumptions CL-O1 and CL-O6 (see §12).
- New packages: `argon2`, `@fastify/cookie`, `@fastify/rate-limit`; frontend: none beyond FB-00 (forms use React state and the shared schema; no form library).
- Environment variables: `SESSION_COOKIE_SECURE` (derived from `NODE_ENV` by default), `WEB_ORIGIN`, `RATE_LIMIT_DISABLED` (tests only).

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit | `auth/password.test.ts` (hash verifies, wrong password fails, parameters), `auth/session-token.test.ts` (entropy, hashing), `users/initials.test.ts`, `users/avatar-color.test.ts`, `authz/can.test.ts`, `flowboard-shared` schema tests for `SignupRequest` and `LoginRequest` boundaries | AC 2, 3, 12, 16 |
| Integration | `test/auth.signup.test.ts` (happy path, transaction rollback, every 422 case, 409 case-insensitive, log scrubbing); `test/auth.login.test.ts` (success, wrong password, unknown email timing within tolerance, tokenResponse); `test/auth.session.test.ts` (cookie attributes, bearer parity, expiry, renewal, logout); `test/auth.origin.test.ts`; `test/auth.ratelimit.test.ts`; `test/me.test.ts`; `test/auth.matrix.test.ts` | AC 1 to 11, 16 |
| End to end (QA) | `flowboard-web/e2e/FB-02-accounts.spec.ts`: `FB-02 signs up and lands signed in`, `FB-02 rejects invalid signup inline`, `FB-02 logs in with seeded user`, `FB-02 shows one message for bad credentials`, `FB-02 signs out and is redirected to login`, `FB-02 redirects signed-out visitor to login`, `FB-02 keyboard-only signup` | AC 13, 14, 15 |
| Accessibility | axe on `/signup` and `/login` in both themes, including the error state | AC 14 |
| Performance | None until FB-16 | |

### 11. Verification evidence

- CI run link on the pull request head (backend and frontend pull requests separately).
- Integration test output including the rate-limit and session-expiry tests.
- Playwright report and screenshots of `/signup`, `/login`, the error states, in light and dark.
- A `curl` transcript showing a bearer-token login (`tokenResponse: true`) and `GET /v1/me` with that token, with the token redacted.
- Review task links and verdicts.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

For Anas, answered by accepting or rejecting this specification set (one card on TAS-10):

1. **CL-O1 No email verification in MVP.** Recommendation: accept. It keeps signup to one screen (BM §1). Verification is added in FB-19 before public launch, and unverified users cannot send email invitations until then (CL-D6 uses links).
2. **CL-O6 The signup user is the workspace admin and the only one in MVP.** Recommendation: accept. FS §6 needs the role to exist; the admin console that manages it is v2.0.

If both are accepted, they move to `CLARIFICATIONS.md` §2 as CL-A8 and CL-A9 and this section is replaced by those references.
