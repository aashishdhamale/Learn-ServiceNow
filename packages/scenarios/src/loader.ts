import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { scenariosContentDir } from './paths';
import { ScenarioSchema, type LoadedScenario } from './schema';

const SCENARIO_FILE = 'scenario.yaml';

export class ScenarioValidationError extends Error {
  constructor(
    readonly file: string,
    readonly issues: string[],
  ) {
    super(`Invalid scenario ${file}:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ScenarioValidationError';
  }
}

/** Parses and validates one scenario.yaml. */
export function loadScenarioFile(file: string): LoadedScenario {
  const raw: unknown = parseYaml(readFileSync(file, 'utf8'));
  const result = ScenarioSchema.safeParse(raw);
  if (!result.success) {
    throw new ScenarioValidationError(
      file,
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return { ...result.data, sourceDir: resolve(file, '..') };
}

let cache: LoadedScenario[] | undefined;

/**
 * Loads every scenario under the content directory, sorted by module then title.
 * Cached in production; re-read on each call in development so edits show up live.
 */
export function loadScenarios(contentDir = scenariosContentDir()): LoadedScenario[] {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  const scenarios = findScenarioFiles(contentDir).map(loadScenarioFile);
  assertUniqueIds(scenarios);
  scenarios.sort((a, b) => a.module.localeCompare(b.module) || a.title.localeCompare(b.title));
  cache = scenarios;
  return scenarios;
}

export function getScenario(id: string, contentDir?: string): LoadedScenario | undefined {
  return loadScenarios(contentDir).find((s) => s.id === id);
}

/** Reads a file that belongs to a scenario (e.g. its ATF setup guide), refusing paths outside it. */
export function readScenarioFile(scenario: LoadedScenario, relativePath: string): string {
  const target = resolve(scenario.sourceDir, relativePath);
  if (relative(scenario.sourceDir, target).startsWith('..') || target === scenario.sourceDir) {
    throw new Error(`Path escapes scenario directory: ${relativePath}`);
  }
  return readFileSync(target, 'utf8');
}

function findScenarioFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'fixtures' || entry === 'atf') continue;
      files.push(...findScenarioFiles(path));
    } else if (entry === SCENARIO_FILE) {
      files.push(path);
    }
  }
  return files.sort((a, b) => a.split(sep).length - b.split(sep).length || a.localeCompare(b));
}

function assertUniqueIds(scenarios: LoadedScenario[]) {
  const seen = new Map<string, string>();
  for (const s of scenarios) {
    const other = seen.get(s.id);
    if (other) throw new Error(`Duplicate scenario id "${s.id}" in ${other} and ${s.sourceDir}`);
    seen.set(s.id, s.sourceDir);
  }
}
