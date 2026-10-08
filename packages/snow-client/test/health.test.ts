import { describe, expect, it } from 'vitest';
import { checkConnection, createSnowClient } from '../src';
import {
  FakeInstance,
  recordingSleep,
  staticTokens,
  type FakeInstanceOptions,
} from '../src/testing';

const requiredTables = ['sys_script_client', 'sys_script_include'];
const scripts = [
  { table: 'sys_script_include', fields: { sys_id: '1', name: 'A' } },
  { table: 'sys_script_client', fields: { sys_id: '2', name: 'B' } },
];

function check(options: FakeInstanceOptions = {}, setup?: (fake: FakeInstance) => void) {
  const fake = new FakeInstance({ records: scripts, ...options });
  setup?.(fake);
  const client = createSnowClient({
    instance: 'dev1',
    tokens: staticTokens(),
    fetch: fake.fetch,
    sleep: recordingSleep().sleep,
  });
  return checkConnection(client, { requiredTables, now: () => new Date('2026-10-08T12:00:00Z') });
}

describe('checkConnection', () => {
  it('reports OK with user, roles and release for a healthy admin connection', async () => {
    const report = await check();
    expect(report.status).toBe('OK');
    expect(report.user).toMatchObject({ userName: 'admin', roles: ['admin'] });
    expect(report.release).toBe('Zurich');
    expect(report.checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('tells the learner to wake a hibernating PDI', async () => {
    const report = await check({}, (fake) => (fake.mode = 'hibernating-redirect'));
    expect(report.status).toBe('HIBERNATING');
    expect(report.headline).toMatch(/asleep/i);
    expect(report.action).toMatch(/developer\.servicenow\.com/);
  });

  it('detects the HTML hibernation page too', async () => {
    const report = await check({}, (fake) => (fake.mode = 'hibernating-html'));
    expect(report.status).toBe('HIBERNATING');
  });

  it('reports expired auth with a reconnect action', async () => {
    const report = await check({ staticTokens: ['other'] });
    expect(report.status).toBe('AUTH_EXPIRED');
    expect(report.action).toMatch(/Reconnect/);
  });

  it('reports missing access when script tables are forbidden', async () => {
    const report = await check({ forbiddenTables: ['sys_script_include'] });
    expect(report.status).toBe('MISSING_ACCESS');
    expect(report.checks.find((c) => c.id === 'tables')).toMatchObject({ status: 'fail' });
  });

  it('is DEGRADED when the user cannot run ATF through the CI/CD API', async () => {
    const report = await check({
      user: { sysId: 'u1', userName: 'beth', name: 'Beth', roles: ['itil'] },
    });
    expect(report.status).toBe('DEGRADED');
    expect(report.checks.find((c) => c.id === 'cicd-role')).toMatchObject({
      status: 'fail',
      action: expect.stringMatching(/sn_cicd\.sys_ci_automation/),
    });
  });

  it('is DEGRADED when ATF execution is disabled', async () => {
    const report = await check({ properties: { 'sn_atf.runner.enabled': 'false' } });
    expect(report.status).toBe('DEGRADED');
    expect(report.checks.find((c) => c.id === 'atf-enabled')?.action).toMatch(
      /Enable test\/test suite execution/,
    );
  });

  it('maps an unknown instance to INSTANCE_NOT_FOUND', async () => {
    const dnsFailure = async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    };
    const client = createSnowClient({
      instance: 'nope',
      tokens: staticTokens(),
      fetch: dnsFailure,
    });
    const report = await checkConnection(client, { requiredTables });
    expect(report.status).toBe('INSTANCE_NOT_FOUND');
    expect(report.action).toMatch(/instance name/);
  });
});
