# FlowBoard

A Trello-style Kanban application. The product definition lives in
[`docs/product/`](docs/product/) (read-only for engineering); engineering standards,
architecture and per-item specifications live in [`docs/engineering/`](docs/engineering/).

This repository is a pnpm monorepo (CL-D9):

| Package            | What it is                                                          |
| ------------------ | ------------------------------------------------------------------- |
| `flowboard-api`    | Fastify 5 service, Drizzle schema and migrations, integration tests |
| `flowboard-web`    | React + Vite app and Playwright tests (added in the FB-00 web task) |
| `flowboard-shared` | Zod schemas, shared types, event names and constants                |

---

## Prerequisites

- **Node.js 22 LTS** — `.nvmrc` pins the major; `nvm use` picks it up.
- **pnpm 9** — `corepack enable && corepack prepare pnpm@9.15.9 --activate`.
- **Docker** with Compose v2 — for the local PostgreSQL 16 instance.

## From a fresh clone to a running API

```bash
git clone https://github.com/anas-mattar/flowboard.git
cd flowboard

cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
pnpm install
docker compose up -d          # PostgreSQL 16 on :5432, databases flowboard + flowboard_test
pnpm db:migrate               # no migrations yet; FB-01 adds the first ones
pnpm dev                      # API on :3000, web on :5173 once flowboard-web exists
```

Check the API:

```bash
curl http://localhost:3000/v1/health
# {"status":"ok","version":"0.1.0"}

curl http://localhost:3000/v1/openapi.json
```

### Ports and databases

| Thing               | Where                                                    |
| ------------------- | -------------------------------------------------------- |
| API                 | `http://localhost:3000`, routes under `/v1` (FS §7)      |
| OpenAPI document    | `http://localhost:3000/v1/openapi.json`                  |
| Web app             | `http://localhost:5173`                                  |
| PostgreSQL          | `localhost:5432`, user `flowboard`, database `flowboard` |
| Integration test DB | `localhost:5432`, database `flowboard_test` (CL-E21)     |

The local database password is `flowboard`. It is a documented throwaway for an
ephemeral local container and is **not** a secret (STANDARDS §1.5, CL-E21). Real
credentials never enter this repository; `.env` is git-ignored and `.env.example`
documents every variable.

To start over, `docker compose down -v` removes the volume and the init script
recreates both databases on the next `docker compose up -d`.

## Running the checks

| Command                 | What it runs                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `pnpm lint`             | ESLint (zero warnings) and a Prettier formatting check                   |
| `pnpm typecheck`        | `tsc` across every package with the strict shared base config            |
| `pnpm test`             | Vitest unit tests (pure logic, no database)                              |
| `pnpm test:integration` | Vitest integration tests against `flowboard_test` (needs Docker running) |
| `pnpm test:e2e`         | Playwright end-to-end tests (added with `flowboard-web`)                 |
| `pnpm build`            | Builds every package                                                     |

CI runs all of the above plus `pnpm audit --audit-level high` and gitleaks secret
scanning on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

### Verification

Every FB-00 acceptance criterion that has a backend surface today is proven by a named
job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) rather than by a local run
that nobody else can see. The criteria that depend on `flowboard-web` are listed as
pending — they have no CI job until that package lands:

| What is proven                                                                           | Job                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Lint, formatting, strict typecheck, unit tests, build                                    | `lint`, `typecheck`, `unit`, `build` |
| Conventional Commits on the pull request range                                           | `commitlint`                         |
| Integration tests against a real PostgreSQL 16                                           | `integration`                        |
| **AC 5** — `docker compose up -d` creates both `flowboard` and `flowboard_test` (CL-E21) | **`compose-smoke`**                  |
| No high-severity advisories, no committed secrets                                        | `audit`, `secret-scan`               |
| **AC 6 (Playwright smoke part)** and **AC 7** — axe-core has zero violations on `/`      | _pending `flowboard-web`_            |

`compose-smoke` runs the committed `docker-compose.yml` on a GitHub-hosted runner with
the `.env.example` values, queries `pg_database` for both database names, runs
`pnpm test:integration` against the compose-started `flowboard_test`, and tears the
stack down with `docker compose down -v`. Unlike `integration`, which uses a GitHub
service container, it exercises `docker/postgres/init/` end to end — so the init script
that creates `flowboard_test` cannot silently rot.

## Environment variables

Every variable is documented in [`.env.example`](.env.example). The API refuses to
start when a required variable is missing and names it:

```
Invalid environment configuration: DATABASE_URL is required. See .env.example for every variable.
```

## Contributing

- One task, one branch (`<type>/<backlog-id>-<slug>`), one git worktree under
  `.worktrees/`. Branch from `main`; never commit to `main` directly.
- Conventional Commits, enforced by a `commit-msg` hook locally and by a commitlint
  job in CI.
- Every pull request is reviewed by someone who did not write it, and Anas gives
  merge approval.

The full rules, including the nine-item definition of done, are in
[`docs/engineering/STANDARDS.md`](docs/engineering/STANDARDS.md).
