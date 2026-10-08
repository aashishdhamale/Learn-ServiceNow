import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

// All env vars live in the repo-root .env (see .env.example).
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
