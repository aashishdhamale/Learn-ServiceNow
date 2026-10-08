import { getScenario, loadFixture, type LoadedScenario } from '@snow-mastery/scenarios';
import { createSnowClient } from '@snow-mastery/snow-client';
import {
  FakeInstance,
  recordingSleep,
  staticTokens,
  type FakeInstanceOptions,
} from '@snow-mastery/snow-client/testing';
import { parseScript } from '../src';
import type { ParsedScript } from '../src/static/rule';
import type { CapturedScript, Clock } from '../src/types';

export const vip = getScenario('vip-caller-alert') as LoadedScenario;

export const fixedClock: Clock = {
  now: () => new Date('2026-10-08T12:00:00Z'),
  sleep: async () => undefined,
};

/** A fake PDI pre-loaded with one of the scenario's fixture variants. */
export function fakePdi(
  variant: 'correct' | 'flawed' | 'empty',
  options: FakeInstanceOptions = {},
) {
  const records = variant === 'empty' ? [] : loadFixture(vip, variant).records;
  const fake = new FakeInstance({ records, ...options });
  const snow = createSnowClient({
    instance: 'dev1',
    tokens: staticTokens(),
    fetch: fake.fetch,
    sleep: recordingSleep().sleep,
  });
  return { fake, snow };
}

export function fixtureRecords(variant: 'correct' | 'flawed') {
  return loadFixture(vip, variant).records;
}

export function parsed(script: string, overrides: Partial<CapturedScript> = {}): ParsedScript {
  const outcome = parseScript(script);
  if (!outcome.ok) throw new Error(outcome.message);
  return {
    alias: 'subject',
    checkId: 'test',
    kind: 'server',
    table: 'sys_script_include',
    sysId: 'x',
    name: 'Subject',
    script,
    record: {},
    ...overrides,
    ast: outcome.ast,
  };
}
