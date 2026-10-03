**Backlog item:** FB-00 Repository foundation (tooling)
**Status:** Ready for approval
**Approved by:** pending, Paperclip issue TAS-10
**Owner(s):** FlowBoard Backend (root tooling, `flowboard-shared`, `flowboard-api`, CI, Docker Compose, README), FlowBoard Frontend (`flowboard-web` skeleton, Playwright and axe harness configuration, and the single FB-00 smoke test)
**Reviewer:** FlowBoard QA (independent review of each pull request)
**End-to-end ownership rule (applies to FB-00 to FB-04):** FlowBoard Frontend sets up the Playwright and axe harness and writes only the FB-00 smoke test, because the harness is part of the `flowboard-web` skeleton. From FB-02 onward FlowBoard QA writes every Playwright and axe suite under `flowboard-web/e2e/` (FB-02, FB-03, FB-04 and the MVP-1 slice test) in its own tasks, sequenced so that QA and Frontend never write `flowboard-web` at the same time.
**Increment:** MVP-1

---

### 1. Goal

After FB-00 a fresh clone can be taken to a running API and web app with one documented command sequence, and every pull request is checked by CI for lint, types, unit and integration tests. Nothing user-facing ships; FB-00 exists so that FB-01 to FB-04 can be built on a consistent, tested monorepo instead of each task inventing its own tooling. The governance documents that TAS-7 also listed under FB-00 (`STANDARDS.md`, `ARCHITECTURE.md`, ADR-001) were written in TAS-8 and are already on `main`; this specification covers the tooling part only.

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | §10 | v1.0 is delivered by a team of three engineers in 10 to 12 weeks; shared tooling is the precondition for three people working in parallel | [ENG] |
| FS | §7 | REST over HTTPS with JSON bodies at `/v1`; the API skeleton exposes the `/v1` prefix and OpenAPI from day one | [REQ] |
| STANDARDS | §1.5 | No secrets in the repository; `.env.example` and secret scanning. FS §8 lists TLS, hashing, SSO, audit log and rate limiting but says nothing about secrets in git; this rule is an engineering standard | [ENG] |
| FS | §8 accessibility | axe-core runs on every end-to-end run from FB-03 onward; the harness is set up here | [REQ] |
| BM | §10 | Key-person risk: boring, documented tooling and a README that gets anyone running | [REQ] |
| CL | CL-D9 | Approved stack: TypeScript, Fastify, PostgreSQL with Drizzle, React with Vite, pnpm monorepo with `flowboard-api`, `flowboard-web`, `flowboard-shared` | [REQ] |
| CL | CL-D8 | No cloud dependency; Docker Compose Postgres only | [REQ] |
| CL | CL-E21 | Local database names, ports and the separate test database | [ENG] |
| ADR | ADR-001 | Exact versions pinned; dependency audit in CI | [ENG] |
| STANDARDS | §1.1, §1.7, §1.8, §3, §4, §5 | Strict TypeScript, Conventional Commits, one worktree per task, continuous checks, test layout, README under 15 minutes | [REQ] |
| TAS-7 | §4 FB-00 | Acceptance: fresh clone to running API and web app in under 15 minutes; CI runs lint, typecheck, unit and integration tests on every pull request; `.claude/` ignored (done in TAS-8) | [REQ] |

### 3. Scope

**In scope**

- Root workspace: `package.json` (with `packageManager` pinned to a pnpm 9 release and `engines.node` 22), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint flat config with `typescript-eslint`, Prettier, `.editorconfig`, `.nvmrc`.
- `flowboard-shared`: package skeleton exporting one placeholder schema (`HealthResponse`) and the `API_VERSION = "v1"` constant, built with `tsc`, unit-tested with Vitest.
- `flowboard-api`: Fastify 5 with the Zod type provider, `@fastify/swagger` generating OpenAPI at `/v1/openapi.json`, pino logging with request IDs, typed environment loading that fails fast with the missing variable name, `GET /v1/health` returning `{ status: "ok", version }`, a Drizzle configuration pointing at `DATABASE_URL`, an empty migrations folder, a Vitest unit project and a Vitest integration project that connects to `DATABASE_URL_TEST` and runs one smoke test (`select 1`).
- `flowboard-web`: Vite + React 19 + TypeScript skeleton with TanStack Router, one route `/` rendering a placeholder, the design-token CSS variables copied from PT (light and dark), a message catalogue module with the first string, Vitest for components, Playwright configured against the Vite dev server with `@axe-core/playwright`, and one smoke test `FB-00 app shell renders` that asserts the placeholder and an axe-clean page.
- `docker-compose.yml`: PostgreSQL 16 with an init script creating `flowboard` and `flowboard_test` databases (CL-E21). `.env.example` at the root listing every variable.
- `.github/workflows/ci.yml`: on pull request and push to `main`: install with frozen lockfile, lint, typecheck, unit tests (all packages), integration tests against a Postgres service container, build all packages, Playwright smoke (`flowboard-web` against the built API with a seeded database once FB-01 exists; until then, the FB-00 smoke test), `pnpm audit --audit-level high`, secret scanning (gitleaks action).
- `README.md`: prerequisites (Node 22, pnpm, Docker), the exact commands (`pnpm install`, `docker compose up -d`, `pnpm db:migrate`, `pnpm dev`), what runs on which port, how to run each test level, and the branch and review rules in two lines pointing at `STANDARDS.md`.
- Root scripts: `pnpm dev` (API and web in parallel), `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm db:migrate`, `pnpm db:seed` (wired in FB-01).

**Out of scope**

- Any database table or migration (FB-01).
- Any authenticated route or UI (FB-02 to FB-04).
- Deployment, hosting, TLS, monitoring (FB-20).
- Performance budget job (FB-16).

### 4. Acceptance criteria

1. **[ENG, TAS-7 FB-00]** On a machine with Node 22, pnpm and Docker, the README sequence from `git clone` to an API answering `GET /v1/health` and a web app serving `/` completes in under 15 minutes. QA measures and records the wall-clock time.
2. **[ENG, STANDARDS §1.1]** `pnpm typecheck` passes with the strict base config in all three packages, and `pnpm lint` passes with zero warnings.
3. **[ENG, under the FS §7 `/v1` prefix]** `GET /v1/health` returns `200 { "status": "ok", "version": "<package version>" }` validated by the `HealthResponse` schema from `flowboard-shared`, and `GET /v1/openapi.json` returns an OpenAPI 3 document listing that route.
4. **[ENG, STANDARDS §1.5]** The API refuses to start when `DATABASE_URL` is unset and the error message names the variable. No file in the repository matches the secret-scanning rules; `.env.example` exists and `.env` is ignored.
5. **[ENG, CL-E21]** `docker compose up -d` creates both databases; the integration smoke test connects to `flowboard_test` and passes; the development database is untouched by test runs.
6. **[ENG, TAS-7 FB-00]** CI on a pull request runs lint, typecheck, unit, integration, build, Playwright smoke, dependency audit and secret scanning as separate named jobs or steps, and a deliberately failing unit test on a scratch branch turns the run red (evidence: one red and one green run linked on the task).
7. **[REQ, FS §8 accessibility]** The Playwright smoke test asserts zero axe-core violations on `/`.
8. **[REQ, CL-O2, STANDARDS §1.6]** The PT design tokens exist as CSS custom properties for both `[data-theme="light"]` and `[data-theme="dark"]`, and the placeholder page uses only logical CSS properties and catalogue strings.
9. **[ENG, STANDARDS §1.7]** A commit message that does not follow Conventional Commits is rejected locally by a commit-msg hook (husky or equivalent) and in CI by a commitlint step.

### 5. User interface

None beyond a placeholder page. The placeholder shows the product name from the message catalogue and nothing else; it is replaced by FB-03.

### 6. API contract

```
GET /v1/health
Auth: none
Request: none
Response 200: HealthResponse schema (flowboard-shared/src/schemas/health.ts): { status: "ok", version: string }
Errors: none
Activity events written: None
WebSocket events published: None
```

```
GET /v1/openapi.json
Auth: none
Response 200: OpenAPI 3 document generated from the registered Zod schemas
```

Error envelope used by every later route, defined here so FB-02 onward share it: `{ "error": { "code": string, "message": string, "details"?: unknown } }` (`ApiError` schema in `flowboard-shared`). Validation failures are `422` with `details` carrying the Zod issues.

### 7. Data changes

No schema change. Drizzle config, an empty `flowboard-api/drizzle/` migrations folder and the `db:migrate` script are created so FB-01 only adds files.

### 8. Authorisation

None. No authenticated route exists yet. The authorisation module skeleton is created in FB-02.

### 9. Dependencies

- Backlog: none. First item.
- Decisions: CL-D9 (stack), CL-D8 (local only), CL-E21 (database names), CL-O2 (PT tokens, confirmed by acceptance of this specification set).
- New packages (exact versions pinned): `fastify`, `fastify-type-provider-zod`, `@fastify/swagger`, `@fastify/cors`, `zod`, `drizzle-orm`, `drizzle-kit`, `postgres` (driver), `pino`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `@tanstack/react-router`, `@tanstack/react-query`, `vitest`, `@testing-library/react`, `@playwright/test`, `@axe-core/playwright`, `typescript`, `eslint`, `typescript-eslint`, `prettier`, `husky`, `@commitlint/cli`, `@commitlint/config-conventional`. Tailwind is added in FB-03 when the first real screen is built; FB-00 ships plain CSS variables.

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit | `flowboard-shared/src/schemas/health.test.ts` (schema accepts and rejects); `flowboard-api/src/config/env.test.ts` (missing variable named in error) | AC 3, 4 |
| Integration | `flowboard-api/test/health.test.ts` (inject `GET /v1/health`); `flowboard-api/test/db.smoke.test.ts` (`select 1` against `flowboard_test`) | AC 3, 5 |
| End to end | `flowboard-web/e2e/FB-00-foundation.spec.ts`: `FB-00 app shell renders and is axe-clean` | AC 7, 8 |
| Accessibility | axe in the smoke test | AC 7 |
| Performance | None until FB-16 | |
| Manual by QA | Fresh-clone timing on a clean checkout; CI red/green demonstration | AC 1, 6 |

### 11. Verification evidence

Required before review:

- CI run links: one green run on the pull request head, one red run from a scratch commit with a failing test (then reverted).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e` output pasted on the Paperclip task.
- QA's fresh-clone timing with the command transcript.
- Screenshot of `/v1/openapi.json` rendered and of the placeholder page in light and dark themes.
- Review task link and verdict.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

None requiring Anas. CL-O2 (PT tokens as the approved visual design) is confirmed by accepting this specification set; it is restated in FB-03 §12 where it matters.
