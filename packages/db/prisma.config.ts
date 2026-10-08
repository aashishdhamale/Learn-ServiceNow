import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

// All env vars live in the repo-root .env (see .env.example). On a fresh clone .env does not
// exist yet during `pnpm install`, so fall back to the example's defaults (which match
// docker-compose.yml); dotenv never overrides values that are already set.
const root = (file: string) => fileURLToPath(new URL(`../../${file}`, import.meta.url));
config({ path: root('.env'), quiet: true });
config({ path: root('.env.example'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
