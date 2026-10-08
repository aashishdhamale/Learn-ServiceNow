import type { Scenario } from '@snow-mastery/scenarios';
import {
  describeSnowError,
  encodedQuery,
  isSnowError,
  isTerminal,
  SnowBadRequestError,
  SnowForbiddenError,
  SnowNotFoundError,
  type AtfTestResult,
  type CicdProgress,
  type TestSuiteResults,
} from '@snow-mastery/snow-client';
import { LayerRecorder, plural } from './layer-result';
import type { Clock, GraderSnow, LayerResult } from './types';

export interface FunctionalOptions {
  /** Give up waiting for the suite after this long. */
  timeoutMs?: number;
  initialPollMs?: number;
  maxPollMs?: number;
}

export interface FunctionalDetails {
  suiteName: string;
  progressId?: string;
  resultsId?: string;
  resultsUrl?: string;
  counts?: TestSuiteResults['counts'];
  duration?: string;
  tests?: AtfTestResult[];
}

const DEFAULTS = { timeoutMs: 600_000, initialPollMs: 2_000, maxPollMs: 10_000 };
const SUITE_NOT_FOUND = /not found|does not exist|no (?:test )?suite|invalid test suite/i;
const EXECUTION_DISABLED = /disabled|not enabled/i;

const ATF_PROPERTIES_ACTION =
  'In your PDI open Automated Test Framework > Administration > Properties, set "Enable test/test suite execution" to Yes, then check your work again.';
const CLIENT_RUNNER_ACTION =
  'Open Automated Test Framework > Run > Client Test Runner in another browser tab, signed in as the same user, and leave it open while the suite runs.';

/** Layer 3: run the scenario's ATF suite in the learner's PDI through the CI/CD API. */
export async function runFunctionalLayer(
  scenario: Scenario,
  snow: GraderSnow,
  clock: Clock,
  options: FunctionalOptions = {},
): Promise<LayerResult<FunctionalDetails>> {
  const recorder = new LayerRecorder('FUNCTIONAL', clock);
  const functional = scenario.functional;
  if (!functional) {
    return recorder.finish('SKIPPED', 'This scenario has no ATF suite.');
  }
  const details: FunctionalDetails = { suiteName: functional.suiteName };
  const blocked = (title: string, message: string, fix: string) => {
    recorder.add({
      checkId: 'atf.preflight',
      severity: 'error',
      passed: false,
      title,
      message,
      fix,
    });
    return recorder.finish('BLOCKED', title, details);
  };

  if (functional.requiresClientRunner) {
    recorder.add({
      checkId: 'atf.client-runner',
      severity: 'info',
      passed: true,
      title: 'This suite has UI steps',
      message: 'UI steps only run while a Client Test Runner is open in your PDI.',
      fix: CLIENT_RUNNER_ACTION,
    });
  }

  try {
    if ((await atfExecutionProperty(snow)) === 'false') {
      return blocked(
        'ATF test execution is disabled',
        'Your PDI does not allow tests to run.',
        ATF_PROPERTIES_ACTION,
      );
    }

    let progress: CicdProgress;
    try {
      progress = await snow.cicd.runTestSuite({ name: functional.suiteName });
    } catch (error) {
      if (error instanceof SnowForbiddenError) {
        return blocked(
          'Missing role for the CI/CD API',
          'Your user is not allowed to run test suites through the CI/CD API.',
          'Connect as a user with admin or sn_cicd.sys_ci_automation.',
        );
      }
      if (
        (error instanceof SnowBadRequestError || error instanceof SnowNotFoundError) &&
        SUITE_NOT_FOUND.test(error.message)
      ) {
        return suiteNotFound(functional.suiteName, blocked);
      }
      throw error;
    }
    details.progressId = progress.progressId;

    const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    const deadline = clock.now().getTime() + timeoutMs;
    let delay = options.initialPollMs ?? DEFAULTS.initialPollMs;
    while (!isTerminal(progress.state)) {
      if (clock.now().getTime() >= deadline || !progress.progressId) {
        return blocked(
          'The ATF run did not finish in time',
          `The suite was still ${progress.state.toLowerCase()} after ${Math.round(timeoutMs / 60_000)} minutes.`,
          functional.requiresClientRunner
            ? `${CLIENT_RUNNER_ACTION} Then check your work again.`
            : 'Open Automated Test Framework > Suite Results in your PDI to see whether it is still running, then check your work again.',
        );
      }
      await clock.sleep(delay);
      delay = Math.min(Math.round(delay * 1.5), options.maxPollMs ?? DEFAULTS.maxPollMs);
      progress = await snow.cicd.getProgress(progress.progressId);
    }

    if (progress.state === 'CANCELED') {
      return blocked(
        'The ATF run was canceled',
        progress.error || progress.message || 'Canceled in your PDI.',
        'Check your work again.',
      );
    }
    if (!progress.resultsId) {
      const reason =
        progress.error || progress.message || 'The CI/CD API reported a failure without results.';
      if (EXECUTION_DISABLED.test(reason)) {
        return blocked('ATF test execution is disabled', reason, ATF_PROPERTIES_ACTION);
      }
      if (SUITE_NOT_FOUND.test(reason)) return suiteNotFound(functional.suiteName, blocked);
      recorder.add({
        checkId: 'atf.run',
        severity: 'error',
        passed: false,
        title: 'The ATF run failed',
        message: reason,
      });
      return recorder.finish('FAILED', 'The ATF run failed before producing results.', details);
    }

    details.resultsId = progress.resultsId;
    details.resultsUrl = snow.cicd.suiteResultUrl(progress.resultsId);
    const results = await snow.cicd.getTestSuiteResults(progress.resultsId);
    details.counts = results.counts;
    details.duration = results.duration;
    details.tests = await perTestResults(snow, progress.resultsId);

    for (const test of details.tests) {
      const passed = test.status === 'success';
      recorder.add({
        checkId: `atf.test.${test.sysId || test.testName}`,
        severity: test.status === 'skipped' ? 'info' : 'error',
        passed,
        title: test.testName,
        message: passed ? 'Passed.' : truncate(test.output) || `Test ${test.status}.`,
        fix: passed ? undefined : 'Open the suite result in your PDI for step-by-step output.',
        docsUrl: passed ? undefined : details.resultsUrl,
      });
    }

    const { success, failure, error, skip } = results.counts;
    const total = success + failure + error + skip;
    if (progress.state === 'SUCCEEDED') {
      return recorder.finish('PASSED', `All ${plural(total || success, 'test')} passed.`, details);
    }
    if (details.tests.length === 0) {
      recorder.add({
        checkId: 'atf.suite',
        severity: 'error',
        passed: false,
        title: functional.suiteName,
        message: `${plural(failure + error, 'test')} failed.`,
        fix: 'Open the suite result in your PDI for step-by-step output.',
        docsUrl: details.resultsUrl,
      });
    }
    return recorder.finish(
      'FAILED',
      `${failure + error} of ${plural(total, 'test')} failed.`,
      details,
    );
  } catch (error) {
    if (!isSnowError(error)) throw error;
    const described = describeSnowError(error, snow.instance);
    recorder.add({
      checkId: 'atf.connection',
      severity: 'error',
      passed: false,
      title: described.title,
      message: described.message,
      fix: described.action,
    });
    return recorder.finish('ERROR', described.title, details);
  }
}

function suiteNotFound(
  suiteName: string,
  blocked: (title: string, message: string, fix: string) => LayerResult<FunctionalDetails>,
) {
  return blocked(
    'ATF suite not found in your PDI',
    `There is no test suite named "${suiteName}".`,
    'Create it by following the scenario\'s "ATF setup" guide; the name must match exactly.',
  );
}

async function atfExecutionProperty(snow: GraderSnow): Promise<string | undefined> {
  try {
    const [row] = await snow.table.list('sys_properties', {
      query: encodedQuery([{ field: 'name', value: 'sn_atf.runner.enabled' }]),
      fields: ['value'],
      limit: 1,
    });
    return row?.value;
  } catch (error) {
    if (error instanceof SnowForbiddenError) return undefined; // the run itself will tell us
    throw error;
  }
}

/** Per-test detail is a bonus: never fail the layer because it could not be read. */
async function perTestResults(snow: GraderSnow, resultsId: string): Promise<AtfTestResult[]> {
  try {
    return await snow.cicd.listTestResults(resultsId);
  } catch {
    return [];
  }
}

function truncate(text: string, max = 600): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
