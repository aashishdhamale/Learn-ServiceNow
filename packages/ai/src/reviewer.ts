import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type {
  ArchitectFeedback,
  ArchitectReviewer,
  ReviewOutcome,
  ReviewRequest,
} from '@snow-mastery/grader';
import type { AiConfig } from './config';
import { ArchitectFeedbackSchema, type ArchitectFeedbackOutput } from './feedback-schema';
import { mockReviewer } from './mock';
import { buildUserMessage, SYSTEM_PROMPT } from './prompt';

/** The one SDK call this package makes; injectable so tests never hit the API. */
export type ParseMessage = Anthropic['beta']['messages']['parse'];

const MAX_TOKENS = 16_000;
// Server-side refusal fallback: if a safety classifier wrongly declines to review a script,
// the API retries on a fallback model instead of returning nothing.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Builds the layer 4 reviewer for the configured mode. Server-side only. */
export function createArchitectReviewer(
  config: AiConfig,
  deps: { parse?: ParseMessage } = {},
): ArchitectReviewer {
  if (config.mode === 'off') {
    return async () => ({
      status: 'unavailable',
      reason: 'Architect review is turned off (AI_REVIEW_MODE=off).',
    });
  }
  if (config.mode === 'mock') return mockReviewer;
  if (!config.apiKey && !deps.parse) {
    return async () => ({
      status: 'unavailable',
      reason: 'Set ANTHROPIC_API_KEY in .env to get architect coaching on every check.',
    });
  }

  const parse: ParseMessage =
    deps.parse ??
    (() => {
      const client = new Anthropic({ apiKey: config.apiKey, timeout: 180_000, maxRetries: 2 });
      return client.beta.messages.parse.bind(client.beta.messages) as ParseMessage;
    })();

  return async (request: ReviewRequest): Promise<ReviewOutcome> => {
    try {
      const response = await parse({
        model: config.model,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(request) }],
        output_config: {
          format: betaZodOutputFormat(ArchitectFeedbackSchema),
          effort: config.effort,
        },
      });

      if (response.stop_reason === 'refusal') {
        const category = response.stop_details?.category;
        return {
          status: 'refused',
          reason: category ? `safety classifier (${category})` : 'safety classifier',
        };
      }
      if (response.stop_reason === 'max_tokens') {
        return { status: 'error', reason: 'The review was cut off before it finished.' };
      }
      if (!response.parsed_output) {
        return { status: 'error', reason: 'The review came back in an unexpected format.' };
      }
      return {
        status: 'ok',
        feedback: toFeedback(response.parsed_output),
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      return failure(error);
    }
  };
}

function toFeedback(output: ArchitectFeedbackOutput): ArchitectFeedback {
  return {
    summary: output.summary,
    whatWorks: output.whatWorks,
    boardChallenges: output.boardChallenges.map((c) => ({
      rubricId: c.rubricId || undefined,
      concern: c.concern,
      whyItMatters: c.whyItMatters,
    })),
    improvement: {
      title: output.improvement.title,
      detail: output.improvement.detail,
      example: output.improvement.example || undefined,
    },
  };
}

function failure(error: unknown): ReviewOutcome {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return {
      status: 'unavailable',
      reason: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.',
    };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return {
      status: 'error',
      reason: 'The configured model was not found. Check ANTHROPIC_MODEL in .env.',
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 'error',
      reason: 'The Anthropic API is rate limiting requests. Try again in a minute.',
    };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 'error', reason: 'Could not reach the Anthropic API.' };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      status: 'error',
      reason: `Anthropic API error ${error.status ?? ''}: ${error.message}`.trim(),
    };
  }
  return { status: 'error', reason: error instanceof Error ? error.message : String(error) };
}
