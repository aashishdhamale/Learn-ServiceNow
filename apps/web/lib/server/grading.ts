import 'server-only';
import { aiConfigFromEnv, createArchitectReviewer } from '@snow-mastery/ai';
import {
  getPrisma,
  type PdiConnection,
  type Prisma,
  type Severity as DbSeverity,
} from '@snow-mastery/db';
import { gradeAttempt, LAYERS, type Finding, type LayerResult } from '@snow-mastery/grader';
import { ScenarioSchema, type LoadedScenario } from '@snow-mastery/scenarios';
import { describeSnowError } from '@snow-mastery/snow-client';
import type { AttemptStatus, AttemptView } from '../attempt-view';
import { serverEnv } from './env';
import { getConnection, runHealthCheck, snowClientFor, storedHealth } from './pdi';
import { ensureScenarioVersion } from './scenarios';

export class NotConnectedError extends Error {
  constructor() {
    super('Connect your PDI on the Settings page first.');
  }
}

const SEVERITY: Record<Finding['severity'], DbSeverity> = {
  error: 'ERROR',
  warning: 'WARNING',
  info: 'INFO',
};
const IN_FLIGHT: AttemptStatus[] = ['QUEUED', 'RUNNING'];

/**
 * Creates an attempt with four pending layers. The caller schedules runAttempt() in the
 * background. Returns the existing attempt if one is still running for this scenario.
 */
export async function createAttempt(
  userId: string,
  scenario: LoadedScenario,
): Promise<{ id: string; created: boolean }> {
  const prisma = getPrisma();
  const connection = await getConnection(userId);
  if (!connection || connection.status !== 'CONNECTED') throw new NotConnectedError();

  const scenarioVersionId = await ensureScenarioVersion(scenario);
  const running = await prisma.attempt.findFirst({
    where: { userId, scenarioVersion: { scenarioId: scenario.id }, status: { in: IN_FLIGHT } },
    orderBy: { createdAt: 'desc' },
  });
  if (running && !isStale(running.createdAt)) return { id: running.id, created: false };

  const progress = await prisma.scenarioProgress.findUnique({
    where: { userId_scenarioId: { userId, scenarioId: scenario.id } },
  });
  const attempt = await prisma.attempt.create({
    data: {
      userId,
      scenarioVersionId,
      instanceName: connection.instanceName,
      hintsRevealed: progress?.hintsRevealed ?? 0,
      layers: { create: LAYERS.map((layer) => ({ layer })) },
    },
  });
  await prisma.scenarioProgress.upsert({
    where: { userId_scenarioId: { userId, scenarioId: scenario.id } },
    create: {
      userId,
      scenarioId: scenario.id,
      status: 'IN_PROGRESS',
      attemptsCount: 1,
      lastAttemptAt: attempt.createdAt,
    },
    update: {
      attemptsCount: { increment: 1 },
      lastAttemptAt: attempt.createdAt,
      ...(progress?.status === 'COMPLETED' ? {} : { status: 'IN_PROGRESS' as const }),
    },
  });
  return { id: attempt.id, created: true };
}

/** Grades an attempt, persisting each layer as it completes. Never throws. */
export async function runAttempt(attemptId: string): Promise<void> {
  const prisma = getPrisma();
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { scenarioVersion: true },
  });
  try {
    const connection = await getConnection(attempt.userId);
    if (!connection) throw new NotConnectedError();
    // Grade against the exact version snapshot the attempt was created for.
    const scenario = ScenarioSchema.parse(attempt.scenarioVersion.definition);
    await prisma.attempt.update({
      where: { id: attemptId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const report = await gradeAttempt({
      scenario,
      snow: snowClientFor(connection),
      reviewer: createArchitectReviewer(aiConfigFromEnv()),
      functional: { timeoutMs: serverEnv().ATF_TIMEOUT_MS },
      hooks: {
        onLayerStart: async (layer) => {
          await prisma.layerResult.update({
            where: { attemptId_layer: { attemptId, layer } },
            data: { status: 'RUNNING', startedAt: new Date() },
          });
        },
        onLayerComplete: (result) => saveLayer(attemptId, result),
      },
    });

    const finishedAt = new Date();
    // A deterministic layer that could not run means "not graded", not "failed".
    const broken = report.layers.find((l) => l.layer !== 'REVIEW' && l.status === 'ERROR');
    const problem = broken?.findings.find((f) => !f.passed);
    await prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: report.passed ? 'PASSED' : broken ? 'ERROR' : 'FAILED',
        errorMessage: problem ? [problem.title, problem.fix].filter(Boolean).join('. ') : undefined,
        finishedAt,
      },
    });
    if (report.passed)
      await markCompleted(attempt.userId, attempt.scenarioVersion.scenarioId, finishedAt);
    await refreshHealthIfStale(connection, report.layers[0]?.status === 'ERROR');
  } catch (error) {
    console.error(`Grading attempt ${attemptId} failed`, error);
    const described = describeSnowError(error, attempt.instanceName);
    await failAttempt(attemptId, `${described.title}. ${described.action}`);
  }
}

/**
 * Keeps the connection badge honest: re-check health when grading hit a connection error,
 * or when the stored report still shows a problem that grading just proved is gone.
 */
async function refreshHealthIfStale(
  connection: PdiConnection,
  connectionFailed: boolean,
): Promise<void> {
  const status = storedHealth(connection)?.status;
  if (!connectionFailed && (status === 'OK' || status === 'DEGRADED')) return;
  await runHealthCheck(connection).catch((error) =>
    console.error('Health check after grading failed', error),
  );
}

async function saveLayer(attemptId: string, result: LayerResult): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const layer = await tx.layerResult.update({
      where: { attemptId_layer: { attemptId, layer: result.layer } },
      data: {
        status: result.status,
        summary: result.summary,
        details: (result.details ?? undefined) as Prisma.InputJsonValue | undefined,
        startedAt: new Date(result.startedAt),
        finishedAt: new Date(result.finishedAt),
      },
    });
    await tx.finding.deleteMany({ where: { layerResultId: layer.id } });
    await tx.finding.createMany({
      data: result.findings.map((finding, position) => ({
        layerResultId: layer.id,
        position,
        checkId: finding.checkId,
        severity: SEVERITY[finding.severity],
        passed: finding.passed,
        title: finding.title,
        message: finding.message,
        why: finding.why,
        fix: finding.fix,
        docsUrl: finding.docsUrl,
        targetAlias: finding.target?.alias,
        targetTable: finding.target?.table,
        targetSysId: finding.target?.sysId,
        targetName: finding.target?.name,
        line: finding.line,
        column: finding.column,
        snippet: finding.snippet,
      })),
    });
  });
}

async function markCompleted(userId: string, scenarioId: string, at: Date): Promise<void> {
  const prisma = getPrisma();
  const progress = await prisma.scenarioProgress.findUniqueOrThrow({
    where: { userId_scenarioId: { userId, scenarioId } },
  });
  await prisma.scenarioProgress.update({
    where: { userId_scenarioId: { userId, scenarioId } },
    data: { status: 'COMPLETED', firstPassedAt: progress.firstPassedAt ?? at },
  });
}

async function failAttempt(attemptId: string, message: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { status: 'ERROR', errorMessage: message, finishedAt: new Date() },
  });
  await prisma.layerResult.updateMany({
    where: { attemptId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'ERROR', summary: 'Not run.' },
  });
}

/** An attempt still "running" long after the ATF timeout was orphaned by a server restart. */
function isStale(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > serverEnv().ATF_TIMEOUT_MS + 5 * 60_000;
}

export async function getAttemptView(
  userId: string,
  attemptId: string,
): Promise<AttemptView | null> {
  const prisma = getPrisma();
  let attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      scenarioVersion: { include: { scenario: true } },
      layers: { include: { findings: { orderBy: { position: 'asc' } } } },
    },
  });
  if (!attempt) return null;
  if (IN_FLIGHT.includes(attempt.status) && isStale(attempt.createdAt)) {
    await failAttempt(
      attemptId,
      'Grading was interrupted (the server restarted). Check your work again.',
    );
    return getAttemptView(userId, attemptId);
  }
  const order = new Map(LAYERS.map((layer, i) => [layer, i]));
  attempt = {
    ...attempt,
    layers: [...attempt.layers].sort((a, b) => order.get(a.layer)! - order.get(b.layer)!),
  };
  return {
    id: attempt.id,
    scenarioId: attempt.scenarioVersion.scenarioId,
    scenarioTitle: attempt.scenarioVersion.scenario.title,
    scenarioVersion: attempt.scenarioVersion.version,
    instanceName: attempt.instanceName,
    status: attempt.status,
    errorMessage: attempt.errorMessage,
    createdAt: attempt.createdAt.toISOString(),
    finishedAt: attempt.finishedAt?.toISOString() ?? null,
    layers: attempt.layers.map((layer) => ({
      layer: layer.layer,
      status: layer.status,
      summary: layer.summary,
      details: layer.details,
      startedAt: layer.startedAt?.toISOString() ?? null,
      finishedAt: layer.finishedAt?.toISOString() ?? null,
      findings: layer.findings.map((f) => ({
        checkId: f.checkId,
        severity: f.severity.toLowerCase() as Finding['severity'],
        passed: f.passed,
        title: f.title,
        message: f.message,
        why: f.why ?? undefined,
        fix: f.fix ?? undefined,
        docsUrl: f.docsUrl ?? undefined,
        target:
          f.targetAlias || f.targetName
            ? {
                alias: f.targetAlias ?? undefined,
                table: f.targetTable ?? undefined,
                sysId: f.targetSysId ?? undefined,
                name: f.targetName ?? undefined,
              }
            : undefined,
        line: f.line ?? undefined,
        column: f.column ?? undefined,
        snippet: f.snippet ?? undefined,
      })),
    })),
  };
}

export function recentAttempts(userId: string, scenarioId: string, take = 5) {
  return getPrisma().attempt.findMany({
    where: { userId, scenarioVersion: { scenarioId } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, status: true, createdAt: true, finishedAt: true },
  });
}
