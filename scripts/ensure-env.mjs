// Creates .env from .env.example on first run and fills in generated secrets.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from './env-file.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = `${root}.env`;
const examplePath = `${root}.env.example`;

export function ensureEnv() {
  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    console.log('• Created .env from .env.example');
  }
  const env = parseEnvFile(envPath);
  if (!env.TOKEN_ENCRYPTION_KEY) {
    const key = randomBytes(32).toString('base64');
    const updated = readFileSync(envPath, 'utf8').replace(
      /^TOKEN_ENCRYPTION_KEY=.*$/m,
      `TOKEN_ENCRYPTION_KEY=${key}`,
    );
    writeFileSync(envPath, updated);
    console.log('• Generated TOKEN_ENCRYPTION_KEY in .env');
  }
  const final = parseEnvFile(envPath);
  if (
    final.AI_REVIEW_MODE !== 'mock' &&
    final.AI_REVIEW_MODE !== 'off' &&
    !final.ANTHROPIC_API_KEY
  ) {
    console.log(
      '• ANTHROPIC_API_KEY is empty: layer 4 (architect review) will be skipped until you set it.',
    );
  }
  return final;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) ensureEnv();
