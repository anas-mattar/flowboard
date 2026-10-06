# Running the Playwright suite locally

`playwright.config.ts`'s `webServer` only starts the Vite dev server
(`flowboard-web`). The API is not part of that `webServer` block, so you must
build and run `flowboard-api` yourself, pointed at the isolated
`flowboard_test` database from `docker-compose.yml` (never the shared dev
database):

```powershell
$env:DATABASE_URL = "postgres://flowboard:flowboard@localhost:5432/flowboard_test"
pnpm --filter ./flowboard-api run db:migrate
pnpm --filter ./flowboard-api run db:seed
pnpm --filter ./flowboard-api run build

$env:PORT = "3000"
$env:CORS_ORIGIN = "http://localhost:5173"
$env:SESSION_COOKIE_SECURE = "false"
$env:LOG_LEVEL = "info"
$env:RATE_LIMIT_DISABLED = "true"
node flowboard-api/dist/src/server.js

# in flowboard-web
pnpm exec playwright test
```

## `WEB_PORT` / `API_PORT`: picking ports on a shared runner (TAS-108)

Several agents can run this suite at the same time on this box.
`playwright.config.ts` always sets `reuseExistingServer: false` and starts
Vite with `--strictPort`, so a run **fails loudly** if its port is already
taken rather than silently attaching to whatever dev server (possibly
someone else's branch) already holds it.

To run alongside another agent, give your run its own pair of ports instead
of colliding on the documented defaults (`WEB_PORT=5173`, `API_PORT=3000`,
unchanged from before this task so CI needs no changes):

```powershell
$env:WEB_PORT = "5273"   # Vite / Playwright baseURL
$env:API_PORT = "3200"   # flowboard-api, matched below

$env:PORT = $env:API_PORT
$env:CORS_ORIGIN = "http://localhost:$($env:WEB_PORT)"
$env:SESSION_COOKIE_SECURE = "false"
$env:LOG_LEVEL = "info"
$env:RATE_LIMIT_DISABLED = "true"
node flowboard-api/dist/src/server.js

# in flowboard-web: WEB_PORT/API_PORT above are picked up automatically;
# playwright.config.ts points Vite's `/v1` proxy at API_PORT for you.
pnpm exec playwright test
```

Pick a port pair nobody else on the box is using (e.g. by convention,
`WEB_PORT`/`API_PORT` derived from your task id) before starting either
process.

## The `*-x01` projects: no retry can hide a latency miss (TAS-108)

`e2e/FB-04-boards.spec.ts`'s `'X-01 toasts appear within 200 ms'` test
asserts a hard spec budget (FS X-01, FB-04 AC10), not a flaky network call.
CI's suite-wide `retries: 2` exists for ordinary flakiness, but letting it
also apply to X-01 meant a marginal miss (228ms on firefox, TAS-106; 229ms,
TAS-23) could pass on retry and go green without anyone noticing the budget
was blown.

`playwright.config.ts` splits the X-01 test out of the three normal
`chromium` / `firefox` / `webkit` projects (via `grepInvert`) into three
matching `chromium-x01` / `firefox-x01` / `webkit-x01` projects (via `grep`)
with `retries: 0` always, CI or not. A marginal X-01 miss now fails that
project outright instead of being retried away. No spec file changes were
needed or made; the split is config-only, keyed off the test title.

## `RATE_LIMIT_DISABLED`

Each test in this suite signs up a fresh user through the real
`/v1/auth/signup` endpoint (STANDARDS §4), so a full run across Chromium,
Firefox and WebKit performs many signups per minute against the same
in-memory, per-IP auth rate limiter (CL-E11,
`flowboard-api/src/auth/rate-limit.ts`). Without
`RATE_LIMIT_DISABLED=true` the limiter throttles the suite's own fixtures
with `429 rate_limited`, not a real defect: the FB-03 shell suite measured 22
failures without the flag and 45 passes with it (TAS-83 verification run).

`RATE_LIMIT_DISABLED` is a first-class flag in
`flowboard-api/src/config/env.ts`, set to `true` by `.github/workflows/ci.yml`
for the same reason. **CI and production never set it** — `.env.example`
defaults it to `false` and it exists purely as a no-op mode for tests and
local tooling. Do not set it when testing rate-limit behaviour itself;
`flowboard-api/test/auth.ratelimit.test.ts` covers that separately with the
flag off.
