import type { Finding, LayerName, LayerStatus } from '@snow-mastery/grader';

/** What the attempt page renders and polls; safe to send to the browser. */
export type AttemptStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';
export type LayerViewStatus = LayerStatus | 'PENDING' | 'RUNNING';

export interface LayerView {
  layer: LayerName;
  status: LayerViewStatus;
  summary: string | null;
  details: unknown;
  findings: Finding[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AttemptView {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioVersion: number;
  instanceName: string;
  status: AttemptStatus;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  layers: LayerView[];
}

export const LAYER_LABELS: Record<LayerName, { title: string; description: string }> = {
  STRUCTURE: {
    title: 'Structure',
    description: 'Your records exist and are configured correctly.',
  },
  STATIC: { title: 'Static analysis', description: 'Your scripts follow platform best practices.' },
  FUNCTIONAL: { title: 'Functional (ATF)', description: 'Your ATF suite passes in your PDI.' },
  REVIEW: {
    title: 'Architect review',
    description: 'Coaching from a CTA perspective. Never affects pass/fail.',
  },
};

export function isFinished(status: AttemptStatus): boolean {
  return status === 'PASSED' || status === 'FAILED' || status === 'ERROR';
}
