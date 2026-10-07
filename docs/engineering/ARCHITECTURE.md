# FlowBoard Architecture Baseline

**Status:** approved baseline, derived from the TAS-7 plan (§3) accepted by Anas on 3 October 2026 (decision CL-D9). The stack decision and the alternatives considered are recorded in `adr/ADR-001-technology-stack.md`.
**Scope:** the v1.0 "Core Kanban" system (FS §1.2) delivered as MVP-1, MVP-2 and MVP-3 (CL-D1). Launch-readiness concerns (hosting, backups, billing) are noted where they constrain the design but are not designed here.
**Citations:** **FS §n** for `docs/product/FUNCTIONAL_SPEC.md`, **BM §n** for `docs/product/BUSINESS_MODEL.md`, **PT** for the prototype, **CL-xx** for `CLARIFICATIONS.md`.

This document describes the intended system. Nothing in it is implemented yet; the `flowboard-api` and `flowboard-web` folders are empty placeholders until FB-00 lands.

---

## 1. System overview

```
┌──────────────────────────────┐        HTTPS / JSON (FS §7)        ┌──────────────────────────────┐
│  flowboard-web               │ ─────────────────────────────────► │  flowboard-api               │
│  React 19 + Vite             │ ◄───────────────────────────────── │  Fastify 5 + Zod             │
│  TanStack Router / Query     │     WebSocket  board:{id}  (FS §7) │  OpenAPI from schemas        │
│  dnd-kit, TanStack Virtual   │ ◄───────────────────────────────── │  Drizzle ORM                 │
└──────────────┬───────────────┘                                    └──────────────┬───────────────┘
               │ imports types and schemas                                         │ SQL, migrations
               ▼                                                                   ▼
┌──────────────────────────────┐                                    ┌──────────────────────────────┐
│  flowboard-shared            │ ◄──────────────────────────────────│  PostgreSQL 16               │
│  Zod schemas, API types,     │   imports types and schemas        │  (Docker Compose locally)    │
│  activity event names,       │                                    │                              │
│  position maths, constants   │                                    │                              │
└──────────────────────────────┘                                    └──────────────────────────────┘
```

Three packages in one pnpm monorepo. The web app and the API never share code directly; everything common goes through `flowboard-shared`.

| Component | Responsibility | Trace |
|---|---|---|
| `flowboard-web` | Single-page application: sidebar, top bar, board canvas, card modal, filters, theme. Talks only to the public `/v1` API and the board WebSocket. | FS §4 screens; FS §8 browser support and accessibility |
| `flowboard-api` | Public REST API at `/v1`, authentication, authorisation, business rules, activity recording, realtime fan-out, scheduled jobs. | FS §7 API surface; FS §6 permissions; FS §5.2 activity |
| `flowboard-shared` | Zod schemas for every contract, inferred types, activity event name enum, sparse-float position maths, retention and default constants. | FS §5.2 single source of truth; FS §7 event parity |
| PostgreSQL 16 | System of record. One database, one schema, migrations in git. | FS §5 relational model; FS §8 backups via managed Postgres later |

---

## 2. Backend: `flowboard-api`

### 2.1 Shape

- **Fastify 5** with the Zod type provider. Each route declares its request and response schemas from `flowboard-shared`; Fastify validates inbound data and serialises outbound data from the same schema. OpenAPI is generated from these declarations.
- **Layering:** `routes/` (HTTP concerns only) call `services/` (business rules, authorisation, activity recording) which use `repositories/` (Drizzle queries). Authorisation is one module, applied by services, never inline in routes (STANDARDS §1.4).
- **Errors:** a single error type maps to HTTP status codes. `409` for stale `If-Match` (FS §7.1), `403` for authorisation, `404` for objects the caller cannot see (no existence leak across workspaces), `422` for validation.
- **Rate limiting** per token and per IP on authentication routes (FS §8 security).

### 2.2 Authentication (CL-E5)

- Email and password. Passwords hashed with argon2id.
- Web app sessions in httpOnly, secure, sameSite cookies backed by a `session` table. Bearer tokens accepted on the same routes for non-browser clients (FS §7 says bearer-token auth).
- No email verification in MVP (CL-O1); added at launch readiness (FB-19).
- Signup creates the user, a workspace, and the `workspace_member` row with role workspace admin in one transaction (BM §1 two-minute metric; CL-D7).

### 2.3 Single hydration call per board

`GET /v1/boards/{id}` returns the board, its members, labels, lists and cards (with label IDs, member IDs, checklist summary, comment count and due state) in **one response** (FS §7). The web app renders the whole board from this payload and filters client-side (CL-A4). Card detail (description, checklist items, comments, activity) is fetched lazily when the modal opens. The 1,000-card budget in FS §8 is measured against this call (FB-16).

### 2.4 Realtime: one WebSocket channel per board

- The API exposes a WebSocket endpoint; a client subscribes to `board:{id}` after the same authorisation check as `GET /v1/boards/{id}`.
- Every state change that writes an activity event also publishes **the same event object** to the board channel (FS §7: "broadcasts the same event objects that the activity feed stores"). The schema in `flowboard-shared` is shared by the database row, the activity feed response and the WebSocket frame.
- Fan-out is in-process first. Redis pub/sub is introduced only when more than one API instance runs (BM §10 realtime cost risk argues for the simplest thing first). The publish interface is abstracted so that swap does not touch services.
- Clients reconcile by applying events to the TanStack Query cache; on reconnect they re-hydrate the board. Target: a change by one member visible to another in under 500 ms p95 (FS §8), proven by a two-browser Playwright test (FB-15).

### 2.5 Concurrency (FS §7.1)

- Card moves are last-write-wins on `(list_id, position)` with an `updated_at` precondition.
- Field edits send `If-Match` with the card's `updated_at`; a stale value returns `409` and the client re-fetches instead of overwriting.
- The web app applies optimistic updates for moves and rolls back on failure (FB-07).

### 2.6 Scheduled jobs

- **Position re-balance is not a job** (amended 7 October 2026, CL-E36). FS §5.1 describes a background job; in MVP-2 the re-balance runs inline in the move transaction instead: when a move writes a position and the gap to a neighbour falls below the minimum, the same transaction rewrites that container's positions with even spacing while holding the container row with `SELECT … FOR UPDATE`. It remains the only code path that updates positions it did not receive from a user action. A job runner can take this over at FB-16 without changing semantics (FB-07 specifies and tests it).
- **Archive purge:** physically deletes rows whose `archived_at` is older than the retention constant (CL-A6). Written before launch, not in MVP-1 (FB-17).
- Jobs (the archive purge) run in the API process on a timer in MVP; a separate worker is a launch-readiness concern.

---

## 3. Data model

The FS §5 model is implemented as written, with the additions below. The authoritative definition is the Drizzle schema and migrations in `flowboard-api` once FB-01 lands.

| Table | Notes beyond FS §5 | Trace |
|---|---|---|
| `user` | `email` unique (case-insensitive), `password_hash`, `initials`, `avatar_color`, `theme`. | FS §5; CL-E5, CL-E13 |
| `workspace` | `plan` and limit columns stored but not enforced. | FS §5; CL-D5 |
| `workspace_member` | `(workspace_id, user_id, role)`. Many-to-many from day one. | CL-D7 |
| `board` | `archived_at` replaces the boolean `archived`. `starred` is per user, so it lives in `board_star` rather than on `board` (B-04 is a personal preference). | B-04, B-06; CL-A2 |
| `board_star` | `(board_id, user_id)` join table; one row per starred board per user. | B-04; CL-E14 |
| `board_member` | `(board_id, user_id, role)` with role in {board admin, member, observer}. | FS §6 |
| `label` | `board_id` mandatory; six defaults seeded on board creation. | CL-D3 |
| `list` | `position` sparse float, `wip_limit` nullable, `archived_at`. | FS §5.1; L-04; CL-D4 |
| `card` | `position` sparse float, `due_at`, `due_complete`, `archived_at`, `created_by`. | FS §5; C-08; CL-A3 |
| `card_label`, `card_member` | Join tables as in FS §5. | FS §5 |
| `checklist_item` | `position` sparse float. | C-09 |
| `comment` | Immutable in v1.0 (no edit story exists). | C-10 |
| `activity_event` | Insert-only. `type` constrained to the FS §5.2 enum from `flowboard-shared`. `payload` is JSONB validated by the per-type schema. | FS §5.2; STANDARDS §1.3 |
| `invitation` | `board_id`, `email`, `token_hash`, `role`, `expires_at`, `accepted_at`. Link-based in MVP; only the token hash is stored. | B-05; CL-D6 |
| `session` | Backs both httpOnly cookie sessions and bearer tokens; only `token_hash` is stored. | CL-E5, CL-E9 |
| `funnel_event` | `workspace_id`, `user_id`, `type`, `payload`, `created_at`. Own database first. Insert-only. | BM §9, §13.3; CL-A5 |

Conventions that apply to every table: UUID v7 primary keys, `created_at` and `updated_at`; soft delete only through `archived_at`; all timestamps UTC. Three deliberate exceptions:

- The five join tables (`workspace_member`, `board_member`, `board_star`, `card_label`, `card_member`) use a composite primary key instead of a surrogate `id`.
- The append-only event tables `activity_event` and `funnel_event` have no `updated_at`, because they are never edited (CL-E19).
- `board_star`, `card_label` and `card_member` carry `created_at` only: a row's existence is its whole state, so there is nothing to update.

### 3.1 Ordering with sparse floats (FS §5.1)

Positions are double-precision floats. A new item at the end takes `last + 1024`. A drop between neighbours takes their midpoint. When a midpoint would fall within a minimum gap of its neighbours, the move still succeeds and the same transaction re-balances that container inline (CL-E36; §2.6). Re-balanced neighbours write no activity events but do bump `updated_at`. The position module in `flowboard-shared` is pure, unit-tested, and shared by the API (persisting) and the web app (optimistic placement).

### 3.2 Soft delete and retention

`archived_at` on `board`, `list` and `card`. Archiving a list archives its cards (L-06, CL-E2) by setting the same timestamp. Restore clears the timestamp and places the item at the end of its original container (FB-17). Queries exclude archived rows by default; the archived-items view is the only consumer that includes them. The retention period is one constant (CL-A6).

---

## 4. Frontend: `flowboard-web`

- **React 19 + Vite + TypeScript.** TanStack Router for routes (`/login`, `/signup`, `/boards/:id`, `/boards/:id/cards/:cardId` for the modal), TanStack Query for server state keyed by board.
- **Drag and drop with dnd-kit** using pointer and keyboard sensors, with screen-reader announcements. Every drag has a menu equivalent (C-11). Native HTML5 drag and drop from PT is not used (CL-E6).
- **Virtualisation with TanStack Virtual** for list bodies beyond 150 cards (FS §8). Lists are 286 px wide, independently scrollable (FS §4.4, §4.5).
- **Design tokens** copied from PT into CSS variables (light and dark palettes, spacing, radii, typography). Tailwind utility classes consume those variables. Theme choice persists per user (X-02).
- **Strings** in a message catalogue, logical CSS properties, text alongside colour (STANDARDS §1.6).
- **Client-side search and filter** over the hydrated board (F-01 to F-04, CL-A4). Filter state lives in the URL so it survives reload and can be shared.
- **Toasts** for every destructive or state-changing action within 200 ms (X-01), fired on optimistic update rather than on server acknowledgement so the budget holds on slow links.
- **Confirmations** for board, list and card deletion and for "archive all cards" use an in-app dialog with focus trap, not `window.confirm` or `prompt()` (CL-E6).

---

## 5. Cross-cutting concerns

| Concern | Approach | Trace |
|---|---|---|
| Authorisation | FS §6 matrix enforced in the API; UI mirrors it for affordances only. | FS §6; STANDARDS §1.4 |
| Audit trail | The append-only `activity_event` table is the v1.0 audit log. | FS §5.2; CL-E3 |
| Internationalisation | UTF-8, externalised strings, logical CSS, `Intl` date formatting; no translations in MVP. | FS §8; CL-E7 |
| Accessibility | WCAG 2.2 AA; axe-core in every end-to-end run; keyboard equivalents; focus management. | FS §8; STANDARDS §3 |
| Performance | Single hydration call, virtualisation, optimistic updates, CI performance budget on a seeded 1,000-card board. | FS §8; BM §2.3; CL-D2 |
| Security | TLS terminates at the host (launch readiness); argon2id; httpOnly cookies; rate limiting; no secrets in git. | FS §8; STANDARDS §1.5 |
| Observability | Structured JSON logs from Fastify (pino) with request IDs; funnel events in the database. Metrics and tracing are launch-readiness items. | BM §9, §13.3 |
| Email | Development mailer logs messages; provider chosen before MVP-3. | CL-D6 |
| Hosting | Local Docker Compose only. One EU region at launch; provider decided then. | CL-D8 |

---

## 6. Repository layout

```
flowboard/
  docs/
    product/                 management inputs, never edited by engineering
    engineering/
      CLARIFICATIONS.md      decisions and recorded answers, dated
      ARCHITECTURE.md        this document
      STANDARDS.md           coding standards and definition of done
      adr/                   architecture decision records
      specs/                 one specification per backlog item, per specs/README.md
  flowboard-api/             Fastify service, Drizzle schema, migrations, seed, tests
  flowboard-web/             React app, Playwright tests
  flowboard-shared/          Zod schemas, types, event names, position maths, constants
  .github/workflows/ci.yml   lint, typecheck, unit, integration, build, e2e smoke
  docker-compose.yml         PostgreSQL 16 for local development
  pnpm-workspace.yaml  package.json  tsconfig.base.json  .editorconfig  .gitignore
```

The two placeholder folders already in the repository keep their names. `flowboard-shared` is new. All of this except `docs/` is created by FB-00.

---

## 7. Delivery sequence

| Increment | Architectural milestone |
|---|---|
| MVP-1 "First board" (FB-00 to FB-04) | Monorepo, CI, migrations, auth, app shell, boards with single hydration call. Proves every layer on a small surface. |
| MVP-2 "Core Kanban" (FB-05 to FB-14) | Lists, cards, drag and drop, labels, members and invitations, due dates, checklists, comments, search and filter, polish. No realtime yet; clients re-fetch on focus. |
| MVP-3 "Together and at scale" (FB-15 to FB-18) | WebSocket channel, optimistic concurrency, virtualisation and the performance budget, archived-items view and purge job, funnel instrumentation. |
| Launch readiness (FB-19 to FB-21) | Export and erasure, email provider, hosting, backups, limit enforcement and billing. Separate decisions and spend. |

---

## 8. Decisions deferred

| Topic | Deferred to | Reason |
|---|---|---|
| Redis for realtime fan-out | When a second API instance is needed | BM §10 cost risk; single instance suffices for MVP |
| Server-side search endpoint | When boards exceed the hydration budget | CL-A4 |
| Separate job worker | Launch readiness | Timer in the API process is enough for MVP |
| Email provider | Before MVP-3 | CL-D6; new spending |
| Hosting provider, TLS, backups, monitoring | Launch readiness (FB-20) | CL-D8; new spending and access |
| SSO, SCIM, admin audit console, US residency | v2.0 | FS §10; BM §4.2; CL-E3 |
