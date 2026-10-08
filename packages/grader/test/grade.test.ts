import { describe, expect, it, vi } from 'vitest';
import { gradeAttempt, type ArchitectReviewer, type LayerName } from '../src';
import { fakePdi, fixedClock, vip } from './helpers';

const SUITE = 'Script Lab - VIP caller alert';
const passingSuite = {
  [SUITE]: {
    outcome: 'success' as const,
    tests: [{ name: 'contract', status: 'success', output: '' }],
  },
};

const reviewer: ArchitectReviewer = async () => ({
  status: 'ok',
  model: 'stub',
  feedback: {
    summary: 'Solid, workspace-ready solution.',
    whatWorks: ['Asynchronous GlideAjax'],
    boardChallenges: [
      {
        rubricId: 'security',
        concern: 'Any caller id can be probed',
        whyItMatters: 'Data exposure',
      },
    ],
    improvement: { title: 'Translate the message', detail: 'Use getMessage().' },
  },
});

describe('gradeAttempt', () => {
  it('passes the correct solution across all four layers and reports progress in order', async () => {
    const { snow } = fakePdi('correct', { suites: passingSuite });
    const events: string[] = [];
    const report = await gradeAttempt({
      scenario: vip,
      snow,
      reviewer,
      clock: fixedClock,
      hooks: {
        onLayerStart: (layer) => void events.push(`start:${layer}`),
        onLayerComplete: (result) => void events.push(`done:${result.layer}:${result.status}`),
      },
    });
    expect(report.passed).toBe(true);
    expect(events).toEqual([
      'start:STRUCTURE',
      'done:STRUCTURE:PASSED',
      'start:STATIC',
      'done:STATIC:PASSED',
      'start:FUNCTIONAL',
      'done:FUNCTIONAL:PASSED',
      'start:REVIEW',
      'done:REVIEW:COMPLETED',
    ]);
  });

  it('fails the flawed solution on layer 2 even when the review is glowing', async () => {
    const { snow } = fakePdi('flawed', { suites: passingSuite });
    const report = await gradeAttempt({ scenario: vip, snow, reviewer, clock: fixedClock });
    expect(report.passed).toBe(false);
    expect(statuses(report.layers)).toEqual({
      STRUCTURE: 'PASSED',
      STATIC: 'FAILED',
      FUNCTIONAL: 'PASSED',
      REVIEW: 'COMPLETED',
    });
  });

  it('sends the reviewer the scripts, rubric and deterministic problems', async () => {
    const { snow } = fakePdi('flawed', { suites: passingSuite });
    const spy = vi.fn(reviewer);
    await gradeAttempt({ scenario: vip, snow, reviewer: spy, clock: fixedClock });
    const request = spy.mock.calls[0]![0];
    expect(request.scripts.map((s) => s.alias)).toEqual(['ajaxInclude', 'onChangeScript']);
    expect(request.scenario.rubric.map((r) => r.id)).toContain('security');
    const staticLayer = request.deterministic.find((l) => l.layer === 'STATIC');
    expect(staticLayer?.problems.map((p) => p.title)).toContain(
      'No synchronous GlideAjax (getXMLWait)',
    );
  });

  it('blocks the ATF run when layer 1 fails, and skips the review when nothing was found', async () => {
    const { snow, fake } = fakePdi('empty', { suites: passingSuite });
    const report = await gradeAttempt({ scenario: vip, snow, reviewer, clock: fixedClock });
    expect(statuses(report.layers)).toEqual({
      STRUCTURE: 'FAILED',
      STATIC: 'BLOCKED',
      FUNCTIONAL: 'BLOCKED',
      REVIEW: 'SKIPPED',
    });
    expect(fake.requests.some((r) => r.path.includes('sn_cicd'))).toBe(false);
  });

  it('stops early with an actionable error when the PDI is asleep', async () => {
    const { snow, fake } = fakePdi('correct');
    fake.mode = 'hibernating-redirect';
    const report = await gradeAttempt({ scenario: vip, snow, reviewer, clock: fixedClock });
    expect(report.passed).toBe(false);
    expect(report.layers[0]).toMatchObject({ status: 'ERROR', summary: 'Your PDI is asleep' });
    expect(statuses(report.layers).STATIC).toBe('BLOCKED');
  });

  it('treats reviewer failures as coaching errors that never change the verdict', async () => {
    const { snow } = fakePdi('correct', { suites: passingSuite });
    const broken: ArchitectReviewer = async () => {
      throw new Error('overloaded');
    };
    const report = await gradeAttempt({ scenario: vip, snow, reviewer: broken, clock: fixedClock });
    expect(report.passed).toBe(true);
    expect(report.layers[3]).toMatchObject({
      status: 'ERROR',
      summary: 'The architect review failed: overloaded',
    });
  });
});

function statuses(layers: Array<{ layer: LayerName; status: string }>) {
  return Object.fromEntries(layers.map((l) => [l.layer, l.status]));
}
