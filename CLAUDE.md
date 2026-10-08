# CLAUDE.md — ServiceNow Architect Mastery App

Guidance for Claude (and humans) working in this repo. Keep it current: update it in the
same commit as any change to architecture, conventions, or commands.

> **Status:** Phase 1 plan proposed, awaiting approval. Nothing below is implemented yet.
> Sections marked _(pending)_ depend on open questions at the bottom.

## What this is

A learning app that trains ServiceNow professionals toward multi-module architect
(CTA/CMA) judgment. Learners read a realistic scenario, build the solution in **their own
PDI** with ServiceNow's tools, then click **Check my work**. The app grades in four layers
and coaches. The app **never writes code into the PDI**.

## Repo layout

```
apps/web/                 Next.js (App Router) + Tailwind + shadcn/ui — UI, route handlers, orchestration
packages/db/              Prisma schema, migrations, seed, scenario→DB sync; exports a PrismaClient
packages/snow-client/     Typed ServiceNow client: OAuth, Table API (read-only), CI/CD API, health check
packages/grader/          Pure grading engine: layers 1–4, static-rule registry; no DB, no Anthropic SDK
packages/ai/              Only place the Anthropic SDK is used (server-side). Architect review.
packages/scenarios/       Scenario schema (zod), loader, and content (YAML + fixture scripts + ATF)
tooling/                  Shared tsconfig / eslint config
e2e/ (in apps/web)        Playwright happy path against a mock ServiceNow server
```

Dependency direction (no cycles): `web → db, grader, ai, snow-client, scenarios`;
`grader → scenarios` (types) and `snow-client` (types/interfaces only); `ai → scenarios` (types).
`grader` receives a reviewer function by injection so layers 1–3 stay deterministic.

## Architecture decisions

1. **Scenarios are content, not code.** `packages/scenarios/content/<module>/<id>/` holds
   `scenario.yaml`, `fixtures/{correct,flawed}/*.js`, and `atf/` (setup instructions + XML).
   YAML is validated by a zod schema at load time and by a unit test over all scenarios.
   Each scenario has an integer `version`; on `pnpm dev` the files are synced to
   `Scenario`/`ScenarioVersion` rows (with a content hash) so attempts always point at the
   exact version they were graded against.
2. **Structure checks match, they don't hard-code.** A check is
   `{ id, table, match (field conditions), expect (field values), captureAs }`. Matching
   records are captured under an alias (e.g. `ajaxInclude`, `onChangeScript`) that static
   rules and the AI review consume. No sys_ids in scenario files.
3. **Static rules use a real parser.** Acorn + acorn-walk (ESTree AST), `ecmaVersion: "latest"`,
   lenient options for ServiceNow script shapes. Each rule has `id`, `severity`
   (`error` fails the layer, `warning` coaches), `appliesTo` (`client` | `server`), and an
   educational message: what was found, why it matters, how to fix, link to docs.
   Default rule packs apply by script kind; scenarios add must/must-not rules.
   Starter rules: `no-getxmlwait`, `no-gliderecord-client`, `no-gliderecord-in-loop`,
   `no-hardcoded-sys-id`, `ajax-include-extends-abstractajaxprocessor`.
4. **Grading is async and persisted per layer.** "Check my work" creates an `Attempt`, an
   in-process runner executes layers 1→2→3→4 and writes each `LayerResult` as it finishes;
   the UI polls. Layers 1–3 decide pass/fail; layer 4 only coaches. (Can move to a job
   queue such as pg-boss later without schema changes.)
5. **Layer 3 = ATF via CI/CD API** (`POST /api/sn_cicd/testsuite/run`, poll
   `/api/sn_cicd/progress/{id}`, fetch results). Clock/sleep are injected so polling is
   unit-testable. Pre-flight warns about the client test runner and ATF execution property.
6. **Layer 4 = Claude via `packages/ai`.** `client.messages.parse` + `zodOutputFormat` for
   structured feedback `{ whatWorks[], boardChallenges[], improvement }`. Model from
   `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). Check `stop_reason` (incl. `refusal`)
   before reading content. Server-side refusal fallback (`fallbacks: "default"`) enabled.
   Learner scripts are untrusted input to the prompt; since layer 4 can't change pass/fail,
   prompt injection can only affect coaching text.
7. **OAuth per learner.** Each learner registers an OAuth app in their own PDI and enters
   instance name + client ID + secret on the settings page. Auth code flow with `state` +
   PKCE (held in a short-lived httpOnly cookie). Client secret and tokens are encrypted at
   rest with AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY`, versioned ciphertext
   (`v1:<iv>:<tag>:<data>`) for key rotation. Refresh on demand (≤60 s to expiry) behind a
   per-connection lock; a 401 triggers one refresh, then `AUTH_EXPIRED`.
8. **Read-only by construction.** `snow-client` exposes only GET for the Table API. The only
   non-GET calls are the OAuth token endpoint and the CI/CD test-suite run.
9. **One place builds instance URLs.** `https://<instance>.service-now.com`, instance name
   validated against `^[a-z0-9-]+$` (prevents SSRF via user input). Tests/e2e may set
   `SNOW_INSTANCE_URL_TEMPLATE` to point at the mock server.
10. **Health check is a pure classifier** over probe results → `OK | HIBERNATING |
    UNREACHABLE | NOT_FOUND | AUTH_EXPIRED | MISSING_ACCESS | ATF_DISABLED`, each with an
    actionable message. Hibernation = redirect to developer.servicenow.com or HTML instead
    of JSON on an `/api/` path.
11. **Learner identity** _(pending Q1)_: proposed single local learner behind a
    `getCurrentUser()` seam so real auth drops in later.

## Data model (packages/db)

| Model | Purpose |
|---|---|
| `User` | Learner |
| `PdiConnection` | instance, client ID, encrypted secret/tokens, expiry, status, last health result, detected release |
| `Scenario` | id (slug), kind (`SCRIPT_LAB` now; simulator/review-board later), module, title, difficulty, release family |
| `ScenarioVersion` | version, content hash, full definition snapshot (JSON) |
| `LearningObjective` + `ScenarioObjective` | stable objective ids — future knowledge-graph nodes, flashcard and cert-tracker anchors |
| `Attempt` | user × scenario version, status, timestamps, hints used, instance snapshot |
| `LayerResult` | attempt × layer (STRUCTURE, STATIC, FUNCTIONAL, REVIEW), status, summary, details JSON, timings |
| `Finding` | one row per check/rule outcome (rule id, severity, message, record ref, line/col) — enables "weak spots" analytics later |
| `ScenarioProgress` | user × scenario rollup for the dashboard (status, attempts, first passed, hints revealed) |

Out-of-scope features attach to these: release notes → `releaseFamily` + objectives;
knowledge graph → edges between `LearningObjective`s; flashcards/spaced repetition →
objectives + `Finding` history; cert tracker → objectives; simulator → `Scenario.kind`.

## Conventions

- TypeScript strict, ESM, Node 22. Small, well-named functions; comments only where intent
  isn't obvious.
- Never hard-code secrets; all config via env vars listed in `.env.example`. Per-learner
  OAuth credentials are user data (encrypted in DB), not env vars.
- All ServiceNow calls go through `packages/snow-client`: typed (zod-parsed) responses,
  timeouts, retries with exponential backoff + jitter (network errors, 429 with
  `Retry-After`, 502/503/504 only), typed errors (`SnowHibernatingError`,
  `SnowAuthError`, `SnowForbiddenError`, `SnowTimeoutError`, …).
- All LLM calls go through `packages/ai`, server-side only. Never import it from client
  components.
- Layers 1–3 are deterministic and unit-tested with mocked ServiceNow responses (injected
  `fetch`). No test hits a real PDI or the Anthropic API.
- Link to ServiceNow docs; never copy documentation into the repo.
- Commit after each working milestone with a descriptive message.

## Commands _(planned)_

```
pnpm install
pnpm dev              # creates .env if missing, starts Postgres (docker compose), migrates, syncs scenarios, runs Next on :3000
pnpm test             # Vitest across all packages
pnpm test:e2e         # Playwright happy path (mock ServiceNow + mock AI)
pnpm lint | pnpm typecheck | pnpm format
pnpm db:migrate       # prisma migrate dev
pnpm scenarios:validate
```

## Phase 1 milestones

- [ ] M0 Scaffold: workspace, tooling, docker-compose, `.env.example`, Prisma schema + first migration
- [ ] M1 `scenarios`: schema, loader, VIP caller alert content, correct/flawed fixtures, ATF setup
- [ ] M2 `snow-client`: HTTP core, errors, retries, OAuth, Table API, CI/CD API, health classifier
- [ ] M3 `grader` layers 1–2 (flawed fixture fails layer 2 with educational messages)
- [ ] M4 `grader` layer 3 (ATF run/poll/results)
- [ ] M5 `ai` + layer 4 (architect review)
- [ ] M6 web: settings page, OAuth connect, token refresh, connection health
- [ ] M7 web: Script Lab catalog, scenario page with hints, Check my work, per-layer results
- [ ] M8 web: progress dashboard by module
- [ ] M9 Playwright e2e, README PDI setup guide, Definition-of-Done pass

## Open questions

1. Learner identity / hosting for Phase 1.
2. Prescribed artifact names in scenarios vs discovery.
3. Completion rule when ATF can't run.
4. When layer 4 runs (cost).
