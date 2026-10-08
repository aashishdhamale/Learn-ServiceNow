import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// The e2e run uses its own database, a mock ServiceNow instance and mock AI review,
// and a production build of the app on port 3100.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile); // never overrides variables already set

const devDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://snow:snow@localhost:5432/snow_mastery?schema=public';
export const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ?? devDatabaseUrl.replace(/\/[^/?]+(\?|$)/, '/snow_mastery_e2e$1');

const APP_PORT = 3100;
const MOCK_PORT = 4010;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use a preinstalled Chromium when provided (CI images, sandboxes).
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm mock:snow',
      url: `http://127.0.0.1:${MOCK_PORT}/__mock/mode?value=awake`,
      env: { MOCK_SNOW_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next build && pnpm exec next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/api/health`,
      env: {
        DATABASE_URL: e2eDatabaseUrl,
        APP_URL: `http://localhost:${APP_PORT}`,
        LOCAL_LEARNER_EMAIL: 'e2e@localhost',
        TOKEN_ENCRYPTION_KEY:
          process.env.TOKEN_ENCRYPTION_KEY ?? 'ZTJlLWtleS1lMmUta2V5LWUyZS1rZXktZTJlLWtleSE=',
        SNOW_INSTANCE_URL_TEMPLATE: `http://127.0.0.1:${MOCK_PORT}`,
        AI_REVIEW_MODE: 'mock',
        ATF_TIMEOUT_MS: '60000',
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
