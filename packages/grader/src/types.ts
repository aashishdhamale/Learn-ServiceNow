import type { ScriptKind } from '@snow-mastery/scenarios';
import type {
  AtfTestResult,
  CicdProgress,
  SnowRecord,
  ListOptions,
  TestSuiteResults,
} from '@snow-mastery/snow-client';

export type LayerName = 'STRUCTURE' | 'STATIC' | 'FUNCTIONAL' | 'REVIEW';
export const LAYERS: readonly LayerName[] = ['STRUCTURE', 'STATIC', 'FUNCTIONAL', 'REVIEW'];

/**
 * PASSED/FAILED are verdicts. BLOCKED means the layer could not run for a reason the learner
 * can fix (e.g. ATF disabled) and counts as not passed. SKIPPED means there was nothing to
 * check and counts as passed. ERROR means the grader itself hit a problem.
 */
export type LayerStatus = 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED' | 'ERROR';

export type Severity = 'error' | 'warning' | 'info';

export interface FindingTarget {
  alias?: string;
  table?: string;
  sysId?: string;
  name?: string;
}

/** One check or rule outcome, phrased for the learner. */
export interface Finding {
  checkId: string;
  severity: Severity;
  passed: boolean;
  title: string;
  message: string;
  why?: string;
  fix?: string;
  docsUrl?: string;
  target?: FindingTarget;
  line?: number;
  column?: number;
  snippet?: string;
}

export interface LayerResult<D = unknown> {
  layer: LayerName;
  status: LayerStatus;
  summary: string;
  findings: Finding[];
  details?: D;
  startedAt: string;
  finishedAt: string;
}

/** A learner script found by a structure check, available to later layers by alias. */
export interface CapturedScript {
  alias: string;
  checkId: string;
  kind: ScriptKind;
  table: string;
  sysId: string;
  name: string;
  script: string;
  record: SnowRecord;
}

/** The slice of the ServiceNow client the grader needs; satisfied by SnowClient. */
export interface GraderSnow {
  instance: string;
  table: { list(table: string, options?: ListOptions): Promise<SnowRecord[]> };
  cicd: {
    runTestSuite(suite: { name: string }): Promise<CicdProgress>;
    getProgress(progressId: string): Promise<CicdProgress>;
    getTestSuiteResults(resultsId: string): Promise<TestSuiteResults>;
    listTestResults(resultsId: string): Promise<AtfTestResult[]>;
    suiteResultUrl(resultsId: string): string;
  };
}

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
