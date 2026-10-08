'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/server/current-user';
import { createAttempt, NotConnectedError, runAttempt } from '@/lib/server/grading';
import { revealNextHint } from '@/lib/server/progress';
import { getScenario } from '@/lib/server/scenarios';

export interface CheckWorkState {
  error?: string;
}

/** "Check my work": create an attempt, grade it in the background, show its results page. */
export async function checkWorkAction(
  scenarioId: string,
  _previous: CheckWorkState,
): Promise<CheckWorkState> {
  const scenario = getScenario(scenarioId);
  if (!scenario) return { error: 'Unknown scenario.' };
  const user = await getCurrentUser();
  let attempt: { id: string; created: boolean };
  try {
    attempt = await createAttempt(user.id, scenario);
  } catch (error) {
    if (error instanceof NotConnectedError) return { error: error.message };
    throw error;
  }
  if (attempt.created) after(() => runAttempt(attempt.id));
  redirect(`/lab/${scenarioId}/attempts/${attempt.id}`);
}

export async function revealHintAction(scenarioId: string): Promise<void> {
  const scenario = getScenario(scenarioId);
  if (!scenario) return;
  const user = await getCurrentUser();
  await revealNextHint(user.id, scenarioId, scenario.hints.length);
  revalidatePath(`/lab/${scenarioId}`);
}
