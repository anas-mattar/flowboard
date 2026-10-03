# ADR-001: Technology stack for FlowBoard v1.0

**Status:** Accepted
**Date:** 3 October 2026
**Decided by:** Anas (Product Owner), decision D9 on Paperclip issue TAS-7, recorded as CL-D9 in `../CLARIFICATIONS.md`
**Proposed by:** FlowBoard Lead

## Context

FlowBoard v1.0 is a Trello-style Kanban application defined by `docs/product/FUNCTIONAL_SPEC.md` (FS) and `docs/product/BUSINESS_MODEL.md` (BM). The requirements that shape the stack choice are:

- A public REST API over HTTPS with JSON bodies and bearer-token authentication at `/v1`, with cursor pagination (FS §7).
- A WebSocket channel per board that broadcasts **the same event objects** the activity feed stores (FS §7), so the event schema must be shared between storage, API and client.
- A relational data model with sparse-float ordering and an append-only activity table (FS §5, §5.1, §5.2).
- Hard non-functional targets: 1,000-card board hydrating in under 1.5 s on 10 Mbps, 60 fps drag, virtualisation beyond 150 cards, realtime under 500 ms p95, WCAG 2.2 AA with keyboard equivalents for every drag (FS §8).
- A team of three engineers over 10 to 12 weeks (FS §10) and an explicit key-person risk that calls for boring, well-documented choices and written decisions (BM §10).
- Local development must run without any cloud dependency because hosting and spend are decided only at launch readiness (CL-D8).
- The repository already contains empty `flowboard-api` and `flowboard-web` folders, which the working agreement asks us to keep.

## Decision

TypeScript end to end in a pnpm monorepo with three packages.

| Layer | Choice |
|---|---|
| Language and runtime | TypeScript in strict mode, Node.js 22 LTS |
| Backend (`flowboard-api`) | Fastify 5 with Zod schemas; OpenAPI generated from the same schemas |
| Database | PostgreSQL 16 with Drizzle ORM; SQL migrations committed to git |
| Authentication | argon2id password hashing, httpOnly cookie sessions for the web app, bearer tokens for API clients, per-token rate limiting |
| Realtime | WebSocket per board via `@fastify/websocket`; in-process fan-out first, Redis pub/sub only when more than one API instance runs |
| Frontend (`flowboard-web`) | React 19, Vite, TanStack Router and Query, dnd-kit with keyboard sensors, TanStack Virtual, CSS variables for the prototype's design tokens, Tailwind utility classes |
| Shared package (`flowboard-shared`) | Zod schemas, inferred API types, activity event name enum, position maths, constants |
| Testing | Vitest (unit), Fastify inject against a real Postgres in Docker (integration), Playwright with axe-core and performance traces (end to end) |
| Tooling | pnpm workspaces, ESLint, Prettier, EditorConfig, GitHub Actions CI, Docker Compose for Postgres |

## Alternatives considered

| Alternative | Why not |
|---|---|
| **NestJS** instead of Fastify | Heavier than the problem needs. Its module and decorator layers add learning cost for a three-person team without buying anything FS §7 requires. Fastify with Zod gives schema-first validation and OpenAPI generation with less ceremony. |
| **Next.js full-stack** instead of separate API and web packages | Couples the UI to the server. FS §7 requires a public REST API consumable by non-browser clients with bearer tokens, and the WebSocket channel needs a long-lived server process; a separate Fastify service serves both cleanly. A Next.js front end could still be adopted later for the web package alone. |
| **Prisma** instead of Drizzle | Prisma is a fine choice and would work. Drizzle was preferred because it keeps SQL visible, which matters for the position re-balance job (FS §5.1), for reviewing migrations, and for the insert-only guarantee on `activity_event`; it also has a lighter runtime. |
| **Two languages** (for example a Go or Python API with a TypeScript front end) | Breaks the single-schema requirement from FS §7 (identical broadcast and stored events) and doubles the contract maintenance for three engineers. |
| **Native HTML5 drag and drop** (as in the prototype) | Not keyboard-accessible; fails FS §8 and C-11. dnd-kit provides pointer and keyboard sensors and announcements. |
| **A hosted realtime service** (for example Pusher or Ably) | New spending and a vendor dependency before hosting is even decided (CL-D8). The in-process fan-out satisfies MVP; Redis is the first scale step and is also self-hostable. |
| **MongoDB or another document store** | The FS §5 model is relational with many join tables and an audit table; PostgreSQL supports it directly, offers point-in-time recovery through managed providers (FS §8 backups), and is the team's lowest-risk choice. |

## Consequences

**Positive**

- One language and one schema package remove a class of contract drift between API and client, and make the FS §7 event-parity requirement structural rather than a convention.
- Every choice is mainstream and well documented, which limits the BM §10 key-person risk.
- Local development is a single `docker compose up` plus `pnpm dev`, with no cloud account.
- Validation, OpenAPI and TypeScript types all derive from the Zod schemas, so the API documentation cannot go stale.

**Negative and mitigations**

- Three packages add workspace plumbing (FB-00 absorbs this once).
- In-process realtime fan-out limits the API to one instance; the publish interface is abstracted so Redis can be introduced without touching services.
- Drizzle's migration tooling is younger than Prisma's; every migration is reviewed and has a tested down path (STANDARDS §1.3).
- React 19 and Fastify 5 are recent majors; the repository pins exact versions and CI runs a dependency audit.

## Follow-up

- FB-00 creates the monorepo, tooling and CI described here.
- A new ADR is required for: introducing Redis, choosing an email provider, choosing a hosting provider, or replacing any row of the table above.
