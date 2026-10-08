import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { LoadedScenario } from './schema';

/**
 * Fixture records mimic what the ServiceNow Table API returns for a learner's instance.
 * They power grader unit tests and the e2e mock ServiceNow server.
 */
const FixtureFileSchema = z.object({
  description: z.string().optional(),
  records: z.array(
    z.object({
      table: z.string(),
      fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()]).transform(String)),
      /** field name → script file (relative to the fixture directory) */
      scripts: z.record(z.string(), z.string()).default({}),
    }),
  ),
});

export interface FixtureRecord {
  table: string;
  fields: Record<string, string>;
}

export interface ScenarioFixture {
  variant: string;
  description?: string;
  records: FixtureRecord[];
}

export function fixtureExists(scenario: LoadedScenario, variant: string): boolean {
  return existsSync(join(scenario.sourceDir, 'fixtures', variant, 'records.yaml'));
}

export function loadFixture(scenario: LoadedScenario, variant: string): ScenarioFixture {
  const dir = join(scenario.sourceDir, 'fixtures', variant);
  const parsed = FixtureFileSchema.parse(parseYaml(readFileSync(join(dir, 'records.yaml'), 'utf8')));
  return {
    variant,
    description: parsed.description,
    records: parsed.records.map((record) => {
      const fields = { ...record.fields };
      for (const [field, file] of Object.entries(record.scripts)) {
        fields[field] = readFileSync(join(dir, file), 'utf8');
      }
      return { table: record.table, fields };
    }),
  };
}
