// `pnpm dev`: env file → Postgres → migrations → scenario sync → Next.js dev server.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureEnv } from './ensure-env.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
// On Windows pnpm is a .cmd shim, which Node can only start through a shell.
const shell = process.platform === 'win32';

function run(command, args, label) {
  console.log(`• ${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell });
  if (result.status !== 0) {
    console.error(`✖ ${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

function dockerAvailable() {
  return spawnSync('docker', ['compose', 'version'], { stdio: 'ignore', shell }).status === 0;
}

const env = ensureEnv();

if ((process.env.SKIP_DOCKER ?? env.SKIP_DOCKER) === '1') {
  console.log('• SKIP_DOCKER=1: using DATABASE_URL as-is');
} else if (dockerAvailable()) {
  run(
    'docker',
    ['compose', 'up', '-d', '--wait', 'postgres'],
    'Starting Postgres (docker compose)',
  );
} else {
  console.log('• Docker not found: using DATABASE_URL as-is (set SKIP_DOCKER=1 to silence this)');
}

run('pnpm', ['--filter', '@snow-mastery/db', 'migrate:deploy'], 'Applying database migrations');
run(
  'pnpm',
  ['--filter', '@snow-mastery/db', 'scenarios:sync'],
  'Syncing scenarios into the database',
);

const web = spawn('pnpm', ['--filter', '@snow-mastery/web', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => web.kill(signal));
web.on('exit', (code) => process.exit(code ?? 0));
