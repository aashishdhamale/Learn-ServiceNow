import 'server-only';
import { getPrisma, type ScenarioProgress } from '@snow-mastery/db';

export async function progressByScenario(userId: string): Promise<Map<string, ScenarioProgress>> {
  const rows = await getPrisma().scenarioProgress.findMany({ where: { userId } });
  return new Map(rows.map((row) => [row.scenarioId, row]));
}

export function getProgress(userId: string, scenarioId: string) {
  return getPrisma().scenarioProgress.findUnique({
    where: { userId_scenarioId: { userId, scenarioId } },
  });
}

export async function revealNextHint(
  userId: string,
  scenarioId: string,
  totalHints: number,
): Promise<void> {
  const prisma = getPrisma();
  const current = await getProgress(userId, scenarioId);
  const next = Math.min(totalHints, (current?.hintsRevealed ?? 0) + 1);
  await prisma.scenarioProgress.upsert({
    where: { userId_scenarioId: { userId, scenarioId } },
    create: { userId, scenarioId, hintsRevealed: next, status: 'IN_PROGRESS' },
    update: { hintsRevealed: next },
  });
}
