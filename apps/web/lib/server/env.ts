import 'server-only';
import { z } from 'zod';

const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default('http://localhost:3000'),
  LOCAL_LEARNER_EMAIL: z.string().trim().min(1).default('learner@localhost'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'must be 32 random bytes, base64-encoded',
    ),
  SNOW_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  SNOW_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  ATF_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  SNOW_INSTANCE_URL_TEMPLATE: z.preprocess(blankToUndefined, z.string().optional()),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

let cached: ServerEnv | undefined;

/** Validated server configuration. Throws a readable error listing what is missing or wrong. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server configuration (see .env.example):\n${problems}`);
  }
  if (result.data.SNOW_INSTANCE_URL_TEMPLATE) {
    console.warn(
      `[config] SNOW_INSTANCE_URL_TEMPLATE is set: ServiceNow traffic goes to ${result.data.SNOW_INSTANCE_URL_TEMPLATE}. Use this for tests only.`,
    );
  }
  cached = result.data;
  return cached;
}

export function oauthRedirectUri(): string {
  return `${serverEnv().APP_URL.replace(/\/+$/, '')}/api/pdi/oauth/callback`;
}
