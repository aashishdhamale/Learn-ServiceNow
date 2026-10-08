import type { Scenario, StructureCheck } from '@snow-mastery/scenarios';
import {
  describeSnowError,
  encodedQuery,
  isSnowError,
  type SnowRecord,
} from '@snow-mastery/snow-client';
import { LayerRecorder, plural } from './layer-result';
import type { CapturedScript, Clock, GraderSnow, LayerResult } from './types';

export interface StructureOutcome {
  result: LayerResult;
  captured: Map<string, CapturedScript>;
}

const MAX_CANDIDATES = 20;

/** Layer 1: confirm the learner's records exist and are configured as the scenario requires. */
export async function runStructureLayer(
  scenario: Scenario,
  snow: GraderSnow,
  clock: Pick<Clock, 'now'>,
): Promise<StructureOutcome> {
  const recorder = new LayerRecorder('STRUCTURE', clock);
  const captured = new Map<string, CapturedScript>();

  try {
    for (const check of scenario.structureChecks) {
      const record = await findRecord(check, snow, recorder);
      if (!record) continue;
      checkExpectations(check, record, recorder);
      if (check.capture) {
        captured.set(check.capture.alias, {
          alias: check.capture.alias,
          checkId: check.id,
          kind: check.capture.kind,
          table: check.table,
          sysId: record.sys_id ?? '',
          name: record.name ?? '',
          script: record[check.capture.scriptField] ?? '',
          record,
        });
      }
    }
  } catch (error) {
    if (!isSnowError(error)) throw error;
    const described = describeSnowError(error, snow.instance);
    recorder.add({
      checkId: 'structure.connection',
      severity: 'error',
      passed: false,
      title: described.title,
      message: described.message,
      fix: described.action,
    });
    return { result: recorder.finish('ERROR', described.title), captured };
  }

  const failures = recorder.blockingFailures.length;
  const warnings = recorder.warnings.length;
  const status = failures > 0 ? 'FAILED' : 'PASSED';
  const summary =
    failures > 0
      ? `${plural(failures, 'problem')} with your configuration.`
      : `All ${plural(scenario.structureChecks.length, 'artifact')} found and configured${
          warnings ? `, with ${plural(warnings, 'warning')}` : ''
        }.`;
  return { result: recorder.finish(status, summary), captured };
}

async function findRecord(
  check: StructureCheck,
  snow: GraderSnow,
  recorder: LayerRecorder,
): Promise<SnowRecord | undefined> {
  const scriptField = check.capture?.scriptField ?? 'script';
  const matchConditions = Object.entries(check.match).map(([field, value]) => ({ field, value }));
  const containsConditions = check.scriptContains.map((value) => ({
    field: scriptField,
    operator: 'LIKE' as const,
    value,
  }));
  const fields = [
    ...new Set([
      'sys_id',
      'name',
      'sys_updated_on',
      ...Object.keys(check.match),
      ...check.expect.map((e) => e.field),
      ...(check.capture ? [scriptField] : []),
    ]),
  ];

  const rows = await snow.table.list(check.table, {
    query: encodedQuery([...matchConditions, ...containsConditions], {
      orderByDesc: 'sys_updated_on',
    }),
    fields,
    limit: MAX_CANDIDATES,
  });

  if (rows.length === 0) {
    recorder.add({
      checkId: `${check.id}.exists`,
      severity: 'error',
      passed: false,
      title: check.title,
      message: `No matching record in ${check.table}${describeMatch(check)}.${await nearMisses(check, snow, matchConditions)}`,
      fix: check.notFoundHint,
    });
    return undefined;
  }

  // Prefer active records; the query already sorted newest first.
  const record = rows.find((r) => r.active === 'true') ?? rows[0]!;
  recorder.add({
    checkId: `${check.id}.exists`,
    severity: 'error',
    passed: true,
    title: check.title,
    message: `Found "${record.name || record.sys_id}".`,
    target: targetOf(check, record),
  });
  if (rows.length > 1) {
    recorder.add({
      checkId: `${check.id}.unique`,
      severity: 'warning',
      passed: false,
      title: 'More than one candidate',
      message: `${rows.length} records match; graded "${record.name}" (updated ${record.sys_updated_on}).`,
      why: 'Duplicate scripts make behaviour depend on load order and confuse whoever maintains this next.',
      fix: 'Deactivate or delete the extra copies.',
      target: targetOf(check, record),
    });
  }
  return record;
}

/** Explains why nothing matched by listing records that match everything but scriptContains. */
async function nearMisses(
  check: StructureCheck,
  snow: GraderSnow,
  matchConditions: Array<{ field: string; value: string }>,
): Promise<string> {
  if (check.scriptContains.length === 0) return '';
  const rows = await snow.table.list(check.table, {
    query: encodedQuery(matchConditions),
    fields: ['sys_id', 'name'],
    limit: 5,
  });
  if (rows.length === 0) return '';
  const names = rows.map((r) => `"${r.name || r.sys_id}"`).join(', ');
  return ` Found ${plural(rows.length, 'record')} with the right settings (${names}), but none whose script mentions ${check.scriptContains.join(', ')}.`;
}

function checkExpectations(check: StructureCheck, record: SnowRecord, recorder: LayerRecorder) {
  for (const expectation of check.expect) {
    const actual = record[expectation.field] ?? '';
    const passed = actual === expectation.equals;
    recorder.add({
      checkId: `${check.id}.${expectation.field}`,
      severity: expectation.severity,
      passed,
      title: `${check.title}: ${expectation.field}`,
      message: passed
        ? `${expectation.field} is ${display(actual)}.`
        : `${expectation.message} (expected ${display(expectation.equals)}, found ${display(actual)}).`,
      why: passed ? undefined : expectation.why,
      target: targetOf(check, record),
    });
  }
}

function describeMatch(check: StructureCheck): string {
  const parts = Object.entries(check.match).map(([field, value]) => `${field} = ${value}`);
  if (check.scriptContains.length) parts.push(`script mentions ${check.scriptContains.join(', ')}`);
  return parts.length ? ` where ${parts.join(', ')}` : '';
}

function display(value: string): string {
  return value === '' ? 'empty' : `"${value}"`;
}

function targetOf(check: StructureCheck, record: SnowRecord) {
  return {
    alias: check.capture?.alias,
    table: check.table,
    sysId: record.sys_id,
    name: record.name,
  };
}
