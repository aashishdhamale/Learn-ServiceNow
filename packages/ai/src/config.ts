export type AiMode = 'live' | 'mock' | 'off';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiConfig {
  mode: AiMode;
  apiKey?: string;
  model: string;
  effort: Effort;
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Reads AI_REVIEW_MODE, ANTHROPIC_API_KEY, ANTHROPIC_MODEL and ANTHROPIC_EFFORT. */
export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig {
  const mode =
    env.AI_REVIEW_MODE === 'mock' || env.AI_REVIEW_MODE === 'off' ? env.AI_REVIEW_MODE : 'live';
  const effort = EFFORTS.includes(env.ANTHROPIC_EFFORT as Effort)
    ? (env.ANTHROPIC_EFFORT as Effort)
    : 'medium';
  return {
    mode,
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    effort,
  };
}
