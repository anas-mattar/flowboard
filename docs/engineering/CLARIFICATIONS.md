# FlowBoard Clarifications Log

**Purpose:** the dated record of every clarification, decision and recorded answer that engineering relies on but that the management inputs do not state (or state inconsistently). Specifications and tasks cite entries here by ID (for example **CL-D3** or **CL-A2**) instead of re-deriving the answer.

**Rule:** the management inputs in `docs/product/` are never edited. When a decision changes the reading of a requirement, the change is recorded here and the input stays as written.

**Sources cited:** `docs/product/FUNCTIONAL_SPEC.md` (**FS §n**, story IDs such as **B-02**), `docs/product/BUSINESS_MODEL.md` (**BM §n**), `docs/product/flowboard-prototype.html` (**PT**). The analysis that produced these decisions is the TAS-7 plan document (Paperclip issue TAS-7, document `plan`); its conflict table is cited as **TAS-7 §2.n**.

**Status values**

| Status | Meaning |
|---|---|
| **Approved** | Decided by Anas (Product Owner). Binding for implementation. |
| **Recorded** | Engineering reading accepted by Anas without objection. Binding unless Anas revises it. |
| **Open** | Engineering assumption not yet put to Anas. Implementation may proceed on the assumption, and the task that depends on it must say so. |

---

## 1. Approved decisions (3 October 2026)

Anas answered the TAS-7 decision card on 3 October 2026. Every recommendation was accepted as proposed.

| ID | Decision | Resolves | Approved answer | Engineering consequence |
|---|---|---|---|---|
| **CL-D1** | MVP definition | FS §1.2, FS §10 release plan; TAS-7 §1.3 | FS v1.0 scope is delivered as three increments: MVP-1 "First board", MVP-2 "Core Kanban", MVP-3 "Together and at scale". SSO, residency options, billing and free-tier enforcement are deferred to launch readiness. | Backlog order FB-00 to FB-18 is the MVP; FB-19 to FB-21 are launch readiness and need separate decisions. |
| **CL-D2** | Wedge | BM §13.4; TAS-7 §2.16 | Speed at scale. Governance features arrive with v2.0 (FS §10). | MVP-3 prioritises realtime, virtualisation and the FS §8 performance budget. The performance budget is a CI check, not a goal. |
| **CL-D3** | Label scope | FS §11 Q1; FS §1.3 and §5 versus PT; TAS-7 §2.2 | Labels are board-scoped (as FS §1.3 and §5 state). Every new board receives the six default labels from PT: Bug, Feature, Design, Urgent, Research, Blocked. | `label.board_id` is mandatory. Board creation seeds six labels. Cross-board reporting (v2.0) may match labels by name. |
| **CL-D4** | WIP limits | FS §11 Q2; L-04; TAS-7 §2.1 | Advisory only in v1.0, exactly as L-04 and PT. The counter turns red over the limit and never blocks a drop. | No server-side rejection of moves on WIP grounds. A per-list hard option may be revisited later if customers ask. |
| **CL-D5** | Free-tier limits | BM §4.2 and §13.1; TAS-7 §2.14 | Store plan and limits as workspace configuration and record usage counters. Do not enforce until the limits are validated. | `workspace.plan` and limit values exist from FB-01; enforcement is FB-21. |
| **CL-D6** | Invitations and email | B-05; PT email stub; BM §8.2; TAS-7 §2.11 | Link-based invitations with a development mailer for MVP-1 and MVP-2. A transactional email provider (new spending) is chosen before MVP-3. Password reset has the same dependency. | Invitation rows carry a token; the development mailer logs message content instead of sending. Provider selection is a separate approval. |
| **CL-D7** | Workspaces per user | FS §1.2 (multiple workspaces out of scope); BM §7 counts workspaces; B-05; TAS-7 §2.10 | Many-to-many user/workspace in the data model from day one. The UI shows one workspace; a minimal switcher appears only when a user belongs to more than one. | `workspace_member` table exists in FB-01. No workspace-management UI in MVP. |
| **CL-D8** | Hosting and residency | FS §8 data protection; FS §11 Q4; BM §4.2; TAS-7 §2.8 | One EU region at launch, which satisfies EU residency by default. Hosting provider and spend are decided at launch readiness, not now. | No cloud dependency in MVP. US residency and SSO are v2.0. |
| **CL-D9** | Technology stack and repository layout | FS §7 REST and realtime; FS §5 relational model; FS §8 NFRs; TAS-7 §3 | Approved: TypeScript end to end, Fastify, PostgreSQL with Drizzle, React with Vite, pnpm monorepo using the existing `flowboard-api` and `flowboard-web` folders plus a new `flowboard-shared` package. | Recorded in `ARCHITECTURE.md` and `adr/ADR-001-technology-stack.md`. |
| **CL-D10** | Team | Working agreement (independent review, single owners); TAS-7 §0 | Create FlowBoard Backend, FlowBoard Frontend and FlowBoard QA agents so implementation tasks have single owners and independent reviewers. | Every implementation task is assigned to exactly one of these owners; review is always by a different agent. |

### 1.1 Approved decisions (4 October 2026, TAS-60)

Anas answered the TAS-60 decision card on 4 October 2026 after pull request #26 (`scratch/TAS-49-red-proof`, titled "DO NOT MERGE", `Playwright smoke` red) was merged into `main` and broke it until the revert in pull request #27.

| ID | Decision | Resolves | Approved answer | Engineering consequence |
|---|---|---|---|---|
| **CL-D11** | Protection of `main` | STANDARDS §1.10 (human merge approval), §1.12 (merge safety); CL-O9; Paperclip issue TAS-60 | A GitHub repository **ruleset** on `main` that requires the status checks `Lint`, `Typecheck`, `Unit tests`, `Integration tests`, `Build`, `Playwright smoke` and `Merge guard` to pass before a pull request can merge, with **no bypass actors** so it binds the repository owner too, and with force-pushes to and deletion of `main` blocked. No "required approving review" rule, because Anas and every agent share one GitHub identity (STANDARDS §1.11) and nobody could approve a pull request they are deemed to have authored. Chosen over a required-review rule (option 2 of TAS-60), which was not recommended. | Anas applies the ruleset (repository settings are outside agent control): GitHub → repository **Settings → Rules → Rulesets → New branch ruleset**; name `main`, enforcement **Active**, bypass list **empty**, target branch **Include default branch**; rules **Restrict deletions**, **Block force pushes**, **Require status checks to pass** with the seven check names above (source: GitHub Actions) and **Require branches to be up to date before merging** left off; **Require a pull request before merging** on with **0** required approvals. Once live, a pull request with any of the seven checks red, missing or still running cannot be merged by anyone. Independent review stays in Paperclip (STANDARDS §1.9); merge approval stays with Anas (§1.10). Renaming any of the seven CI jobs changes a required check and must be flagged in the pull request so the ruleset is updated in the same step (STANDARDS §1.12). FlowBoard Lead verifies the live ruleset through `GET /repos/anas-mattar/flowboard/rules/branches/main` and records the verification on TAS-60. |

---

## 2. Recorded answers (3 October 2026)

These readings were presented to Anas alongside the decisions as "answers that only need recording" and were accepted without objection.

| ID | Topic | Resolves | Recorded answer | Engineering consequence |
|---|---|---|---|---|
| **CL-A1** | Observer seats | FS §11 Q3; FS §6 ("Business tier and above") versus BM §4.1 ("free above the Free tier"); TAS-7 §2.3 | Follow BM §4.1: Observers are free on Team and above. | No MVP impact because billing is deferred (CL-D5). The Observer role is in the FS §6 permission matrix from day one. |
| **CL-A2** | Card delete | C-13; FS §7 (`DELETE /v1/cards/{id}` archives); PT hard delete; TAS-7 §2.6 | "Delete" means archive with confirmation and 30-day restore. A minimal per-board "Archived items" view with Restore ships in MVP-3 (FB-17). Hard purge after 30 days runs as a scheduled job written before launch. | `archived_at` timestamp, never a physical delete in application code. The same reading applies to lists (L-06, TAS-7 §2.5) and boards (B-06). |
| **CL-A3** | Due-date completion | C-08; PT name-based auto-complete; TAS-7 §2.7 | Explicit completion only. No list-name magic. | `due_complete` changes only through an explicit user action and writes `due.completed`. |
| **CL-A4** | Search mechanism | F-01 (client-side, live) versus FS §7 server search endpoint; TAS-7 §2.13 | Client-side filtering in v1.0 because a board is fully hydrated in one call (FS §7). The server search endpoint is added when boards exceed the hydration budget. | `GET /v1/boards/{id}/search` is not in the MVP API surface. |
| **CL-A5** | Funnel analytics | BM §13.3; BM §9; TAS-7 §2.15 | Funnel events are stored in FlowBoard's own database first. Vendor export can be added later without losing data. | `funnel_event` table in FB-01; events and activation query in FB-18. No analytics vendor in MVP. |
| **CL-A6** | Archive retention | B-06, C-13 (30 days); FS §11 Q5; TAS-7 §2.17 | 30 days, held as one configurable constant. | A single constant in `flowboard-shared`; the purge job and the restore view read it. |
| **CL-A7** | Default lists and WIP | B-02 (To Do, Doing, Done); PT (Doing has WIP 3); TAS-7 §2.18 | New boards get To Do, Doing (WIP limit 3) and Done. | Board creation seeds three lists with `wip_limit = 3` on Doing. Showcases the BM §2.3 flow-discipline differentiator on the first board. |

### 2.1 Recorded answers from the MVP-1 specification acceptance (3 October 2026, TAS-10)

Anas accepted the FB-00 to FB-04 specifications on the TAS-10 confirmation card on 3 October 2026, after FlowBoard QA's independent review (TAS-12). The acceptance decided the five open assumptions below, each as recommended, and confirmed the engineering decisions CL-E9 to CL-E21 in §3.1.

| ID | Topic | Resolves | Recorded answer | Engineering consequence |
|---|---|---|---|---|
| **CL-A8** | Email verification in MVP | CL-O1; CL-E5; BM §1 two-minute metric; FB-02 §12 | No email verification before a user can create boards in MVP. Verification is added at launch readiness (FB-19) before public launch. | Signup is one screen and signs the user in immediately. Until FB-19, invitations are link-based (CL-D6), so unverified addresses are never emailed. |
| **CL-A9** | Workspace admin role | CL-O6; FS §6; CL-D7; CL-E12; FB-02 §12 | The user who creates the workspace at signup is its workspace admin and the only one in MVP. Additional admins are managed in the v2.0 admin console. | `workspace_member.role = 'admin'` for the creator, written in the signup transaction. No UI to change workspace roles in MVP. |
| **CL-A10** | Visual design | CL-O2; PT `:root` and `[data-theme="dark"]` tokens; FB-00 §12; FB-03 §12 | The prototype's design tokens (colours, spacing, radii, typography, light and dark palettes) are the approved visual design for v1.0. | Frontend copies PT tokens unchanged into CSS custom properties in FB-00; components use only those variables so a later design pass replaces values, not components. |
| **CL-A11** | Board menu wording | CL-O7; B-06; CL-A2; CL-E16; FB-04 §12 | MVP-1 offers one board menu item, "Archive board", behind a confirmation dialog. No separately worded "Delete" action. | One string key in the message catalogue; changing the wording later needs no API or data change. |
| **CL-A12** | Default board colour | CL-O8; B-01; CL-E15; FB-04 §12 | A new board takes the next colour of the five-colour PT palette, cycling by the number of boards ever created in the workspace. No recolour control in MVP-1; the API accepts `color`. | One function in `flowboard-shared`; a colour picker can be added as a small FB-04 follow-up without data changes. |

---

## 3. Engineering readings adopted in the approved plan

The following resolutions come from the TAS-7 conflict table (§2) and were approved as part of CL-D1 and CL-D9. They are listed separately because they are engineering interpretations of the inputs rather than business choices.

| ID | Topic | Resolves | Reading | Trace |
|---|---|---|---|---|
| **CL-E1** | Assigning a non-member to a card | C-07 ("assigning a non-member adds them to the board") versus FS §6 (only board admins invite) | The card member picker offers board members only. Board admins get an "invite and assign" path. The server enforces FS §6 regardless of UI. | TAS-7 §2.4 |
| **CL-E2** | Deleting a list | L-06; FS §7; PT drops cards | Confirmation, list archived, cards archived and restorable. | TAS-7 §2.5 |
| **CL-E3** | Audit log in v1.0 | FS §8 "full audit log" versus FS §10 and BM §4.2 (admin console in Business/v2.0) | The append-only card activity feed (FS §5.2) is the v1.0 audit trail. An admin audit console is v2.0. | TAS-7 §2.8 |
| **CL-E4** | Free-tier 30-day history | BM §4.2 versus FS §5.2 (append-only, never edited) | History is never deleted; visibility is restricted by plan. Not in MVP. | TAS-7 §2.9 |
| **CL-E5** | Authentication method | FS §8 (bcrypt/argon2), FS §7 (bearer tokens), PT (hard-coded user) | Email and password with argon2id. httpOnly cookie sessions for the web app, bearer tokens accepted for non-browser clients. No email verification in MVP (protects the BM §1 two-minute metric); add before public launch. | TAS-7 §2.12 |
| **CL-E6** | Prototype behaviours not to copy | PT uses `prompt()` dialogs, native HTML5 drag and drop, no confirmations, no starred sorting | PT is a visual and interaction reference only. Inline forms replace prompts. A keyboard-capable drag library is required (X-03, C-11, FS §8). Starred boards sort first (B-04). | TAS-7 §2.19 |
| **CL-E7** | Internationalisation | FS §8 (externalised strings, RTL-ready, locale dates) | Strings are externalised and CSS uses logical properties from the first screen. No translations are produced in MVP. | TAS-7 §2.20 |
| **CL-E8** | Deferred non-functional requirements | FS §8 availability, backups, SSO, residency options | Applied at hosting time (FB-20) or in v2.0, per CL-D1 and CL-D8. | TAS-7 §1.3 |

### 3.1 Engineering decisions for the MVP-1 specifications (3 October 2026, TAS-10)

These decisions were needed to write the FB-00 to FB-04 specifications. They are engineering choices inside the scope Anas approved (CL-D1, CL-D7, CL-D9, CL-E5), not business decisions. They became binding on 3 October 2026 when Anas accepted the specifications on Paperclip issue TAS-10 (see §2.1); a later change needs a superseding entry per §5. Each cites the specification that depends on it.

| ID | Topic | Resolves | Decision | Consequence | Spec |
|---|---|---|---|---|---|
| **CL-E9** | Session mechanism | CL-E5 (cookie sessions plus bearer tokens); FS §7 bearer auth; FS §8 rate limiting | One opaque session token (32 random bytes, base64url) stored as a SHA-256 hash in the `session` table. The web app receives it in an `httpOnly`, `Secure` (outside local development), `SameSite=Lax`, `Path=/` cookie named `fb_session`. Non-browser clients send `tokenResponse: true` on signup or login and receive the same token in the response body to use as `Authorization: Bearer`. Sessions expire 30 days after last use and are renewed when more than one day old. Logout deletes the row. State-changing cookie-authenticated requests must carry an `Origin` header that matches the configured web origin. | `session` table in FB-01; auth routes in FB-02. No JWTs; revocation is a row delete. | FB-02 |
| **CL-E10** | Password and email rules | FS §8 (argon2 hashing); no policy stated | Passwords are 10 to 128 characters with no composition rules, hashed with argon2id using the OWASP-recommended parameters held as constants in one module. Emails are trimmed, lower-cased for uniqueness (unique index on `lower(email)`), at most 254 characters. Display names are 1 to 80 characters. Signup and login errors never reveal whether an email is registered. | Zod schemas `SignupRequest`, `LoginRequest` in `flowboard-shared`. | FB-02 |
| **CL-E11** | Rate limits on authentication routes | FS §8 "rate limiting per token" | Login: 10 attempts per 15 minutes per IP and 5 per 15 minutes per email. Signup: 5 per hour per IP. Exceeding a limit returns `429` with `Retry-After`. Limits are constants, in-memory in MVP (single API instance, ADR-001). | `@fastify/rate-limit` or equivalent; constants in `flowboard-api/src/config`. | FB-02 |
| **CL-E12** | Workspace bootstrap at signup | BM §1 two-minute metric; CL-D7; CL-O6 | Signup creates, in one transaction: the user, a workspace named "<display name>'s workspace" (externalised string), the `workspace_member` row with role `admin`, and the funnel events `user.signed_up` and `workspace.created`. No workspace naming step is shown before the first board. The workspace name can be changed later (not in MVP-1). | `POST /v1/auth/signup` response carries the workspace. `GET /v1/me` returns the user's workspaces; the UI uses the first by creation date until a switcher exists (CL-D7). | FB-02 |
| **CL-E13** | Theme and sidebar persistence | X-02; X-04; TAS-7 FB-03 acceptance ("theme persists per user; sidebar collapse persists") | Theme (`light`, `dark`, `system`) is stored on `user.theme` and changed through `PATCH /v1/me`, so it follows the user across devices; the web app mirrors it in `localStorage` to avoid a flash before the first response. Sidebar collapse is a device preference stored in `localStorage` only. | `user.theme` column in FB-01; `PATCH /v1/me` in FB-02; shell behaviour in FB-03. | FB-03 |
| **CL-E14** | Board star is per user | B-04; FS §5 puts `starred` on `board` | A star is a personal preference, so it lives in a `board_star (board_id, user_id)` table rather than on `board`. `GET /v1/boards` returns `starred` computed for the caller. Any user who can view the board may star it. | FS §5 `board.starred` is implemented as the join table; the API shape still exposes `starred` per board. | FB-04 |
| **CL-E15** | Board colour | B-01 colour swatch; FS §7 PATCH "recolour"; PT palette | A new board takes the next colour from the PT palette (`#3d6df0`, `#8f5bff`, `#22a06b`, `#e2703a`, `#c9372c`), cycling by the number of boards ever created in the workspace. `PATCH /v1/boards/{id}` accepts `color` (any `#rrggbb`) so the API matches FS §7; no recolour control ships in the MVP-1 UI because FS §4 defines none. | Palette constant in `flowboard-shared`. | FB-04 |
| **CL-E16** | Board archive and delete in MVP-1 | B-06 (archive or delete, confirmation, 30-day restore); CL-A2; FS §7 (no `DELETE /v1/boards`) | MVP-1 ships one action, "Archive board", behind a confirmation dialog, implemented as `PATCH /v1/boards/{id}` with `archived: true`. Archived boards disappear from the sidebar and return `404` to non-admins. Restore and the archived-items view are FB-17; a separate "Delete" wording is not introduced because CL-A2 makes the two actions identical. | `archived_at` set on `board` only; lists and cards keep their own `archived_at` untouched so restore is exact. | FB-04 |
| **CL-E17** | Board visibility and the sidebar count | B-01 "boards I belong to"; FS §6 workspace admin "view board" | `GET /v1/boards` returns non-archived boards in the caller's workspaces where the caller is a `board_member` or a workspace `admin`, ordered starred first, then by name (case-insensitive). The sidebar card count is the number of non-archived cards on non-archived lists. | One query with a lateral count; index on `card(list_id) where archived_at is null`. | FB-04 |
| **CL-E18** | Optimistic concurrency on board edits in MVP-1 | FS §7.1 (`If-Match`, `409`) | `PATCH /v1/boards/{id}` accepts an optional `If-Match` header carrying the `updatedAt` value last seen by the client. When present and stale, the API returns `409` and the client re-fetches. The header is optional in MVP-1 so API clients are not broken; the web app always sends it. The same rule will apply to lists and cards (FB-05, FB-06). | Weak ETag semantics; no `ETag` response header needed because `updatedAt` is in every response body. | FB-04 |
| **CL-E19** | `activity_event` has no `updated_at` | STANDARDS §1.3 ("every table has `updated_at`") versus FS §5.2 (append-only, never edited) | `activity_event` and `funnel_event` carry `id` and `created_at` only. An `updated_at` column on an immutable table would be misleading. This is the only exception to STANDARDS §1.3. | Drizzle schema and migration in FB-01. | FB-01 |
| **CL-E20** | Funnel events written by MVP-1 | BM §13.3 (instrument the funnel with v1.0); CL-A5; FB-18 owns the activation query | FB-02 writes `user.signed_up` and `workspace.created`; FB-04 writes `board.created`. The remaining events (first card, invite sent, invite accepted, activation) and the activation query are FB-18. Event names live in one enum in `flowboard-shared`. | `funnel_event` rows from day one; no analytics vendor. | FB-02, FB-04 |
| **CL-E21** | Local development database | CL-D8 (no cloud dependency); STANDARDS §1.5 | PostgreSQL 16 runs from `docker-compose.yml` with database `flowboard`, user `flowboard`, password `flowboard` on port 5432, documented in the README as non-secret. Integration tests use a second database `flowboard_test` on the same instance, created by the compose init script, so a test run never truncates development data. | `.env.example` carries both connection strings. | FB-00 |

### 3.2 Engineering decisions recorded during implementation (3 October 2026, FB-01)

Decisions that surfaced while implementing an approved specification. Each is an engineering choice inside the approved scope; none changes a requirement, an API shape or a data model. The specification text is amended in the same pull request so the two never disagree, and the amendment cites the entry here.

| ID | Topic | Resolves | Decision | Consequence | Spec |
|---|---|---|---|---|---|
| **CL-E22** | Migration numbering starts at `0000` | FB-01 spec §7 (as approved) named the first migration `0001_init`; `drizzle-kit` numbers migrations from `0000` and requires contiguous zero-based tags in `drizzle/meta/_journal.json`, so a renamed file breaks `drizzle-kit generate` (verified by FlowBoard Backend on Paperclip issue TAS-16) | The tool's numbering wins. The first migration is `0000_init.sql` with `0000_init.down.sql`; later migrations are `0001_…`, `0002_…` as generated. Migration names are never hand-edited. The spec text is amended to match (FB-01 §7); the approved content of the migration is unchanged. | Nothing to change in code: `main` already carries `0000_init` (PR #13, merge `d2974dc`). Future specs name migrations by purpose only ("one migration adding `x`") and leave the number to the tool. | FB-01 |

---

## 4. Open engineering assumptions

These are assumptions engineering is working under that have **not** been put to Anas. A task that depends on one must cite it, and the assumption must be moved to §1 or §2 once answered. Rows marked "Answered" are kept for traceability; the binding text is the CL-A or CL-D entry they point to. CL-O3, CL-O4 and CL-O5 remain open.

| ID | Assumption | Why it matters | Default until answered | Owner of the question |
|---|---|---|---|---|
| **CL-O1** | Email verification is not required before a user can create boards in MVP. | Protects time-to-first-board (BM §1) but allows unverified addresses in invitations. Public launch needs verification (FB-19). | No verification in MVP; verification is added at launch readiness. | Answered 3 October 2026 (TAS-10): recorded as **CL-A8**. |
| **CL-O2** | The prototype's visual design tokens (colours, spacing, typography, light and dark palettes) are the approved visual design for v1.0. | Frontend tasks copy tokens from PT into CSS variables. A separate design pass would change every screen. | Use PT tokens unchanged. | Answered 3 October 2026 (TAS-10): recorded as **CL-A10**. |
| **CL-O3** | The `smoke.py` Playwright test referenced in FS §9 does not exist in the repository and will not be supplied. | QA writes its own end-to-end suite from the FS story IDs. | Treat as absent. | FlowBoard QA, once the agent exists (CL-D10). |
| **CL-O4** | Card copy (C-12) copies labels, members, description, checklist and due date, but not comments or activity ("activity resets"). | C-12 says activity resets but does not list which fields copy. | Copy all card fields and child rows except comments and activity. | FlowBoard Lead, to confirm with the FB-06 specification. |
| **CL-O5** | Sorting a list by due date (L-05) is a one-off reorder that rewrites positions, not a persistent sort mode. | A persistent mode would conflict with drag ordering (C-02). | One-off reorder, written as position updates with one `card.moved` event per card that changed position. | FlowBoard Lead, to confirm with the FB-05 specification. |
| **CL-O6** | "Workspace admin" in FS §6 is the role of the user who created the workspace at signup; additional workspace admins are managed only in v2.0 (admin console). | FS §6 grants workspace admins board rights without defining how the role is assigned. | Creator is workspace admin; no UI to change it in MVP. | Answered 3 October 2026 (TAS-10): recorded as **CL-A9**. |
| **CL-O7** | The MVP-1 board menu offers "Archive board" only; no separately worded "Delete" action (CL-E16, CL-A2, B-06). | User-facing copy. B-06 says "archive or delete"; CL-A2 makes them the same action, so one item avoids implying two outcomes. | One menu item "Archive board" behind a confirmation dialog. A "Delete" wording would be a one-string catalogue change. | Answered 3 October 2026 (TAS-10): recorded as **CL-A11**. |
| **CL-O8** | A new board's colour is the next colour of the five-colour PT palette, cycling by the number of boards ever created in the workspace (CL-E15). | A genuine design choice: FS and PT only establish that a board has a colour swatch (B-01) and show the palette. It decides the colour of every board a user creates; no recolour control ships in MVP-1. | Cycle through the PT palette; `PATCH /v1/boards/{id}` accepts `color` so a picker can be added later without data changes. | Answered 3 October 2026 (TAS-10): recorded as **CL-A12**. |
| **CL-O9** | `main` should be protected by a GitHub repository ruleset that requires the CI status checks `Lint`, `Typecheck`, `Unit tests`, `Integration tests`, `Build`, `Playwright smoke` and `Merge guard` to pass before a pull request can merge, with no bypass actors (so it applies to the owner as well) and with force-pushes and deletion of `main` blocked. No "required approving review" rule, because Anas and every agent share one GitHub identity (STANDARDS §1.11, §1.12). | STANDARDS §1.10 relies on a human reading the pull request before merging. Pull request #26 (`scratch/TAS-49-red-proof`, title "DO NOT MERGE", `Playwright smoke` red) was merged into `main` on 4 October 2026 and broke `main`; a required-checks rule would have blocked the merge button. Repository settings are outside what agents can change. | Convention only (STANDARDS §1.12): red-run proofs open no pull request, and the `Merge guard` CI job turns a scratch pull request red. A red check remains advisory until the ruleset exists. | Answered 4 October 2026 (TAS-60): recorded as **CL-D11**. Applying the ruleset remains with Anas; verification is recorded on TAS-60. |

---

## 5. How to add an entry

1. Choose the next ID in the right section (D for an Anas decision, A for a recorded answer, E for an engineering reading approved as part of a plan, O for an open assumption).
2. Cite the FS, BM or PT location that the entry clarifies and, where one exists, the TAS-7 conflict row.
3. State the consequence for the data model, API or UI in one line so a reader does not have to infer it.
4. Add the date to the section heading when a new batch of decisions lands. Do not edit earlier entries; add a superseding entry and mark the old one "Superseded by CL-xx".
5. Never edit `docs/product/`.
