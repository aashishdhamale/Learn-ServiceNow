import 'server-only';
import { getPrisma } from '@snow-mastery/db';
import { loadScenarios, type LoadedScenario, type Module } from '@snow-mastery/scenarios';
import { progressByScenario } from './progress';

export interface ModuleProgress {
  module: Module;
  completed: number;
  total: number;
  scenarios: Array<{
    scenario: LoadedScenario;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  }>;
}

export async function dashboardData(userId: string) {
  const prisma = getPrisma();
  const scenarios = loadScenarios();
  const [progress, attemptCount, recent] = await Promise.all([
    progressByScenario(userId),
    prisma.attempt.count({ where: { userId } }),
    prisma.attempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { scenarioVersion: { include: { scenario: true } } },
    }),
  ]);

  const modules = new Map<Module, ModuleProgress>();
  for (const scenario of scenarios) {
    const entry = modules.get(scenario.module) ?? {
      module: scenario.module,
      completed: 0,
      total: 0,
      scenarios: [],
    };
    const status = progress.get(scenario.id)?.status ?? 'NOT_STARTED';
    entry.total++;
    if (status === 'COMPLETED') entry.completed++;
    entry.scenarios.push({ scenario, status });
    modules.set(scenario.module, entry);
  }
  const all = [...modules.values()].flatMap((m) => m.scenarios);
  return {
    totals: {
      scenarios: scenarios.length,
      completed: all.filter((s) => s.status === 'COMPLETED').length,
      inProgress: all.filter((s) => s.status === 'IN_PROGRESS').length,
      attempts: attemptCount,
    },
    modules: [...modules.values()],
    nextUp:
      all.find((s) => s.status === 'IN_PROGRESS') ?? all.find((s) => s.status === 'NOT_STARTED'),
    recent: recent.map((attempt) => ({
      id: attempt.id,
      status: attempt.status,
      createdAt: attempt.createdAt,
      scenarioId: attempt.scenarioVersion.scenarioId,
      scenarioTitle: attempt.scenarioVersion.scenario.title,
    })),
  };
}
