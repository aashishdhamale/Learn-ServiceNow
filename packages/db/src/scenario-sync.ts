import { createHash } from 'node:crypto';
import type { LoadedScenario, Scenario } from '@snow-mastery/scenarios';
import type { Difficulty, PrismaClient } from './generated/prisma/client';

export class ScenarioVersionConflictError extends Error {
  constructor(scenarioId: string, version: number) {
    super(
      `Scenario "${scenarioId}" changed but is still version ${version}, which already has ` +
        `attempts. Bump "version" in its scenario.yaml so past attempts keep their original definition.`,
    );
    this.name = 'ScenarioVersionConflictError';
  }
}

/** The definition stored per version: everything except where it was loaded from. */
export function scenarioDefinition(scenario: LoadedScenario): Scenario {
  const { sourceDir: _sourceDir, ...definition } = scenario;
  return definition;
}

export function scenarioContentHash(definition: Scenario): string {
  return createHash('sha256').update(canonicalJson(definition)).digest('hex');
}

/**
 * Upserts a scenario, its objectives and its current version.
 * Returns the id of the ScenarioVersion row that attempts should reference.
 */
export async function syncScenario(
  prisma: PrismaClient,
  scenario: LoadedScenario,
): Promise<string> {
  const definition = scenarioDefinition(scenario);
  const contentHash = scenarioContentHash(definition);
  const scenarioFields = {
    module: scenario.module,
    title: scenario.title,
    difficulty: scenario.difficulty.toUpperCase() as Difficulty,
    releaseFamily: scenario.releaseFamily,
    currentVersion: scenario.version,
  };

  return prisma.$transaction(async (tx) => {
    for (const objective of scenario.objectives) {
      await tx.learningObjective.upsert({
        where: { id: objective.id },
        create: objective,
        update: { title: objective.title, module: objective.module },
      });
    }
    await tx.scenario.upsert({
      where: { id: scenario.id },
      create: { id: scenario.id, ...scenarioFields },
      update: scenarioFields,
    });
    const objectiveIds = scenario.objectives.map((o) => o.id);
    await tx.scenarioObjective.deleteMany({
      where: { scenarioId: scenario.id, objectiveId: { notIn: objectiveIds } },
    });
    await tx.scenarioObjective.createMany({
      data: objectiveIds.map((objectiveId) => ({ scenarioId: scenario.id, objectiveId })),
      skipDuplicates: true,
    });

    const existing = await tx.scenarioVersion.findUnique({
      where: { scenarioId_version: { scenarioId: scenario.id, version: scenario.version } },
      include: { _count: { select: { attempts: true } } },
    });
    if (!existing) {
      const created = await tx.scenarioVersion.create({
        data: {
          scenarioId: scenario.id,
          version: scenario.version,
          contentHash,
          definition: definition as object,
        },
      });
      return created.id;
    }
    if (existing.contentHash !== contentHash) {
      if (existing._count.attempts > 0) {
        throw new ScenarioVersionConflictError(scenario.id, scenario.version);
      }
      await tx.scenarioVersion.update({
        where: { id: existing.id },
        data: { contentHash, definition: definition as object },
      });
    }
    return existing.id;
  });
}

/** JSON with object keys sorted, so the hash only changes when content does. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
