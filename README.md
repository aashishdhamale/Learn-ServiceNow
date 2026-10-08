# ServiceNow Architect Mastery

A learning app that trains ServiceNow professionals toward multi-module architect (CTA/CMA)
judgment. You read a realistic scenario, build the solution in **your own Personal Developer
Instance (PDI)** with ServiceNow's own tools, then click **Check my work**. The app grades your
work in four layers and coaches you like a review board would.

The app never writes code into your PDI. It only reads your configuration and starts the
scenario's ATF suite.

| Layer               | What it checks                                                                     | Decides pass/fail? |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| 1. Structure        | The right records exist, are active and are configured correctly (Table API)       | Yes                |
| 2. Static analysis  | Your scripts, parsed with a real JavaScript parser, follow platform best practices | Yes                |
| 3. Functional       | The scenario's ATF suite passes in your PDI (CI/CD API)                            | Yes                |
| 4. Architect review | Claude reviews your scripts against a CTA-style rubric                             | No, coaching only  |

Phase 1 ships one scenario end to end: **VIP caller alert** (ITSM).

---

## Quick start

**You need:** Node.js 22+, pnpm 10 (`corepack enable`), and Docker (or your own PostgreSQL 16).

```bash
git clone https://github.com/aashishdhamale/Learn-ServiceNow.git
cd Learn-ServiceNow
pnpm install
pnpm dev
```

`pnpm dev` does everything a fresh clone needs:

1. creates `.env` from `.env.example` and generates `TOKEN_ENCRYPTION_KEY`,
2. starts PostgreSQL with `docker compose`,
3. applies database migrations and loads the scenarios into the database,
4. serves the app at <http://localhost:3000>.

To get layer 4 coaching, put your Anthropic API key in `.env` (`ANTHROPIC_API_KEY=...`) and
restart `pnpm dev`. Without a key, layers 1–3 still work and layer 4 shows as skipped.

**No Docker?** Point `DATABASE_URL` in `.env` at any PostgreSQL 16 database and set
`SKIP_DOCKER=1`.

Then set up your PDI (next section) and open **Settings** in the app.

---

## Set up your PDI, step by step

ServiceNow moves menus between releases. If a label below doesn't match your instance, search
the linked docs for the named feature.

### 1. Get a PDI and keep it awake

1. Sign in at <https://developer.servicenow.com> and request a Personal Developer Instance.
2. PDIs **hibernate** after a period of inactivity. Wake yours from the developer portal
   before you use the app. If the app says _"Your PDI is asleep"_, that is what to do.
3. PDIs that stay unused for a long time are reclaimed. If the app says _"Instance not
   found"_, check the instance name, then request a new PDI if needed.

### 2. Register an OAuth app (authorization code grant)

The app signs in with OAuth 2.0 using the authorization code flow with PKCE. You register the
OAuth app in **your own** PDI, so the client ID and secret are yours. The app stores them
encrypted.

1. Sign in to your PDI as `admin`.
2. Open **All > System OAuth > Application Registry**, click **New**, and choose
   **Create an OAuth API endpoint for external clients**.
   On newer releases, inbound integrations may live in the **Machine Identity Console**. If so,
   create a new inbound integration with the **OAuth – Authorization code** grant type.
3. Fill in:
   - **Name:** `Architect Mastery (local)`
   - **Redirect URL:** `http://localhost:3000/api/pdi/oauth/callback`. The app's
     **Settings** page shows the exact value with a copy button. It must match exactly, port
     included. If you change `APP_URL`, use `APP_URL/api/pdi/oauth/callback`.
   - Leave the client secret empty; ServiceNow generates one when you save.
   - The default token lifespans are fine (access token 30 minutes; refresh token much longer).
     The app refreshes access tokens on its own.
4. Save, reopen the record, and copy the **Client ID** and **Client Secret**.
5. In the app, open **Settings**, enter your instance name (e.g. `dev12345`), the client ID and
   the client secret, then click **Save and connect**. Approve the request in your PDI. You
   come back to Settings with a connection health report.

Background reading: ServiceNow's developer blog,
[Inbound OAuth Auth Code Grant Flow](https://developer.servicenow.com/blog.do?p=/post/inbound-oauth-auth-code-grant-flow-part-1/).

### 3. Least privilege (recommended)

- The access token acts as the user who approves the OAuth request. The Script Lab only
  **reads** (Table API `GET`) and **starts ATF suites** (CI/CD API). It has no code path that
  writes records.
- Reading script tables (`sys_script_include`, `sys_script_client`) needs `admin` on a default
  PDI. Running suites through the CI/CD API needs `admin` or `sn_cicd.sys_ci_automation`.
  On a personal PDI, connecting as `admin` is the simplest working setup.
- To narrow what the token can call, create a **REST API auth scope** limited to the Table API
  and the CI/CD API, attach it to your OAuth app, and enter the scope name in the
  **OAuth scope** field on the Settings page. If you add REST API access policies, check the
  OAuth app's _token restriction_ setting so the policies apply. Menu names vary by release;
  search ServiceNow's docs for "REST API auth scope".

### 4. Enable ATF test execution

1. In your PDI, open **Automated Test Framework > Administration > Properties**.
2. Set **Enable test/test suite execution** to **Yes** and save.
   (This is the `sn_atf.runner.enabled` system property. The health check reads it and
   warns you if it is off.)
3. Create each scenario's ATF suite. The **ATF setup for layer 3** section on the scenario
   page has the steps and the script to paste. For VIP caller alert, the same guide is in
   [`packages/scenarios/content/itsm/vip-caller-alert/atf/README.md`](packages/scenarios/content/itsm/vip-caller-alert/atf/README.md).
   The suite name must match exactly.

### 5. Client test runner (only for suites with UI steps)

ATF **UI** steps run in a browser tab called the client test runner:

1. In your PDI, open **Automated Test Framework > Run > Client Test Runner** in a separate
   browser tab, signed in as the same user the app connects as.
2. Leave that tab open while **Check my work** runs.

The scenario page warns you when a scenario's suite needs this. VIP caller alert's graded
suite is **server-side only**, so it doesn't need a runner.

### 6. Reading the connection health check

| Status                              | Meaning                                  | What to do                                                     |
| ----------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Connected                           | Ready for the Script Lab                 | Nothing                                                        |
| PDI asleep                          | The instance is hibernating              | Wake it at developer.servicenow.com, then **Run health check** |
| Instance not found                  | Nothing answers at that name             | Check the name; request a new PDI if yours was reclaimed       |
| Reconnect needed                    | Tokens expired or were revoked           | Click **Reconnect** on Settings                                |
| Connection problem / missing access | Your user can't read script tables       | Connect as `admin`                                             |
| Connected, ATF blocked              | Layers 1–2 work; layer 3 will be blocked | Fix the failing check (CI/CD role or ATF property)             |

---

## Using the Script Lab

1. **Script Lab** lists scenarios by module. Open one and read the requirement, acceptance
   criteria and contract. Hints are optional and revealed one at a time.
2. Build the solution in your PDI.
3. Click **Check my work**. Results appear layer by layer as they finish:
   - **Pass** means layers 1–3 all pass (or have nothing to check).
   - **Blocked** means a layer couldn't run for a reason you can fix (e.g. the ATF suite isn't
     imported). The scenario stays incomplete until it runs.
   - **Architect review** is coaching: what works, what a CTA review board would challenge,
     and one concrete improvement. It never changes pass/fail.
4. The **Dashboard** shows completed scenarios by module and your recent checks.

Layer 4 sends the scenario, your captured scripts and the layer 1–3 results to the Anthropic
API (default model `claude-sonnet-5-5`). Set `AI_REVIEW_MODE=off` in `.env` to disable it.

---

## Development

| Command                                        | What it does                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                                     | Env file, Postgres, migrations, scenario sync, Next.js dev server |
| `pnpm test`                                    | All unit tests (Vitest), no PDI or API key needed                 |
| `pnpm test:e2e`                                | Playwright happy path: production build + mock PDI + mock AI      |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | ESLint / TypeScript / Prettier                                    |
| `pnpm db:migrate`                              | Create and apply a migration (dev), regenerate the Prisma client  |
| `pnpm scenarios:validate`                      | Validate every scenario file                                      |
| `pnpm scenarios:sync`                          | Load scenario files into the database                             |
| `pnpm --filter @snow-mastery/web mock:snow`    | Run the mock PDI on port 4010                                     |

**End-to-end tests** need PostgreSQL (they create and use a separate `snow_mastery_e2e`
database) and a Playwright Chromium. Install it once with
`pnpm --filter @snow-mastery/web exec playwright install chromium`, or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium.

**Working without a PDI:** run the mock PDI, set `SNOW_INSTANCE_URL_TEMPLATE=http://127.0.0.1:4010`
and `AI_REVIEW_MODE=mock` in `.env`, then connect with client ID `mock-client` and secret
`mock-secret`. The mock serves the scenario's correct solution and a passing ATF suite.
Start it with `MOCK_SNOW_FIXTURE=flawed` to see a failing check.

Architecture, conventions and decisions are in [CLAUDE.md](CLAUDE.md).

### Repository layout

```
apps/web/              Next.js app (App Router, Tailwind, shadcn/ui) and Playwright e2e
packages/db/           Prisma schema, migrations, scenario sync
packages/snow-client/  Typed ServiceNow client: OAuth, Table API, CI/CD API, health, FakeInstance
packages/grader/       Grading engine: structure, static rules, ATF, review port
packages/ai/           Architect review with the Anthropic SDK (server-side only)
packages/scenarios/    Scenario schema, loader and content (YAML, fixtures, ATF guides)
```

### Adding a scenario

1. Create `packages/scenarios/content/<module>/<id>/scenario.yaml` (copy the VIP scenario as a
   starting point; the schema is `packages/scenarios/src/schema.ts`).
2. Add `fixtures/correct` and `fixtures/flawed` records and scripts, plus an ATF guide if the
   scenario has a suite.
3. Run `pnpm scenarios:validate` and `pnpm test`. The grader tests check that every rule the
   scenario references exists.
4. Bump `version` whenever you change grading-relevant content of a published scenario.

---

## Troubleshooting

- **The OAuth approval page says the redirect URL is invalid.** The redirect URL in your PDI
  must exactly match the one on the Settings page.
- **"Your PDI rejected the sign-in" with `invalid_client`.** Re-copy the client ID and secret.
  The secret is only revealed on the OAuth app record.
- **Layer 3 is Blocked: "ATF suite not found in your PDI".** Create the suite with the exact
  name from the scenario's ATF setup guide.
- **Layer 3 is Blocked: "did not finish in time".** For suites with UI steps, open a client
  test runner. Otherwise check _Automated Test Framework > Suite Results_ in your PDI.
  `ATF_TIMEOUT_MS` controls how long the app waits.
- **Layer 4 is skipped.** Set `ANTHROPIC_API_KEY` and keep `AI_REVIEW_MODE=live`.
