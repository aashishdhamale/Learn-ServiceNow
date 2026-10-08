import 'server-only';
import { getPrisma, syncScenario } from '@snow-mastery/db';
import { getScenario, loadScenarios, type LoadedScenario } from '@snow-mastery/scenarios';

export { getScenario, loadScenarios };

/** Tables the Script Lab reads across all scenarios; the health check probes these. */
export function requiredTables(): string[] {
  return [...new Set(loadScenarios().flatMap((s) => s.structureChecks.map((c) => c.table)))].sort();
}

/** Makes sure the scenario's current version exists in the DB and returns its row id. */
export function ensureScenarioVersion(scenario: LoadedScenario): Promise<string> {
  return syncScenario(getPrisma(), scenario);
}
