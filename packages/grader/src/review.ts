import type { Scenario } from '@snow-mastery/scenarios';
import { LayerRecorder } from './layer-result';
import type { CapturedScript, Clock, LayerResult } from './types';

/**
 * Port for layer 4. packages/ai implements it with Claude; tests use stubs. The review only
 * coaches: its outcome never changes whether the attempt passed.
 */
export interface ReviewRequest {
  scenario: {
    id: string;
    title: string;
    requirement: string;
    acceptanceCriteria: string[];
    rubric: Array<{ id: string; criterion: string }>;
  };
  scripts: Array<{ alias: string; name: string; table: string; kind: string; script: string }>;
  /** Outcomes of layers 1–3, so the coaching can build on them instead of repeating them. */
  deterministic: Array<{
    layer: string;
    status: string;
    summary: string;
    problems: Array<{ title: string; message: string; severity: string }>;
  }>;
}

export interface ArchitectFeedback {
  summary: string;
  whatWorks: string[];
  boardChallenges: Array<{ rubricId?: string; concern: string; whyItMatters: string }>;
  improvement: { title: string; detail: string; example?: string };
}

export type ReviewOutcome =
  | {
      status: 'ok';
      feedback: ArchitectFeedback;
      model: string;
      usage?: { inputTokens: number; outputTokens: number };
    }
  | { status: 'unavailable' | 'refused' | 'error'; reason: string };

export type ArchitectReviewer = (request: ReviewRequest) => Promise<ReviewOutcome>;

export type ReviewDetails = Extract<ReviewOutcome, { status: 'ok' }> | { reason: string };

export function buildReviewRequest(
  scenario: Scenario,
  captured: Map<string, CapturedScript>,
  deterministic: LayerResult[],
): ReviewRequest {
  return {
    scenario: {
      id: scenario.id,
      title: scenario.title,
      requirement: scenario.requirement,
      acceptanceCriteria: scenario.acceptanceCriteria,
      rubric: scenario.architectRubric,
    },
    scripts: [...captured.values()].map((s) => ({
      alias: s.alias,
      name: s.name,
      table: s.table,
      kind: s.kind,
      script: s.script,
    })),
    deterministic: deterministic.map((layer) => ({
      layer: layer.layer,
      status: layer.status,
      summary: layer.summary,
      problems: layer.findings
        .filter((f) => !f.passed && f.severity !== 'info')
        .map((f) => ({ title: f.title, message: f.message, severity: f.severity })),
    })),
  };
}

/** Layer 4: ask the reviewer for architect-level coaching. */
export async function runReviewLayer(
  request: ReviewRequest,
  reviewer: ArchitectReviewer | undefined,
  clock: Pick<Clock, 'now'>,
): Promise<LayerResult<ReviewDetails>> {
  const recorder = new LayerRecorder('REVIEW', clock);
  if (!reviewer) return recorder.finish('SKIPPED', 'Architect review is turned off.');
  if (request.scripts.length === 0) {
    return recorder.finish('SKIPPED', 'No scripts to review yet; layer 1 did not find them.');
  }

  let outcome: ReviewOutcome;
  try {
    outcome = await reviewer(request);
  } catch (error) {
    outcome = { status: 'error', reason: error instanceof Error ? error.message : String(error) };
  }

  switch (outcome.status) {
    case 'ok':
      return recorder.finish('COMPLETED', outcome.feedback.summary, outcome);
    case 'unavailable':
      return recorder.finish('SKIPPED', outcome.reason, { reason: outcome.reason });
    case 'refused':
      return recorder.finish('SKIPPED', `The reviewer declined this request: ${outcome.reason}`, {
        reason: outcome.reason,
      });
    default:
      return recorder.finish('ERROR', `The architect review failed: ${outcome.reason}`, {
        reason: outcome.reason,
      });
  }
}
