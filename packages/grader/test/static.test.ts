import { describe, expect, it } from 'vitest';
import { runStaticLayer, runStructureLayer, type Finding } from '../src';
import { fakePdi, fixedClock, vip } from './helpers';

async function staticResultFor(variant: 'correct' | 'flawed') {
  const { snow } = fakePdi(variant);
  const { captured } = await runStructureLayer(vip, snow, fixedClock);
  return runStaticLayer(vip, captured, fixedClock);
}

const failing = (findings: Finding[]) => findings.filter((f) => !f.passed);

describe('layer 2: static rules', () => {
  it('passes the correct solution with no failing findings', async () => {
    const result = await staticResultFor('correct');
    expect(failing(result.findings)).toEqual([]);
    expect(result.status).toBe('PASSED');
    expect(result.summary).toMatch(/pass all \d+ checks/);
  });

  it('fails the flawed solution with clear, educational messages', async () => {
    const result = await staticResultFor('flawed');
    expect(result.status).toBe('FAILED');

    const byRule = (id: string) => failing(result.findings).filter((f) => f.checkId === id);

    const wait = byRule('no-getxmlwait');
    expect(wait).toHaveLength(1);
    expect(wait[0]).toMatchObject({
      severity: 'error',
      line: 9,
      snippet: 'ga.getXMLWait();',
      target: { alias: 'onChangeScript', name: 'VIP caller alert' },
    });
    expect(wait[0]!.why).toMatch(/freezes the browser/);
    expect(wait[0]!.fix).toMatch(/getXMLAnswer/);
    expect(wait[0]!.docsUrl).toMatch(/^https:\/\/www\.servicenow\.com\/docs\//);

    const glideRecord = byRule('no-gliderecord-client');
    expect(glideRecord.map((f) => f.line)).toEqual([14, 16]);
    expect(glideRecord[0]!.message).toBe(
      'new GlideRecord() runs a database query from the browser.',
    );
    expect(glideRecord[0]!.fix).toMatch(/Script Include/);

    expect(byRule('uses-getxmlanswer')[0]?.message).toBe(
      "The client script doesn't call getXMLAnswer().",
    );
    expect(byRule('clears-field-message')[0]?.severity).toBe('warning');
  });

  it('every failing finding explains why and how to fix it', async () => {
    const result = await staticResultFor('flawed');
    for (const finding of failing(result.findings)) {
      expect(finding.message.length, finding.checkId).toBeGreaterThan(10);
      expect(finding.why, finding.checkId).toBeTruthy();
    }
  });

  it('is BLOCKED when layer 1 captured nothing', () => {
    const result = runStaticLayer(vip, new Map(), fixedClock);
    expect(result.status).toBe('BLOCKED');
  });
});

describe('scenario rule references', () => {
  it('every scenario only references rules the grader knows', async () => {
    const { loadScenarios } = await import('@snow-mastery/scenarios');
    const { RULES } = await import('../src');
    for (const scenario of loadScenarios()) {
      for (const ref of scenario.staticRules)
        expect(RULES.has(ref.rule), `${scenario.id}: ${ref.rule}`).toBe(true);
      for (const id of scenario.disabledDefaultRules)
        expect(RULES.has(id), `${scenario.id}: ${id}`).toBe(true);
    }
  });
});
