import type { Scenario } from '@snow-mastery/scenarios';
import { runFunctionalLayer, type FunctionalOptions } from './functional';
import { LayerRecorder } from './layer-result';
import { buildReviewRequest, runReviewLayer, type ArchitectReviewer } from './review';
import { runStaticLayer } from './static/run';
import { runStructureLayer } from './structure';
import {
  systemClock,
  type Clock,
  type GraderSnow,
  type LayerName,
  type LayerResult,
  type LayerStatus,
} from './types';

export interface GradeHooks {
  onLayerStart?(layer: LayerName): void | Promise<void>;
  onLayerComplete?(result: LayerResult): void | Promise<void>;
}

export interface GradeInput {
  scenario: Scenario;
  snow: GraderSnow;
  reviewer?: ArchitectReviewer;
  clock?: Clock;
  functional?: FunctionalOptions;
  hooks?: GradeHooks;
}

export interface GradeReport {
  /** Decided by layers 1–3 only; the review never changes it. */
  passed: boolean;
  layers: LayerResult[];
}

const PASSING: ReadonlySet<LayerStatus> = new Set(['PASSED', 'SKIPPED']);

/** Runs the four layers in order, reporting each as it completes. */
export async function gradeAttempt(input: GradeInput): Promise<GradeReport> {
  const clock = input.clock ?? systemClock;
  const hooks = input.hooks ?? {};
  const layers: LayerResult[] = [];
  const run = async <R extends LayerResult>(
    layer: LayerName,
    body: () => Promise<R> | R,
  ): Promise<R> => {
    await hooks.onLayerStart?.(layer);
    const result = await body();
    layers.push(result);
    await hooks.onLayerComplete?.(result);
    return result;
  };
  const notRun = (layer: LayerName, status: LayerStatus, summary: string) =>
    run(layer, () => new LayerRecorder(layer, clock).finish(status, summary));

  let captured = new Map();
  const structure = await run('STRUCTURE', async () => {
    const outcome = await runStructureLayer(input.scenario, input.snow, clock);
    captured = outcome.captured;
    return outcome.result;
  });

  if (structure.status === 'ERROR') {
    await notRun('STATIC', 'BLOCKED', 'Waiting for a working connection to your PDI.');
    await notRun('FUNCTIONAL', 'BLOCKED', 'Waiting for a working connection to your PDI.');
    await notRun('REVIEW', 'SKIPPED', 'Waiting for a working connection to your PDI.');
    return { passed: false, layers };
  }

  await run('STATIC', () => runStaticLayer(input.scenario, captured, clock));

  if (structure.status === 'PASSED') {
    await run('FUNCTIONAL', () =>
      runFunctionalLayer(input.scenario, input.snow, clock, input.functional),
    );
  } else if (input.scenario.functional) {
    await notRun(
      'FUNCTIONAL',
      'BLOCKED',
      'Fix the layer 1 problems first; the ATF suite needs your records in place.',
    );
  } else {
    await notRun('FUNCTIONAL', 'SKIPPED', 'This scenario has no ATF suite.');
  }

  const deterministic = [...layers];
  await run('REVIEW', () =>
    runReviewLayer(
      buildReviewRequest(input.scenario, captured, deterministic),
      input.reviewer,
      clock,
    ),
  );

  return { passed: deterministic.every((l) => PASSING.has(l.status)), layers };
}
