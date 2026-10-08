import { describe, expect, it } from 'vitest';
import { runFunctionalLayer, type FunctionalDetails } from '../src';
import type { Clock } from '../src/types';
import { fakePdi, vip } from './helpers';

const SUITE = 'Script Lab - VIP caller alert';

/** A clock whose sleep() advances time, so polling and timeouts are deterministic. */
function steppingClock(): Clock & { sleeps: number[] } {
  let now = Date.parse('2026-10-08T12:00:00Z');
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => new Date(now),
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  };
}

describe('layer 3: functional (ATF via CI/CD)', () => {
  it('passes when the suite succeeds, with per-test results and a link to the PDI', async () => {
    const { snow } = fakePdi('correct', {
      suites: {
        [SUITE]: {
          outcome: 'success',
          pollsUntilDone: 2,
          tests: [{ name: 'VIP caller alert - server contract', status: 'success', output: '' }],
        },
      },
    });
    const clock = steppingClock();
    const result = await runFunctionalLayer(vip, snow, clock);
    expect(result.status).toBe('PASSED');
    expect(result.summary).toBe('All 1 test passed.');
    const details = result.details as FunctionalDetails;
    expect(details.tests).toHaveLength(1);
    expect(details.resultsUrl).toMatch(/sys_atf_test_suite_result\.do\?sys_id=/);
    expect(clock.sleeps).toEqual([2000, 3000, 4500]);
  });

  it('fails with the failing test output when the suite fails', async () => {
    const { snow } = fakePdi('flawed', {
      suites: {
        [SUITE]: {
          outcome: 'failure',
          tests: [
            {
              name: 'VIP caller alert - server contract',
              status: 'failure',
              output: 'VIP without manager: managerName: expected "", got null',
            },
          ],
        },
      },
    });
    const result = await runFunctionalLayer(vip, snow, steppingClock());
    expect(result.status).toBe('FAILED');
    const failed = result.findings.find((f) => !f.passed);
    expect(failed).toMatchObject({
      title: 'VIP caller alert - server contract',
      severity: 'error',
    });
    expect(failed?.message).toContain('managerName');
    expect(failed?.docsUrl).toMatch(/sys_atf_test_suite_result/);
  });

  it('is BLOCKED with setup steps when the suite has not been created', async () => {
    const { snow } = fakePdi('correct');
    const result = await runFunctionalLayer(vip, snow, steppingClock());
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]).toMatchObject({
      title: 'ATF suite not found in your PDI',
      fix: expect.stringContaining('ATF setup'),
    });
  });

  it('is BLOCKED before running anything when ATF execution is disabled', async () => {
    const { snow, fake } = fakePdi('correct', {
      properties: { 'sn_atf.runner.enabled': 'false' },
      suites: { [SUITE]: { outcome: 'success' } },
    });
    const result = await runFunctionalLayer(vip, snow, steppingClock());
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]?.fix).toMatch(/Enable test\/test suite execution/);
    expect(fake.requests.some((r) => r.path.includes('sn_cicd'))).toBe(false);
  });

  it('is BLOCKED when the user lacks the CI/CD role', async () => {
    const { snow } = fakePdi('correct', {
      user: { sysId: 'u1', userName: 'beth', name: 'Beth', roles: ['itil'] },
      suites: { [SUITE]: { outcome: 'success' } },
    });
    const result = await runFunctionalLayer(vip, snow, steppingClock());
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]?.fix).toMatch(/sn_cicd\.sys_ci_automation/);
  });

  it('gives up after the timeout and explains how to check the run', async () => {
    const { snow } = fakePdi('correct', {
      suites: { [SUITE]: { outcome: 'success', pollsUntilDone: 1000 } },
    });
    const result = await runFunctionalLayer(vip, snow, steppingClock(), { timeoutMs: 60_000 });
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]?.title).toBe('The ATF run did not finish in time');
  });

  it('warns about the client test runner for suites with UI steps', async () => {
    const uiScenario = { ...vip, functional: { ...vip.functional!, requiresClientRunner: true } };
    const { snow } = fakePdi('correct', { suites: { [SUITE]: { outcome: 'success' } } });
    const result = await runFunctionalLayer(uiScenario, snow, steppingClock());
    expect(result.findings[0]).toMatchObject({ checkId: 'atf.client-runner', severity: 'info' });
    expect(result.findings[0]?.fix).toMatch(/Client Test Runner/);
  });

  it('is SKIPPED for scenarios without a suite', async () => {
    const { snow } = fakePdi('correct');
    const result = await runFunctionalLayer(
      { ...vip, functional: undefined },
      snow,
      steppingClock(),
    );
    expect(result.status).toBe('SKIPPED');
  });
});
