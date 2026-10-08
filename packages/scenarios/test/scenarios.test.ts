import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getScenario,
  loadFixture,
  loadScenarioFile,
  loadScenarios,
  readScenarioFile,
  ScenarioValidationError,
} from '../src';

describe('scenario content', () => {
  it('loads every scenario in the repo without validation errors', () => {
    const scenarios = loadScenarios();
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it('every functional guide and ATF script exists', () => {
    for (const scenario of loadScenarios()) {
      if (!scenario.functional) continue;
      expect(readScenarioFile(scenario, scenario.functional.setupGuide)).toContain('#');
      for (const script of scenario.functional.scripts) {
        expect(readScenarioFile(scenario, script.path).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('vip-caller-alert', () => {
  const scenario = getScenario('vip-caller-alert');

  it('captures the Script Include and the client script for later layers', () => {
    expect(scenario?.structureChecks.map((c) => c.capture?.alias)).toEqual([
      'ajaxInclude',
      'onChangeScript',
    ]);
  });

  it('ships correct and flawed fixtures with scripts inlined', () => {
    const correct = loadFixture(scenario!, 'correct');
    const flawed = loadFixture(scenario!, 'flawed');
    const clientScript = (records: typeof correct.records) =>
      records.find((r) => r.table === 'sys_script_client' && r.fields.name === 'VIP caller alert');
    expect(clientScript(correct.records)?.fields.script).toContain('getXMLAnswer');
    expect(clientScript(flawed.records)?.fields.script).toContain('getXMLWait');
  });
});

describe('validation', () => {
  function writeScenario(yaml: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'scenario-'));
    mkdirSync(join(dir, 'x'));
    const file = join(dir, 'x', 'scenario.yaml');
    writeFileSync(file, yaml);
    return file;
  }

  const minimal = `
id: tiny
version: 1
title: Tiny
summary: s
module: PLATFORM
difficulty: beginner
releaseFamily: zurich
requirement: r
acceptanceCriteria: [a]
objectives: [{ id: platform.tiny, title: t, module: PLATFORM }]
structureChecks:
  - id: si
    title: t
    table: sys_script_include
    match: { name: Tiny }
    capture: { alias: tinyInclude, kind: server }
architectRubric: [{ id: one, criterion: c }]
`;

  it('accepts a minimal scenario and applies defaults', () => {
    const scenario = loadScenarioFile(writeScenario(minimal));
    expect(scenario.kind).toBe('SCRIPT_LAB');
    expect(scenario.structureChecks[0]?.capture?.scriptField).toBe('script');
    expect(scenario.staticRules).toEqual([]);
  });

  it('rejects static rules that target an alias nobody captures', () => {
    const file = writeScenario(
      `${minimal}staticRules:\n  - { rule: require-call, target: missing }\n`,
    );
    expect(() => loadScenarioFile(file)).toThrow(ScenarioValidationError);
    expect(() => loadScenarioFile(file)).toThrow(/unknown target "missing"/);
  });

  it('rejects encoded-query injection in match values', () => {
    const file = writeScenario(minimal.replace('{ name: Tiny }', "{ name: 'Tiny^ORactive=true' }"));
    expect(() => loadScenarioFile(file)).toThrow(/must not contain \^/);
  });

  it('refuses to read files outside the scenario directory', () => {
    const scenario = loadScenarioFile(writeScenario(minimal));
    expect(() => readScenarioFile(scenario, '../../etc/passwd')).toThrow(/escapes/);
  });
});
