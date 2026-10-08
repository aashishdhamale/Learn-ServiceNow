# CLAUDE.md — ServiceNow Architect Mastery App

Guidance for Claude (and humans) working in this repo. Keep it current: update it in the
same commit as any change to architecture, conventions, or commands.

> **Status:** Phase 1 complete (all milestones below). Verified against unit tests, the
> mock PDI and the Playwright happy path; see "Not yet verified on a real PDI".

## What this is

A learning app that trains ServiceNow professionals toward multi-module architect
(CTA/CMA) judgment. Learners read a realistic scenario, build the solution in **their own
PDI** with ServiceNow's tools, then click **Check my work**. The app grades in four layers
and coaches. The app **never writes code into the PDI**.

## Repo layout

```
apps/web/              Next.js 16 (App Router) + Tailwind 4 + shadcn/ui: UI, server actions, route handlers, orchestration
  lib/server/          server-only modules (env, crypto, current user, PDI connection, grading, progress)
  e2e/                 Playwright happy path, global setup, mock ServiceNow HTTP server
packages/db/           Prisma 7 schema + migrations, PrismaClient factory, scenario → DB sync
packages/snow-client/  Typed ServiceNow client: OAuth (+PKCE), read-only Table API, CI/CD API, health check
  src/testing/         FakeInstance: in-memory PDI (OAuth, Table API, CI/CD) used by every test layer
packages/grader/       Grading engine: layers 1–3, review port + layer 4 runner, static-rule registry
packages/ai/           The only place the Anthropic SDK is used (server-side): architect reviewer
packages/scenarios/    Scenario zod schema, loader, fixtures loader, and content/
```

Shared config (tsconfig.base.json, eslint.config.mjs, vitest.config.ts, Prettier) lives at the root.

Dependency direction (no cycles): `web → db, grader, ai, snow-client, scenarios`;
`grader → scenarios, snow-client`; `ai → grader` (types: it implements the grader's
`ArchitectReviewer` port); `db → scenarios`. The grader has no DB or Anthropic dependency.

## Architecture decisions

1. **Scenarios are content, not code.** `packages/scenarios/content/<module>/<id>/` holds
   `scenario.yaml`, `fixtures/{correct,flawed}/records.yaml` (+ script files), and `atf/`
   (setup guide + scripts to paste). Validated by zod at load and by tests. Each scenario
   has an integer `version`; `syncScenario` upserts `Scenario`/`ScenarioVersion` (content
   hash + full snapshot) and refuses to change a version that already has attempts. Grading
   uses the snapshot the attempt was created with.
2. **Structure checks match, they don't hard-code.** `{ id, table, match, scriptContains,
expect[], capture: { alias, scriptField, kind } }`. `match` = equality conditions,
   `scriptContains` = LIKE on the script (filters out out-of-box scripts on the same field),
   `expect` = field values with `error`/`warning` severity. Prefers the active, most recently
   updated match; warns on duplicates; explains near misses. No sys_ids in scenario files.
3. **Static rules use a real parser** (Acorn + acorn-walk, ESTree). Rules live in
   `packages/grader/src/static/rules/`; each has id, title, severity (`error` fails layer 2,
   `warning` coaches), `defaultFor` script kinds, optional `appliesTo`, and educational
   text (what, why, how to fix, docs link). Defaults: `no-getxmlwait`,
   `no-gliderecord-client`, `no-sync-getreference`, `onchange-isloading-guard`,
   `no-hardcoded-sys-id`, `no-gliderecord-in-loop`, `ajax-include-extends-abstractajaxprocessor`.
   Parametric (scenario-configured): `require-call`, `require-new`, `forbid-call`,
   `ajax-contract` (GlideAjax name/method/reserved params vs the Script Include).
4. **Grading is async and persisted per layer.** "Check my work" creates an `Attempt` with
   four `PENDING` layers; `after()` runs `runAttempt` in-process; `gradeAttempt` hooks save
   each `LayerResult` + `Finding` rows as it completes; the page polls
   `/api/attempts/[id]`. Orphaned attempts expire after `ATF_TIMEOUT_MS` + 5 min. A job
   queue (e.g. pg-boss) can replace `after()` without schema changes.
5. **Layer statuses.** PASSED/FAILED are verdicts; BLOCKED = couldn't run for a reason the
   learner can fix (counts as not passed); SKIPPED = nothing to check (counts as passed);
   ERROR = couldn't talk to the PDI/service; COMPLETED = layer 4 ran (no verdict). Pass =
   layers 1–3 ∈ {PASSED, SKIPPED}. An attempt whose deterministic layer errored is ERROR,
   not FAILED. Layer 3 only runs when layer 1 passed.
6. **Layer 3 = ATF via CI/CD API**: pre-check `sn_atf.runner.enabled`, `POST
/api/sn_cicd/testsuite/run?test_suite_name=`, poll `/api/sn_cicd/progress/{id}` (status
   "0".."4") with growing intervals and a deadline, then `/api/sn_cicd/testsuite/results/{id}`
   and per-test rows from `sys_atf_test_result` (best effort). Shapes follow ServiceNow's own
   `sncicd-tests-run` GitHub Action. Clock is injected.
7. **Layer 4 = Claude via `packages/ai`**: `client.beta.messages.parse` with
   `betaZodOutputFormat(ArchitectFeedbackSchema)`, `output_config.effort` (default
   `medium`), model `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), and the server-side
   refusal fallback (`betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'`).
   Checks `stop_reason` (refusal, max_tokens) before reading output. Learner scripts are
   untrusted data in the prompt; layer 4 can't change pass/fail. `AI_REVIEW_MODE=mock`
   gives deterministic feedback (e2e, UI work); `off` skips it.
8. **OAuth per learner**: each learner registers an OAuth app in their own PDI. Auth code +
   PKCE; state/verifier in an encrypted, 10-minute, httpOnly, SameSite=Lax cookie scoped to
   `/api/pdi/oauth`. Client secret and tokens are AES-256-GCM ciphertext
   (`v1:<iv>:<tag>:<data>`, key `TOKEN_ENCRYPTION_KEY`). Access tokens refresh ≤60 s before
   expiry behind a per-connection, per-process lock; a 401 triggers one refresh; an
   unrecoverable refresh marks the connection `AUTH_EXPIRED`.
9. **Read-only by construction.** `TableApi` has only `list()` (a test asserts it). The only
   non-GET calls are the OAuth token endpoint and the CI/CD suite run.
10. **One place builds instance URLs** (`instanceBaseUrl`); instance names are validated as
    DNS labels so learner input can't send bearer tokens elsewhere. `SNOW_INSTANCE_URL_TEMPLATE`
    redirects traffic for tests/e2e only (the server logs a warning when set).
11. **Health check** (`checkConnection`) → `OK | DEGRADED | MISSING_ACCESS | AUTH_EXPIRED |
HIBERNATING | INSTANCE_NOT_FOUND | UNREACHABLE | ERROR`, each with a headline and an
    action. Hibernation = redirect to developer.servicenow.com or an HTML page on an API
    path. Stored on the connection and refreshed after grading if stale.
12. **Learner identity**: single local learner (`LOCAL_LEARNER_EMAIL`, no login) behind
    `getCurrentUser()` (React `cache`d per request) so real auth can replace one function.
13. **Scenario contracts are prescribed** (Script Include name, method, scope, JSON shape)
    because a realistic spec does that and ATF needs a known name. Other artifacts are
    discovered.
14. **ATF content is a guide + script, not XML.** The VIP graded suite is one server-side
    "Run Server Side Script" step that creates its own users and calls the processor with a
    fake request (`getParameter`), so it needs no client test runner. UI testing is
    documented as optional/ungraded because a reliable OOB field-message step could not be
    confirmed.

## Data model (packages/db)

| Model                                     | Purpose                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `User`                                    | Learner                                                                                          |
| `PdiConnection`                           | instance, client ID, encrypted secret/tokens, expiry, status, last health JSON, detected release |
| `Scenario`                                | id (slug), kind (`SCRIPT_LAB`; simulator/review board later), module, title, difficulty, release |
| `ScenarioVersion`                         | version, content hash, full definition snapshot (JSON)                                           |
| `LearningObjective` + `ScenarioObjective` | stable objective ids: future knowledge-graph nodes, flashcard and cert-tracker anchors           |
| `Attempt`                                 | user × scenario version, status, error message, timestamps, hints used, instance snapshot        |
| `LayerResult`                             | attempt × layer, status, summary, details JSON (ATF results, AI feedback), timings               |
| `Finding`                                 | one row per check/rule outcome (check id, severity, passed, text, target, line/col, snippet)     |
| `ScenarioProgress`                        | user × scenario rollup (status, attempts, hints revealed, first passed)                          |

Out-of-scope features attach to these: release notes → `releaseFamily` + objectives +
`PdiConnection.detectedRelease`; knowledge graph → edges between `LearningObjective`s;
flashcards/spaced repetition → objectives + `Finding` history by `checkId`; cert tracker →
objectives; simulator/review board → `Scenario.kind`.

## Conventions

- TypeScript strict, ESM, Node 22. Workspace packages export TS source (`exports` →
  `src/index.ts`); Next compiles them via `transpilePackages`; scripts run with `tsx`.
- Small, well-named functions; comments only where intent isn't obvious.
- Never hard-code secrets; all config via env vars in `.env.example` (validated in
  `apps/web/lib/server/env.ts`). Per-learner OAuth credentials are user data (encrypted).
- All ServiceNow calls go through `packages/snow-client` (typed errors, timeouts, retries:
  network errors/429/502/503/504; POSTs only on 429). All LLM calls go through
  `packages/ai`. Server-only web modules import `'server-only'`.
- Layers 1–3 are deterministic and unit-tested against `FakeInstance` and the scenario
  fixtures. No test hits a real PDI or the Anthropic API.
- Learner-facing text: say what happened, why it matters, and what to do next.
- Link to ServiceNow docs (`https://www.servicenow.com/docs/r/api-reference/...` URLs are
  release-agnostic); never copy documentation into the repo.
- Commit after each working milestone; bump a scenario's `version` when grading changes.

## Commands

```
pnpm install          # root postinstall runs `prisma generate` (works before .env exists)
pnpm dev              # .env (generates TOKEN_ENCRYPTION_KEY) → Postgres (docker compose) → migrate → scenario sync → Next :3000
pnpm test             # Vitest, all packages (114 tests)
pnpm test:e2e         # Playwright: next build + start on :3100, mock PDI :4010, mock AI, DB snow_mastery_e2e
pnpm lint | pnpm typecheck | pnpm format | pnpm format:check
pnpm db:migrate       # prisma migrate dev + generate (Prisma 7 no longer auto-generates)
pnpm scenarios:validate | pnpm scenarios:sync
pnpm --filter @snow-mastery/web mock:snow   # mock PDI (client mock-client / mock-secret; MOCK_SNOW_FIXTURE=flawed)
```

## Gotchas learned building Phase 1

- **Next.js 16**: docs ship in `apps/web/node_modules/next/dist/docs/` (read them; see
  `apps/web/AGENTS.md`). `cookies()`/`params`/`searchParams` are async. Pages that read the
  DB must be dynamic: `getCurrentUser()` calls `await connection()`. Background work uses
  `after()`. Don't `redirect()` from a server action to the OAuth start route: the client
  router fetches it and the callback runs twice; return `redirectTo` and navigate with
  `window.location`.
- **Prisma 7**: datasource URL lives in `prisma.config.ts` (falls back to `.env.example`);
  generator `prisma-client` outputs to `packages/db/src/generated/prisma` (git-ignored);
  `@prisma/adapter-pg` is required; `migrate dev` doesn't regenerate; clear JSON with
  `Prisma.DbNull`.
- **pnpm**: don't add the `dotenv` package to apps/web: its `dotenv` binary shadows
  `dotenv-cli` used by the web scripts. Use `process.loadEnvFile` instead.
- **Progress rows reference `Scenario`**: call `ensureScenarioVersion` before writing
  per-scenario progress (a fresh DB has no scenario rows until synced).
- **Sandbox only**: no Docker daemon (run `pg_ctlcluster 16 main start`; role/db `snow`);
  shadcn registry and servicenow.com are blocked (UI components were written by hand);
  use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`. Never `pkill -f` a
  pattern that appears in your own command line.

## Not yet verified on a real PDI

- The hibernation page/redirect shape (heuristics in `snow-client/src/hibernation.ts`).
- CI/CD error shape for an unknown suite name; `sys_atf_test_result.parent` field name.
- `javascript:gs.getUserID()` in Table API queries and `glide.buildname` in `sys_properties`.
- The ATF server-side step (`stepResult`, `return false`, rollback of inserted users).
- OAuth registration menu names on the newest releases (Machine Identity Console).
- Docker path of `pnpm dev` (verified here with `SKIP_DOCKER=1` and local Postgres).

## Phase 1 milestones

- [x] M0 Scaffold: workspace, tooling, docker-compose, `.env.example`, Prisma schema + first migration
- [x] M1 `scenarios`: schema, loader, VIP caller alert content, correct/flawed fixtures, ATF setup
- [x] M2 `snow-client`: HTTP core, errors, retries, OAuth, Table API, CI/CD API, health classifier
- [x] M3 `grader` layers 1–2 (flawed fixture fails layer 2 with educational messages)
- [x] M4 `grader` layer 3 (ATF run/poll/results)
- [x] M5 `ai` + layer 4 (architect review)
- [x] M6 web: settings page, OAuth connect, token refresh, connection health
- [x] M7 web: Script Lab catalog, scenario page with hints, Check my work, per-layer results
- [x] M8 web: progress dashboard by module
- [x] M9 Playwright e2e, README PDI setup guide, Definition-of-Done pass
