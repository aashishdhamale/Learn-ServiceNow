import { describe, expect, it } from 'vitest';
import { runStructureLayer } from '../src';
import { fakePdi, fixedClock, fixtureRecords, vip } from './helpers';

describe('layer 1: structure', () => {
  it('passes the correct solution and captures both scripts, ignoring out-of-box ones', async () => {
    const { snow } = fakePdi('correct');
    const { result, captured } = await runStructureLayer(vip, snow, fixedClock);
    expect(result.status).toBe('PASSED');
    expect(result.findings.every((f) => f.passed)).toBe(true);
    expect([...captured.keys()]).toEqual(['ajaxInclude', 'onChangeScript']);
    expect(captured.get('onChangeScript')?.name).toBe('VIP caller alert');
    expect(captured.get('ajaxInclude')?.script).toContain('AbstractAjaxProcessor');
  });

  it('reports a missing Script Include with the scenario hint', async () => {
    const { snow } = fakePdi('empty');
    const { result, captured } = await runStructureLayer(vip, snow, fixedClock);
    expect(result.status).toBe('FAILED');
    expect(captured.size).toBe(0);
    const missing = result.findings.find((f) => f.checkId === 'ajax-script-include.exists');
    expect(missing).toMatchObject({ passed: false, fix: expect.stringContaining('VipCallerAjax') });
    expect(missing?.message).toContain('name = VipCallerAjax');
  });

  it('explains near misses: client scripts on the field that do not call the Script Include', async () => {
    const records = fixtureRecords('correct').filter((r) => r.fields.name !== 'VIP caller alert');
    const { snow, fake } = fakePdi('empty');
    fake.setRecords(records);
    const { result } = await runStructureLayer(vip, snow, fixedClock);
    const missing = result.findings.find(
      (f) => f.checkId === 'caller-onchange-client-script.exists',
    );
    expect(missing?.message).toMatch(/"Highlight VIP Caller"/);
    expect(missing?.message).toMatch(/none whose script mentions VipCallerAjax/);
  });

  it('fails expectations with expected/actual values and keeps UI Type as a warning only', async () => {
    const records = fixtureRecords('correct').map((r) =>
      r.fields.name === 'VipCallerAjax'
        ? { ...r, fields: { ...r.fields, client_callable: 'false' } }
        : r.fields.name === 'VIP caller alert'
          ? { ...r, fields: { ...r.fields, ui_type: '0' } }
          : r,
    );
    const { snow, fake } = fakePdi('empty');
    fake.setRecords(records);
    const { result } = await runStructureLayer(vip, snow, fixedClock);
    expect(result.status).toBe('FAILED');
    const callable = result.findings.find(
      (f) => f.checkId === 'ajax-script-include.client_callable',
    );
    expect(callable).toMatchObject({ passed: false, severity: 'error' });
    expect(callable?.message).toContain('expected "true", found "false"');
    expect(callable?.why).toMatch(/GlideAjax can only call/);
    const uiType = result.findings.find(
      (f) => f.checkId === 'caller-onchange-client-script.ui_type',
    );
    expect(uiType).toMatchObject({ passed: false, severity: 'warning' });
  });

  it('warns about duplicates and grades the active, most recently updated one', async () => {
    const records = fixtureRecords('correct');
    const include = records.find((r) => r.fields.name === 'VipCallerAjax')!;
    const older = {
      ...include,
      fields: {
        ...include.fields,
        sys_id: 'old',
        active: 'false',
        sys_updated_on: '2026-09-01 00:00:00',
      },
    };
    const { snow, fake } = fakePdi('empty');
    fake.setRecords([...records, older]);
    const { result, captured } = await runStructureLayer(vip, snow, fixedClock);
    expect(captured.get('ajaxInclude')?.sysId).toBe(include.fields.sys_id);
    expect(result.findings.find((f) => f.checkId === 'ajax-script-include.unique')).toMatchObject({
      severity: 'warning',
      passed: false,
    });
  });

  it('turns connection problems into an actionable ERROR', async () => {
    const { snow, fake } = fakePdi('correct');
    fake.mode = 'hibernating-redirect';
    const { result } = await runStructureLayer(vip, snow, fixedClock);
    expect(result.status).toBe('ERROR');
    expect(result.findings[0]).toMatchObject({
      title: 'Your PDI is asleep',
      fix: expect.stringMatching(/developer\.servicenow\.com/),
    });
  });
});
