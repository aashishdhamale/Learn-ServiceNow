// `pnpm scenarios:validate`: parse every scenario and its referenced files; exit 1 on problems.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadScenarios } from '../src';

try {
  const scenarios = loadScenarios();
  let problems = 0;
  for (const scenario of scenarios) {
    const files = [
      scenario.functional?.setupGuide,
      ...(scenario.functional?.scripts ?? []).map((s) => s.path),
    ];
    for (const file of files.filter((f): f is string => Boolean(f))) {
      if (!existsSync(join(scenario.sourceDir, file))) {
        console.error(`✖ ${scenario.id}: missing file ${file}`);
        problems++;
      }
    }
    console.log(
      `✔ ${scenario.id} v${scenario.version} (${scenario.module}, ${scenario.difficulty})`,
    );
  }
  if (problems > 0) process.exit(1);
  console.log(`${scenarios.length} scenario(s) valid.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
