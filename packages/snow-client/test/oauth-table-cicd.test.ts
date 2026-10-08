import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl,
  createPkcePair,
  createSnowClient,
  exchangeAuthorizationCode,
  refreshTokens,
  SnowOAuthError,
  TableApi,
} from '../src';
import { FakeInstance, recordingSleep, staticTokens } from '../src/testing';

const BASE = 'https://dev1.service-now.com';

describe('OAuth authorization code flow', () => {
  const client = { clientId: 'cid', clientSecret: 'secret' };

  it('builds an authorize URL with state and an S256 PKCE challenge', () => {
    const url = new URL(
      buildAuthorizeUrl({
        baseUrl: BASE,
        clientId: 'cid',
        redirectUri: 'http://localhost:3000/cb',
        state: 's1',
        codeChallenge: 'c1',
      }),
    );
    expect(url.pathname).toBe('/oauth_auth.do');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'http://localhost:3000/cb',
      state: 's1',
      code_challenge: 'c1',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges a code (verifying PKCE) and refreshes, keeping the refresh token', async () => {
    const fake = new FakeInstance({ oauthClients: [client] });
    const pkce = createPkcePair();
    const authorize = await fake.fetch(
      buildAuthorizeUrl({
        baseUrl: BASE,
        clientId: 'cid',
        redirectUri: 'http://app/cb',
        state: 'st',
        codeChallenge: pkce.challenge,
      }),
    );
    const code = new URL(authorize.headers.get('location')!).searchParams.get('code')!;
    const config = { baseUrl: BASE, ...client, redirectUri: 'http://app/cb', fetch: fake.fetch };
    const now = () => new Date('2026-10-08T12:00:00Z');

    const tokens = await exchangeAuthorizationCode(
      config,
      { code, codeVerifier: pkce.verifier },
      now,
    );
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.expiresAt.toISOString()).toBe('2026-10-08T12:29:59.000Z');

    const refreshed = await refreshTokens(config, tokens.refreshToken!, now);
    expect(refreshed.accessToken).not.toBe(tokens.accessToken);
    expect(refreshed.refreshToken).toBe(tokens.refreshToken);
  });

  it('surfaces token endpoint errors as SnowOAuthError', async () => {
    const fake = new FakeInstance({ oauthClients: [client] });
    const config = {
      baseUrl: BASE,
      clientId: 'cid',
      clientSecret: 'wrong',
      redirectUri: 'http://app/cb',
      fetch: fake.fetch,
    };
    const error = await refreshTokens(config, 'whatever').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnowOAuthError);
    expect(error).toMatchObject({ oauthError: 'invalid_client' });
  });
});

describe('Table API', () => {
  const fake = new FakeInstance({
    records: [
      {
        table: 'sys_script_include',
        fields: { sys_id: 'a', name: 'One', active: 'true', script: 'x' },
      },
      {
        table: 'sys_script_include',
        fields: { sys_id: 'b', name: 'Two', active: 'false', script: 'y' },
      },
    ],
  });
  const snow = createSnowClient({ instance: 'dev1', tokens: staticTokens(), fetch: fake.fetch });

  it('lists records with query, fields and limit', async () => {
    const rows = await snow.table.list('sys_script_include', {
      query: 'active=true',
      fields: ['sys_id', 'name'],
      limit: 5,
    });
    expect(rows).toEqual([{ sys_id: 'a', name: 'One' }]);
    const request = fake.requests.at(-1)!;
    expect(new URLSearchParams(request.search).get('sysparm_exclude_reference_link')).toBe('true');
  });

  it('flattens reference objects and nulls to strings', async () => {
    const odd = new FakeInstance();
    odd.queueResponse('/api/now/table/', () =>
      Response.json({ result: [{ manager: { value: 'abc', link: 'x' }, vip: true, note: null }] }),
    );
    const client = createSnowClient({ instance: 'dev1', tokens: staticTokens(), fetch: odd.fetch });
    expect(await client.table.list('sys_user')).toEqual([
      { manager: 'abc', vip: 'true', note: '' },
    ]);
  });

  it('is read-only by construction', () => {
    const methods = Object.getOwnPropertyNames(TableApi.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods).toEqual(['list']);
  });

  it('rejects invalid table names before sending anything', async () => {
    await expect(snow.table.list('sys_user/../x')).rejects.toThrow(/not a valid table name/);
  });
});

describe('CI/CD test suite API', () => {
  it('runs a suite, polls progress, and reads results and per-test outcomes', async () => {
    const fake = new FakeInstance({
      suites: {
        'My suite': {
          outcome: 'failure',
          pollsUntilDone: 1,
          tests: [
            { name: 'Contract', status: 'failure', output: 'expected true, got false' },
            { name: 'Smoke', status: 'success', output: '' },
          ],
        },
      },
    });
    const snow = createSnowClient({
      instance: 'dev1',
      tokens: staticTokens(),
      fetch: fake.fetch,
      sleep: recordingSleep().sleep,
    });

    const started = await snow.cicd.runTestSuite({ name: 'My suite' });
    expect(started.state).toBe('PENDING');
    expect((await snow.cicd.getProgress(started.progressId!)).state).toBe('RUNNING');
    const done = await snow.cicd.getProgress(started.progressId!);
    expect(done).toMatchObject({ state: 'FAILED', percentComplete: 100 });

    const results = await snow.cicd.getTestSuiteResults(done.resultsId!);
    expect(results.counts).toEqual({ success: 1, failure: 1, error: 0, skip: 0 });

    const tests = await snow.cicd.listTestResults(done.resultsId!);
    expect(tests.map((t) => [t.testName, t.status])).toEqual([
      ['Contract', 'failure'],
      ['Smoke', 'success'],
    ]);
    expect(snow.cicd.suiteResultUrl(done.resultsId!)).toBe(
      `https://dev1.service-now.com/sys_atf_test_suite_result.do?sys_id=${done.resultsId}`,
    );
  });
});
