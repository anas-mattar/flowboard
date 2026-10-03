**Backlog item:** FB-01 Data model and migrations
**Status:** Ready for approval
**Approved by:** pending, Paperclip issue TAS-10
**Owner(s):** FlowBoard Backend (`flowboard-api` Drizzle schema, migrations, seed; `flowboard-shared` entity schemas, position maths, constants)
**Reviewer:** FlowBoard QA
**Increment:** MVP-1

---

### 1. Goal

After FB-01 the whole FS §5 data model exists as reviewed migrations with a tested down path, the sparse-float ordering rules of FS §5.1 are a unit-tested module shared by API and web app, and a seed script recreates the three prototype boards so every later task has realistic fixtures. FB-01 creates every MVP table now, including those first used in MVP-2 and MVP-3, so that later tasks add behaviour rather than schema and migrations stay rare and reviewable.

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | §5 | Entities and fields: Workspace, Board, BoardMember, Label, List, Card, CardLabel, CardMember, ChecklistItem, Comment, ActivityEvent, User | [REQ] |
| FS | §5.1 | Sparse-float (or lexicographic) positions; midpoint on drop; background re-balance when gaps get too small | [REQ] |
| FS | §5.2 | Activity event type list; append-only, never edited | [REQ] |
| FS | §6 | Roles: workspace admin, board admin, board member, observer | [REQ] |
| FS | §8 security | argon2 password hash stored, never the password | [REQ] |
| FS | §9 | Three seeded prototype boards with lists, cards, labels, members, due dates, checklists and comments | [REQ] as fixture source |
| BM | §9, §13.3 | Funnel instrumentation shipped with v1.0; events stored in our own database | [REQ] |
| CL | CL-D3 | Labels board-scoped; six defaults per board | [REQ] |
| CL | CL-D5 | Plan and limits stored on the workspace, not enforced | [REQ] |
| CL | CL-D6 | Invitation rows with a token (link-based) | [REQ] |
| CL | CL-D7 | Many-to-many user/workspace from day one | [REQ] |
| CL | CL-A2, CL-A6 | Soft delete via `archived_at`; 30-day retention as one constant | [REQ] |
| CL | CL-E5, CL-E9 | `session` table for cookie and bearer sessions | [ENG] |
| CL | CL-E13 | `user.theme` | [ENG] |
| CL | CL-E14 | `board_star` join table instead of `board.starred` | [ENG] |
| CL | CL-E19 | `activity_event` and `funnel_event` have no `updated_at` | [ENG] |
| STANDARDS | §1.3 | UUID v7 ids, `created_at`, `updated_at`, migrations only, tested down path, insert-only activity | [REQ] |
| ARCHITECTURE | §3, §3.1, §3.2 | Table notes, position algorithm, soft delete | [REQ] |
| TAS-7 | §4 FB-01 | Acceptance: migrations apply and roll back cleanly; positions are sparse floats with a re-balance routine and unit tests; seed recreates the three PT boards; `archived_at` on board, list, card | [REQ] |

### 3. Scope

**In scope**

- Drizzle schema in `flowboard-api/src/db/schema/` (one file per table) and the generated SQL migration(s) in `flowboard-api/drizzle/`, each with a hand-written down migration.
- Tables: `user`, `workspace`, `workspace_member`, `board`, `board_member`, `board_star`, `label`, `list`, `card`, `card_label`, `card_member`, `checklist_item`, `comment`, `activity_event`, `invitation`, `session`, `funnel_event`.
- Entity Zod schemas in `flowboard-shared/src/schemas/entities/` (`User`, `PublicUser`, `Workspace`, `Board`, `BoardMember`, `Label`, `List`, `Card`, `ChecklistItem`, `Comment`, `ActivityEvent`), the `ACTIVITY_EVENT_TYPES` and `FUNNEL_EVENT_TYPES` const enums, role enums, and constants (`ARCHIVE_RETENTION_DAYS = 30`, `POSITION_STEP = 1024`, `POSITION_MIN_GAP = 1e-6`, `DEFAULT_LISTS`, `DEFAULT_LABELS`, `BOARD_COLORS`).
- Position module `flowboard-shared/src/position.ts`: `positionAtEnd(last)`, `positionBetween(before, after)`, `needsRebalance(positions)`, `rebalance(count)`; all pure.
- Seed script `pnpm db:seed` recreating the PT data: five users (Anas Matar, Lena Fischer, Omar Haddad, Priya Nair, Tom Becker with PT initials and colours), one workspace "Acme Workspace" with Anas as admin and the others as members, three boards (Product Roadmap Q3 starred by Anas, Marketing Launch, Customer Support) with PT colours, lists, WIP limits, cards, labels, members, due dates relative to seed time, checklists, comments and `card.created` events. All seed users share a documented non-secret password.
- Integration test fixtures: a `resetDatabase()` helper and `seedMinimal()` helper for route tests (STANDARDS §4).
- `ARCHITECTURE.md` §3 updated only if the final schema differs from the table there (expected: `board_star`, `user.theme`, no `updated_at` on event tables, which this specification already records).

**Out of scope**

- Any route that reads or writes these tables (FB-02 onward).
- The re-balance scheduled job (FB-07, when drags start producing small gaps); FB-01 ships the pure function only.
- The archive purge job (FB-17).
- Database roles that revoke `UPDATE`/`DELETE` on `activity_event` in production (FB-20); FB-01 adds a repository-level guard and a test instead.

### 4. Acceptance criteria

1. **[REQ, STANDARDS §1.3]** `pnpm db:migrate` on an empty database applies every migration; `pnpm db:migrate:down` reverses them to an empty schema; applying again succeeds. An integration test runs up, down, up and asserts the table list each time.
2. **[REQ, FS §5]** Every FS §5 entity and field exists with the mapping in §7 of this specification; `created_by` on `card` and `board` references `user.id`.
3. **[REQ, FS §5.1]** `positionBetween(a, b)` returns the midpoint; `positionAtEnd(last)` returns `last + 1024` (or `1024` when the container is empty); `needsRebalance` is true when any neighbouring gap is below `1e-6`; `rebalance(n)` returns `1024, 2048, …`. Property-based tests cover ordering preservation.
4. **[REQ, FS §5.2]** `activity_event.type` is constrained by a CHECK to the 15 FS §5.2 names, which come from the single `ACTIVITY_EVENT_TYPES` enum; an integration test shows an `UPDATE` or `DELETE` through the repository layer throws, and that the Drizzle table object exposes no update or delete helper.
5. **[REQ, CL-A2]** `board`, `list` and `card` have nullable `archived_at timestamptz`; no table has a boolean `archived`.
6. **[REQ, CL-D7, FS §6]** `workspace_member.role` is constrained to `admin | member`; `board_member.role` to `admin | member | observer`; both have composite primary keys.
7. **[REQ, FS §8]** `user.password_hash` exists and no column named `password` exists; `user.email` has a unique index on `lower(email)`.
8. **[REQ, FS §9, TAS-7 FB-01]** `pnpm db:seed` on a migrated database produces exactly the PT boards: 3 boards, 11 lists, the PT cards with their labels, members, due dates, checklists and comments; running it twice is idempotent (it resets its own data first). An integration test asserts the counts.
9. **[REQ, CL-D3]** `label.board_id` is NOT NULL and `(board_id, name)` is unique; `DEFAULT_LABELS` holds the six PT labels with their colours.
10. **[REQ, STANDARDS §1.3]** Every table has a UUID v7 `id` (except the composite-key join tables), `created_at` and `updated_at` with defaults, with the sole exception recorded in CL-E19.
11. **[ENG]** Indexes in §7 exist, verified by an integration test that reads `pg_indexes`.

### 5. User interface

None.

### 6. API contract

None. No routes are added. The `flowboard-shared` entity schemas introduced here are the building blocks for FB-02 and FB-04 responses:

- `PublicUser`: `{ id, displayName, initials, avatarColor }` (never email or hash).
- `User`: `PublicUser` plus `{ email, theme, createdAt }`.
- `Workspace`: `{ id, name, plan, createdAt }`.
- `Board`: `{ id, workspaceId, name, color, archivedAt, createdAt, updatedAt }`.
- `List`: `{ id, boardId, name, position, wipLimit, archivedAt, createdAt, updatedAt }`.
- `Card`: `{ id, listId, title, position, dueAt, dueComplete, archivedAt, createdBy, createdAt, updatedAt }` (description and children are fetched separately, ARCHITECTURE §2.3).
- `Label`: `{ id, boardId, name, color }`.

All timestamps are UTC ISO 8601 strings in JSON; column names are `snake_case`, JSON fields `camelCase`.

### 7. Data changes

Migration `0001_init` (one migration for the whole model, with `0001_init.down.sql`):

| Table | Columns (type, constraints) | Notes |
|---|---|---|
| `user` | `id uuid pk`, `email text not null`, `password_hash text not null`, `display_name text not null`, `initials text not null`, `avatar_color text not null`, `theme text not null default 'system' check in (light, dark, system)`, `created_at`, `updated_at` | Unique index `user_email_lower_idx on (lower(email))` |
| `workspace` | `id`, `name text not null`, `plan text not null default 'free'`, `seats int null`, `board_limit int null default 3`, `user_limit int null default 10`, `card_limit int null default 500`, `created_by uuid fk user`, `created_at`, `updated_at` | Limits are configuration only (CL-D5); defaults are BM §4.2 Free values |
| `workspace_member` | `workspace_id fk`, `user_id fk`, `role text check in (admin, member)`, `created_at`, `updated_at`; pk `(workspace_id, user_id)` | Index on `user_id` for `GET /v1/me` |
| `board` | `id`, `workspace_id fk`, `name text not null check length 1..120`, `color text not null`, `archived_at timestamptz null`, `created_by fk user`, `created_at`, `updated_at` | Partial index `board_workspace_active_idx on (workspace_id) where archived_at is null` for the sidebar query |
| `board_member` | `board_id fk`, `user_id fk`, `role text check in (admin, member, observer)`, `created_at`, `updated_at`; pk `(board_id, user_id)` | Index on `user_id` |
| `board_star` | `board_id fk`, `user_id fk`, `created_at`; pk `(board_id, user_id)` | CL-E14 |
| `label` | `id`, `board_id fk not null`, `name text not null`, `color text not null`, `created_at`, `updated_at` | Unique `(board_id, name)` |
| `list` | `id`, `board_id fk`, `name text not null`, `position double precision not null`, `wip_limit int null check > 0`, `archived_at`, `created_at`, `updated_at` | Index `(board_id, position)` |
| `card` | `id`, `list_id fk`, `title text not null`, `description text null`, `position double precision not null`, `due_at timestamptz null`, `due_complete boolean not null default false`, `archived_at`, `created_by fk user`, `created_at`, `updated_at` | Partial index `card_list_active_idx on (list_id, position) where archived_at is null` for hydration and counts |
| `card_label` | `card_id fk`, `label_id fk`, `created_at`; pk `(card_id, label_id)` | Index on `label_id` for filters |
| `card_member` | `card_id fk`, `user_id fk`, `created_at`; pk `(card_id, user_id)` | Index on `user_id` |
| `checklist_item` | `id`, `card_id fk`, `text text not null`, `done boolean not null default false`, `position double precision not null`, `created_at`, `updated_at` | Index `(card_id, position)` |
| `comment` | `id`, `card_id fk`, `author_id fk user`, `body text not null`, `created_at`, `updated_at` | Index `(card_id, created_at desc)` |
| `activity_event` | `id`, `card_id fk`, `actor_id fk user`, `type text not null check in (FS §5.2 list)`, `payload jsonb not null default '{}'`, `created_at` | Index `(card_id, created_at desc)`; no `updated_at` (CL-E19) |
| `invitation` | `id`, `board_id fk`, `email text not null`, `token_hash text not null unique`, `role text check in (admin, member, observer)`, `invited_by fk user`, `expires_at timestamptz not null`, `accepted_at timestamptz null`, `created_at`, `updated_at` | Used from FB-09 |
| `session` | `id`, `user_id fk`, `token_hash text not null unique`, `expires_at timestamptz not null`, `last_seen_at timestamptz not null`, `user_agent text null`, `ip text null`, `created_at`, `updated_at` | Index on `user_id`; CL-E9 |
| `funnel_event` | `id`, `workspace_id fk null`, `user_id fk null`, `type text not null check in (FUNNEL_EVENT_TYPES)`, `payload jsonb not null default '{}'`, `created_at` | Index `(workspace_id, type, created_at)`; no `updated_at` (CL-E19) |

Foreign keys cascade on delete only from a parent that is itself physically purged (FB-17); application code never issues physical deletes on `board`, `list`, `card` (STANDARDS §1.3).

`FUNNEL_EVENT_TYPES` (initial): `user.signed_up`, `workspace.created`, `board.created`, `card.created`, `invite.sent`, `invite.accepted`, `activation.reached`. FB-18 may extend it.

Seed: as in §3. Seed data lives in `flowboard-api/src/db/seed/prototype.ts` and mirrors the PT `state` object field for field so QA can compare screens with the prototype.

### 8. Authorisation

No routes. The role enums are defined here and the authorisation module that reads them is FB-02.

### 9. Dependencies

- Backlog: FB-00 (monorepo, Drizzle config, Docker Postgres).
- Decisions: CL-D3, CL-D5, CL-D6, CL-D7, CL-A2, CL-A6, CL-E9, CL-E13, CL-E14, CL-E19.
- New packages: `uuidv7` (or Node 22 `crypto` if it provides v7), `fast-check` (property tests), `argon2` (seed needs to hash the documented password; the auth code in FB-02 reuses it).

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit | `flowboard-shared/src/position.test.ts` (midpoint, end, re-balance, property: order preserved); `flowboard-shared/src/schemas/entities/*.test.ts` (round-trip of seed rows through schemas) | AC 3, 6 |
| Integration | `flowboard-api/test/migrations.test.ts` (up, down, up; table list; indexes from `pg_indexes`; CHECK constraints by inserting invalid rows); `flowboard-api/test/activity-insert-only.test.ts`; `flowboard-api/test/seed.test.ts` (counts, idempotency) | AC 1, 2, 4, 5, 7, 8, 9, 10, 11 |
| End to end | None (no UI) | |
| Accessibility | None | |
| Performance | None until FB-16; the partial indexes are the groundwork | |

### 11. Verification evidence

- CI run link on the pull request head.
- `pnpm test` and `pnpm test:integration` output.
- `pnpm db:migrate`, `pnpm db:migrate:down`, `pnpm db:migrate` transcript on a fresh Docker database.
- `pnpm db:seed` transcript plus a `psql` count query output for boards, lists, cards, labels, comments.
- Review task link and verdict.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

None requiring Anas. Engineering decisions CL-E14 and CL-E19 are confirmed by accepting this specification set.
