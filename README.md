# FlowBoard

A Trello-style Kanban application. The product definition lives in
[`docs/product/`](docs/product/) (read-only for engineering); engineering standards,
architecture and per-item specifications live in [`docs/engineering/`](docs/engineering/).

This repository is a pnpm monorepo (CL-D9):

| Package            | What it is                                                           |
| ------------------ | -------------------------------------------------------------------- |
| `flowboard-api`    | Fastify 5 service, Drizzle schema and migrations, integration tests  |
| `flowboard-web`    | React 19 + Vite + TanStack Router app, Playwright and axe-core tests |
| `flowboard-shared` | Zod schemas, shared types, event names and constants                 |

---

## Prerequisites

- **Node.js 22 LTS** — `.nvmrc` pins the major; `nvm use` picks it up.
- **pnpm 9** — `corepack enable && corepack prepare pnpm@9.15.9 --activate`.
- **Docker** with Compose v2 — for the local PostgreSQL 16 instance.

## From a fresh clone to a running API

```bash
git clone https://github.com/anas-mattar/flowboard.git
cd flowboard

cp .env.example .env
set -a; . ./.env; set +a      # export it into the shell: nothing else does, see the note
pnpm install
pnpm build                    # required before anything below: see the note
docker compose up -d          # PostgreSQL 16 on :5432, databases flowboard + flowboard_test
pnpm db:migrate               # applies the FB-01 schema (17 tables: workspaces, boards, lists, cards, activity, sessions)
pnpm db:seed                  # optional: the three prototype boards, and a demo login it prints
pnpm dev                      # API on :3000, web app on :5173, run in parallel
```

On Windows PowerShell the first two lines are instead:

```powershell
Copy-Item .env.example .env
Get-Content .env | Where-Object { $_ -match '^\s*[^#\s]' } | ForEach-Object { $n, $v = $_ -split '=', 2; Set-Item "Env:$n" $v }
```

Exporting `.env` is not optional either. Nothing in this repository loads it for
you: there is no `dotenv` dependency, no `--env-file` flag on any `tsx`/`node`
invocation and no `postinstall` hook. `docker compose up -d` is the one command
that reads `.env`, and Compose interpolates it for `docker-compose.yml` only — it
never reaches the shell. Without the export, `pnpm db:migrate` stops at
`DATABASE_URL is required to run migrations. See .env.example.`, and `db:seed`
and `dev` fail the same way. This is why
[`flowboard-web/e2e/README.md`](flowboard-web/e2e/README.md) sets each variable
by hand rather than relying on `.env`. Re-export in every new terminal, or set
the variables in your shell profile.

`pnpm build` is not optional in a fresh clone, and it comes **before**
`pnpm db:migrate`. `@flowboard/shared` publishes itself through package `exports`
→ `dist/index.js`, and nothing builds it on `pnpm install`. Until it exists, every
command that loads the API or the web app — `db:migrate`, `db:seed` and `dev`
alike — dies with `ERR_MODULE_NOT_FOUND … @flowboard/shared/dist/index.js`. This
is the same reason `pnpm lint` builds the package first (see below).

`pnpm db:seed` prints the workspace id, the row counts and the address and
password to sign in with. That password is a documented non-secret throwaway for
a local database, on the same footing as the local Postgres password below
(STANDARDS §1.5) — read it from the command's own output rather than copying it
anywhere.

Check the API and the web app:

```bash
curl http://localhost:3000/v1/health
# {"status":"ok","version":"0.1.0"}

curl http://localhost:3000/v1/openapi.json
```

Then open <http://localhost:5173> in a browser. Signed out, every route redirects
to the sign-in page (FB-02); sign up and you land in the app shell (FB-03) on your
first board, or on the empty-workspace state with the create-board form focused
when the workspace has no boards yet (FB-04).

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

| Command                 | What it runs                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| `pnpm lint`             | Builds `@flowboard/shared`, then ESLint (zero warnings), Prettier and Stylelint |
| `pnpm typecheck`        | `tsc` across every package with the strict shared base config                   |
| `pnpm test`             | Vitest unit tests (pure logic, no database)                                     |
| `pnpm test:integration` | Vitest integration tests against `flowboard_test` (needs Docker running)        |
| `pnpm test:e2e`         | Playwright end-to-end tests (needs a running API — see below)                   |
| `pnpm build`            | Builds every package                                                            |

`pnpm lint` builds `@flowboard/shared` first on purpose. The ESLint config is
type-aware (`recommendedTypeChecked` with `projectService`), and `@flowboard/shared`
publishes its types through `exports` → `dist/index.d.ts`. In a fresh checkout `dist/`
does not exist yet, so every import of the package resolves to the TypeScript `error`
type and the `no-unsafe-*` rules fire. Building it first makes `pnpm lint` self-sufficient in a
clean clone, and any future package that imports `@flowboard/shared` inherits the fix
without its own step.

CI runs all of the above plus `pnpm audit --audit-level high` and gitleaks secret
scanning on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

### Running the Playwright suites

`pnpm test:e2e` needs more setup than the other checks, because
`playwright.config.ts`'s `webServer` starts only the Vite dev server — you run
`flowboard-api` yourself, against the isolated `flowboard_test` database rather
than your dev one. The full instructions live in
[`flowboard-web/e2e/README.md`](flowboard-web/e2e/README.md) and are not repeated
here. It covers:

- pointing `DATABASE_URL` at `flowboard_test`, then migrating, seeding, building
  and starting the API;
- `RATE_LIMIT_DISABLED=true`, without which the suite's own signup fixtures trip
  the per-IP auth rate limiter (CL-E11) and fail as `429 rate_limited`;
- the per-agent `WEB_PORT` / `API_PORT` pair (defaults `5173` / `3000`) that lets
  several people run the suite on one box, and the `WEB_ORIGIN` that must move
  with `WEB_PORT` or every mutation 403s;
- the `chromium-x01` / `firefox-x01` / `webkit-x01` projects, which run X-01's
  200 ms toast-latency assertion (FS X-01, FB-04 AC10) serialized and with
  `retries: 0`, so a marginal miss fails instead of being retried green.

### Verification

MVP-1 (FB-00 to FB-04) is proven by named jobs in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) rather than by a local run that
nobody else can see. The job names below are the checks that appear on a pull request:

| What is proven                                                                                                                        | Job                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Lint, formatting, strict typecheck, unit tests, build                                                                                 | `Lint`, `Typecheck`, `Unit tests`, `Build` |
| Conventional Commits on the pull request range                                                                                        | `Commit messages`                          |
| No scratch branch or flagged title can be merged into `main` (STANDARDS §1.12)                                                        | `Merge guard`                              |
| The FB-01 schema and the API against a real PostgreSQL 16                                                                             | `Integration tests`                        |
| `docker compose up -d` creates both `flowboard` and `flowboard_test` (CL-E21)                                                         | `Docker Compose smoke`                     |
| **FB-00 to FB-04 end to end** — every `e2e/` suite on three browser engines, against the built API and a migrated and seeded database | **`Playwright smoke`**                     |
| No high-severity advisories, no committed secrets                                                                                     | `Dependency audit`, `Secret scanning`      |

`Docker Compose smoke` runs the committed `docker-compose.yml` on a GitHub-hosted runner
with the `.env.example` values, queries `pg_database` for both database names, runs
`pnpm test:integration` against the compose-started `flowboard_test`, and tears the
stack down with `docker compose down -v`. Unlike `Integration tests`, which uses a GitHub
service container, it exercises `docker/postgres/init/` end to end — so the init script
that creates `flowboard_test` cannot silently rot.

`Playwright smoke` is the end-to-end gate for the whole of MVP-1, not just FB-00. It
runs `pnpm build`, `pnpm db:migrate` and `pnpm db:seed`, starts the built API, waits for
`GET /v1/health` to return `ok` — so a suite can never quietly run against a dead proxy —
and only then runs `pnpm test:e2e` across Chromium, Firefox and WebKit (FB-03 spec
acceptance criterion 11). That covers every suite in
[`flowboard-web/e2e/`](flowboard-web/e2e/): FB-00 foundation and axe-core on `/` in light
and dark, FB-02 accounts, FB-03 shell, FB-04 boards, and the `MVP-1-first-board`
sign-up-to-first-board slice. The Playwright report is uploaded as an artifact on every
run, and the API log on failure.

## Environment variables

Every variable is documented in [`.env.example`](.env.example). Copying it to
`.env` is not enough on its own — export it into your shell as the quick-start
above shows, because nothing in the repository reads `.env` for Node processes.
The API refuses to start when a required variable is missing and names it:

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
