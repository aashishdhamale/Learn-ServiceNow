import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { e2eDatabaseUrl } from '../playwright.config';

/** Creates (if needed), migrates and empties the e2e database before every run. */
export default async function globalSetup() {
  const url = new URL(e2eDatabaseUrl);
  const database = url.pathname.slice(1);
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString(),
  });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [database]);
  if (exists.rowCount === 0) await admin.query(`create database "${database.replace(/"/g, '')}"`);
  await admin.end();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../../packages/db', import.meta.url)),
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32', // pnpm is a .cmd shim on Windows
  });

  const client = new pg.Client({ connectionString: e2eDatabaseUrl });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'",
  );
  if (rows.length)
    await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} cascade`);
  await client.end();
}
