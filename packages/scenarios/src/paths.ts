import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Walks up from `start` to the directory containing pnpm-workspace.yaml. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find the repo root (pnpm-workspace.yaml) above ${start}`);
    }
    dir = parent;
  }
}

/** Directory holding scenario content. SCENARIOS_DIR overrides it (used by tests). */
export function scenariosContentDir(): string {
  return process.env.SCENARIOS_DIR ?? join(findRepoRoot(), 'packages', 'scenarios', 'content');
}
