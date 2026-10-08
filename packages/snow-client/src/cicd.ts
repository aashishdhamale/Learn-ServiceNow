import { z } from 'zod';
import type { SnowHttp } from './http';
import { encodedQuery } from './query';
import type { TableApi } from './table';

/** Lifecycle of a CI/CD API operation; the API reports it as "0".."4". */
export type CicdState = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';

const STATES: Record<string, CicdState> = {
  '0': 'PENDING',
  '1': 'RUNNING',
  '2': 'SUCCEEDED',
  '3': 'FAILED',
  '4': 'CANCELED',
};

export interface CicdProgress {
  state: CicdState;
  percentComplete: number;
  label: string;
  message: string;
  detail: string;
  error: string;
  progressId?: string;
  /** sys_id of the sys_atf_test_suite_result, once the run has finished. */
  resultsId?: string;
}

export interface TestSuiteResults {
  suiteName?: string;
  /** e.g. "success" or "failure" */
  suiteStatus: string;
  duration?: string;
  counts: { success: number; failure: number; error: number; skip: number };
}

export interface AtfTestResult {
  sysId: string;
  testName: string;
  /** e.g. "success", "failure", "error", "skipped" */
  status: string;
  output: string;
}

const Link = z.object({ id: z.string().optional(), url: z.string().optional() }).loose();
const StringValue = z.union([z.string(), z.number()]).transform(String);
const Count = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => Number(v ?? 0) || 0);

const ProgressResponse = z.object({
  result: z
    .object({
      status: StringValue,
      status_label: z.string().optional(),
      status_message: z.string().optional(),
      status_detail: z.string().optional(),
      error: z.string().optional(),
      percent_complete: z.union([z.number(), z.string()]).optional(),
      links: z.object({ progress: Link.optional(), results: Link.optional() }).loose().optional(),
    })
    .loose(),
});

const ResultsResponse = z.object({
  result: z
    .object({
      test_suite_name: z.string().optional(),
      test_suite_status: z.string().optional(),
      test_suite_duration: z.string().optional(),
      rolledup_test_success_count: Count,
      rolledup_test_failure_count: Count,
      rolledup_test_error_count: Count,
      rolledup_test_skip_count: Count,
    })
    .loose(),
});

/** Runs ATF suites through the CI/CD REST API (requires admin or sn_cicd.sys_ci_automation). */
export class CicdApi {
  constructor(
    private readonly http: SnowHttp,
    private readonly table: TableApi,
  ) {}

  async runTestSuite(suite: { name: string } | { sysId: string }): Promise<CicdProgress> {
    const response = await this.http.request({
      method: 'POST',
      path: '/api/sn_cicd/testsuite/run',
      query: 'name' in suite ? { test_suite_name: suite.name } : { test_suite_sys_id: suite.sysId },
      schema: ProgressResponse,
      idempotent: false,
    });
    return toProgress(response.result);
  }

  async getProgress(progressId: string): Promise<CicdProgress> {
    const response = await this.http.request({
      path: `/api/sn_cicd/progress/${encodeURIComponent(progressId)}`,
      schema: ProgressResponse,
    });
    return toProgress(response.result);
  }

  async getTestSuiteResults(resultsId: string): Promise<TestSuiteResults> {
    const { result } = await this.http.request({
      path: `/api/sn_cicd/testsuite/results/${encodeURIComponent(resultsId)}`,
      schema: ResultsResponse,
    });
    return {
      suiteName: result.test_suite_name,
      suiteStatus: result.test_suite_status ?? '',
      duration: result.test_suite_duration,
      counts: {
        success: result.rolledup_test_success_count,
        failure: result.rolledup_test_failure_count,
        error: result.rolledup_test_error_count,
        skip: result.rolledup_test_skip_count,
      },
    };
  }

  /** Per-test outcomes for a suite run, read from sys_atf_test_result via the Table API. */
  async listTestResults(resultsId: string): Promise<AtfTestResult[]> {
    const rows = await this.table.list('sys_atf_test_result', {
      query: encodedQuery([{ field: 'parent', value: resultsId }]),
      fields: ['sys_id', 'test', 'test.name', 'status', 'output'],
      limit: 200,
    });
    return rows.map((row) => ({
      sysId: row.sys_id ?? '',
      testName: row['test.name'] || row.test || 'Unnamed test',
      status: row.status ?? '',
      output: row.output ?? '',
    }));
  }

  /** Link to a suite result in the instance UI, for "open in your PDI" buttons. */
  suiteResultUrl(resultsId: string): string {
    return `${this.http.baseUrl}/sys_atf_test_suite_result.do?sys_id=${encodeURIComponent(resultsId)}`;
  }
}

function toProgress(result: z.infer<typeof ProgressResponse>['result']): CicdProgress {
  return {
    state: STATES[result.status] ?? 'FAILED',
    percentComplete: Number(result.percent_complete ?? 0) || 0,
    label: result.status_label ?? '',
    message: result.status_message ?? '',
    detail: result.status_detail ?? '',
    error: result.error ?? '',
    progressId: result.links?.progress?.id,
    resultsId: result.links?.results?.id,
  };
}

export function isTerminal(state: CicdState): boolean {
  return state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELED';
}
