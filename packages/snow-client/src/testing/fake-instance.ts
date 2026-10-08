import { createHash } from 'node:crypto';
import type { FetchLike } from '../http';
import { applyEncodedQuery } from './encoded-query';

/**
 * An in-memory stand-in for a ServiceNow PDI: OAuth endpoints, the Table API and the CI/CD
 * test-suite API. Response shapes follow the documented APIs. Used by unit tests across the
 * monorepo and wrapped in an HTTP server for the Playwright e2e run.
 */
export interface FakeUser {
  sysId: string;
  userName: string;
  name: string;
  roles: string[];
}

export interface FakeSuite {
  outcome: 'success' | 'failure';
  /** Progress polls that report "running" before the run finishes. */
  pollsUntilDone?: number;
  tests?: Array<{ name: string; status: string; output: string }>;
}

export interface FakeOAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface FakeInstanceOptions {
  records?: Array<{ table: string; fields: Record<string, string> }>;
  user?: FakeUser;
  properties?: Record<string, string>;
  suites?: Record<string, FakeSuite>;
  /** When set, the token endpoint only accepts these clients. */
  oauthClients?: FakeOAuthClient[];
  /** Bearer tokens accepted without going through OAuth (unit tests). */
  staticTokens?: string[];
  accessTokenTtlSeconds?: number;
  forbiddenTables?: string[];
}

export type FakeMode = 'awake' | 'hibernating-redirect' | 'hibernating-html';

interface Run {
  suiteName: string;
  suite: FakeSuite;
  polls: number;
  resultsId: string;
}

const DEFAULT_USER: FakeUser = {
  sysId: '6816f79cc0a8016401c5a33be04be441',
  userName: 'admin',
  name: 'System Administrator',
  roles: ['admin'],
};

export class FakeInstance {
  mode: FakeMode = 'awake';
  readonly requests: Array<{ method: string; path: string; search: string }> = [];
  readonly user: FakeUser;
  readonly fetch: FetchLike = (input, init) => this.handle(new Request(input, init));

  private records: Array<{ table: string; fields: Record<string, string> }>;
  private readonly options: FakeInstanceOptions;
  private readonly validTokens: Set<string>;
  private readonly refreshTokens = new Set<string>();
  private readonly authCodes = new Map<string, { clientId: string; redirectUri: string; challenge: string }>();
  private readonly runs = new Map<string, Run>();
  private readonly queued: Array<{ pathPrefix: string; response: () => Response }> = [];
  private counter = 0;

  constructor(options: FakeInstanceOptions = {}) {
    this.options = options;
    this.user = options.user ?? DEFAULT_USER;
    this.validTokens = new Set(options.staticTokens ?? ['test-token']);
    this.records = [...(options.records ?? []), ...this.baselineRecords()];
  }

  /** Invalidates every access token, as if they had expired. Refresh tokens keep working. */
  expireAccessTokens() {
    this.validTokens.clear();
  }

  revokeRefreshTokens() {
    this.refreshTokens.clear();
  }

  setRecords(records: Array<{ table: string; fields: Record<string, string> }>) {
    this.records = [...records, ...this.baselineRecords()];
  }

  /** The next request whose path starts with `pathPrefix` gets this response instead. */
  queueResponse(pathPrefix: string, response: () => Response) {
    this.queued.push({ pathPrefix, response });
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Instance URL templates may prefix the path with /<instance>; strip it.
    const path = url.pathname.replace(/^\/[a-z0-9-]+(?=\/(api|oauth_auth\.do|oauth_token\.do))/, '');
    this.requests.push({ method: request.method, path, search: url.search });

    const queuedIndex = this.queued.findIndex((q) => path.startsWith(q.pathPrefix));
    if (queuedIndex >= 0) return this.queued.splice(queuedIndex, 1)[0]!.response();

    if (this.mode === 'hibernating-redirect') {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://developer.servicenow.com/dev.do#!/home?wu=true' },
      });
    }
    if (this.mode === 'hibernating-html') {
      return new Response(
        '<html><head><title>Instance Hibernating page</title></head><body>Your instance is hibernating. ' +
          'Visit developer.servicenow.com to wake it up.</body></html>',
        { status: 200, headers: { 'content-type': 'text/html;charset=UTF-8' } },
      );
    }

    if (path === '/oauth_auth.do' && request.method === 'GET') return this.authorize(url);
    if (path === '/oauth_token.do' && request.method === 'POST') return this.token(request);

    if (!this.isAuthorized(request)) {
      return json(401, { error: { message: 'User Not Authenticated', detail: 'Required to provide Auth information' }, status: 'failure' });
    }

    const tableMatch = /^\/api\/now\/table\/([a-z0-9_]+)$/.exec(path);
    if (tableMatch && request.method === 'GET') return this.table(tableMatch[1]!, url.searchParams);
    if (path === '/api/sn_cicd/testsuite/run' && request.method === 'POST') return this.runSuite(url.searchParams);
    const progressMatch = /^\/api\/sn_cicd\/progress\/([^/]+)$/.exec(path);
    if (progressMatch) return this.progress(decodeURIComponent(progressMatch[1]!));
    const resultsMatch = /^\/api\/sn_cicd\/testsuite\/results\/([^/]+)$/.exec(path);
    if (resultsMatch) return this.results(decodeURIComponent(resultsMatch[1]!));

    return json(400, { error: { message: `Requested URI does not represent any resource: ${path}` }, status: 'failure' });
  }

  private baselineRecords() {
    const user = this.user;
    const rows: Array<{ table: string; fields: Record<string, string> }> = [
      { table: 'sys_user', fields: { sys_id: user.sysId, user_name: user.userName, name: user.name } },
      ...user.roles.map((role, i) => ({
        table: 'sys_user_has_role',
        fields: { sys_id: `role${i}`, user: user.sysId, 'role.name': role, state: 'active' },
      })),
    ];
    const properties = { 'sn_atf.runner.enabled': 'true', 'glide.buildname': 'Zurich', ...this.options.properties };
    for (const [name, value] of Object.entries(properties)) {
      rows.push({ table: 'sys_properties', fields: { sys_id: `prop-${name}`, name, value } });
    }
    return rows;
  }

  private isAuthorized(request: Request): boolean {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return this.validTokens.has(token);
  }

  private authorize(url: URL): Response {
    const params = url.searchParams;
    const redirectUri = params.get('redirect_uri') ?? '';
    const clientId = params.get('client_id') ?? '';
    if (this.options.oauthClients && !this.options.oauthClients.some((c) => c.clientId === clientId)) {
      return new Response('Invalid client', { status: 400, headers: { 'content-type': 'text/plain' } });
    }
    const code = `code-${++this.counter}`;
    this.authCodes.set(code, { clientId, redirectUri, challenge: params.get('code_challenge') ?? '' });
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', params.get('state') ?? '');
    return new Response(null, { status: 302, headers: { location: target.toString() } });
  }

  private async token(request: Request): Promise<Response> {
    const form = new URLSearchParams(await request.text());
    const clientId = form.get('client_id') ?? '';
    const clientSecret = form.get('client_secret') ?? '';
    const clients = this.options.oauthClients;
    if (clients && !clients.some((c) => c.clientId === clientId && c.clientSecret === clientSecret)) {
      return json(401, { error: 'invalid_client', error_description: 'access_denied' });
    }
    const grant = form.get('grant_type');
    if (grant === 'authorization_code') {
      const code = this.authCodes.get(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (!code || code.redirectUri !== form.get('redirect_uri') || (code.challenge && code.challenge !== challenge)) {
        return json(400, { error: 'invalid_grant', error_description: 'invalid authorization code' });
      }
      this.authCodes.delete(form.get('code')!);
      return this.issueTokens(true);
    }
    if (grant === 'refresh_token') {
      if (!this.refreshTokens.has(form.get('refresh_token') ?? '')) {
        return json(401, { error: 'invalid_grant', error_description: 'refresh token is invalid or expired' });
      }
      return this.issueTokens(false);
    }
    return json(400, { error: 'unsupported_grant_type' });
  }

  private issueTokens(withRefresh: boolean): Response {
    const accessToken = `access-${++this.counter}`;
    this.validTokens.add(accessToken);
    const body: Record<string, unknown> = {
      access_token: accessToken,
      scope: 'useraccount',
      token_type: 'Bearer',
      expires_in: this.options.accessTokenTtlSeconds ?? 1799,
    };
    if (withRefresh) {
      const refreshToken = `refresh-${this.counter}`;
      this.refreshTokens.add(refreshToken);
      body.refresh_token = refreshToken;
    }
    return json(200, body);
  }

  private table(table: string, params: URLSearchParams): Response {
    if (this.options.forbiddenTables?.includes(table)) {
      return json(403, { error: { message: 'User Not Authorized', detail: `ACL denied read on ${table}` }, status: 'failure' });
    }
    const rows = this.records.filter((r) => r.table === table).map((r) => r.fields);
    const filtered = applyEncodedQuery(rows, params.get('sysparm_query'), { currentUserId: this.user.sysId });
    const limit = Number(params.get('sysparm_limit') ?? '10000');
    const fields = params.get('sysparm_fields')?.split(',').filter(Boolean);
    const result = filtered.slice(0, limit).map((row) =>
      fields ? Object.fromEntries(fields.map((f) => [f, row[f] ?? ''])) : { ...row },
    );
    return json(200, { result });
  }

  private canUseCicd(): boolean {
    return this.user.roles.includes('admin') || this.user.roles.includes('sn_cicd.sys_ci_automation');
  }

  private runSuite(params: URLSearchParams): Response {
    if (!this.canUseCicd()) {
      return json(403, { error: { message: 'User Not Authorized', detail: 'Requires sn_cicd.sys_ci_automation' }, status: 'failure' });
    }
    const name = params.get('test_suite_name') ?? '';
    const suite = this.options.suites?.[name];
    if (!suite) {
      return json(400, { error: { message: `Test suite not found: ${name}`, detail: '' }, status: 'failure' });
    }
    const progressId = `progress${++this.counter}`;
    this.runs.set(progressId, { suiteName: name, suite, polls: 0, resultsId: `result${this.counter}` });
    return json(200, {
      result: {
        links: { progress: { id: progressId, url: `/api/sn_cicd/progress/${progressId}` } },
        status: '0',
        status_label: 'Pending',
        status_message: '',
        status_detail: '',
        error: '',
        percent_complete: 0,
      },
    });
  }

  private progress(progressId: string): Response {
    const run = this.runs.get(progressId);
    if (!run) return json(404, { error: { message: 'No record found' }, status: 'failure' });
    run.polls++;
    const progressLink = { id: progressId, url: `/api/sn_cicd/progress/${progressId}` };
    if (this.options.properties?.['sn_atf.runner.enabled'] === 'false') {
      return json(200, {
        result: {
          links: { progress: progressLink },
          status: '3',
          status_label: 'Failed',
          status_message: 'Failed',
          error: 'Test execution is disabled. Enable it in ATF properties.',
          percent_complete: 100,
        },
      });
    }
    if (run.polls <= (run.suite.pollsUntilDone ?? 1)) {
      return json(200, {
        result: { links: { progress: progressLink }, status: '1', status_label: 'Running', percent_complete: 50, error: '' },
      });
    }
    this.recordTestResults(run);
    const passed = run.suite.outcome === 'success';
    return json(200, {
      result: {
        links: {
          progress: progressLink,
          results: { id: run.resultsId, url: `/api/sn_cicd/testsuite/results/${run.resultsId}` },
        },
        status: passed ? '2' : '3',
        status_label: passed ? 'Successful' : 'Failed',
        status_message: passed ? 'Test suite run succeeded' : 'Test suite run failed',
        status_detail: '',
        error: passed ? '' : 'Test suite failed',
        percent_complete: 100,
      },
    });
  }

  private recordTestResults(run: Run) {
    if (this.records.some((r) => r.table === 'sys_atf_test_result' && r.fields.parent === run.resultsId)) return;
    for (const [i, test] of (run.suite.tests ?? []).entries()) {
      this.records.push({
        table: 'sys_atf_test_result',
        fields: {
          sys_id: `${run.resultsId}-test${i}`,
          parent: run.resultsId,
          test: `test${i}`,
          'test.name': test.name,
          status: test.status,
          output: test.output,
        },
      });
    }
  }

  private results(resultsId: string): Response {
    const run = [...this.runs.values()].find((r) => r.resultsId === resultsId);
    if (!run) return json(404, { error: { message: 'No record found' }, status: 'failure' });
    const tests = run.suite.tests ?? [];
    const count = (status: string) => tests.filter((t) => t.status === status).length;
    return json(200, {
      result: {
        test_suite_name: run.suiteName,
        test_suite_status: run.suite.outcome,
        test_suite_duration: '4 Seconds',
        rolledup_test_success_count: count('success'),
        rolledup_test_failure_count: count('failure'),
        rolledup_test_error_count: count('error'),
        rolledup_test_skip_count: count('skipped'),
      },
    });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json;charset=UTF-8' } });
}
