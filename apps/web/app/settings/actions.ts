'use server';

import { normalizeInstanceName, SnowInvalidInstanceError } from '@snow-mastery/snow-client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/server/current-user';
import {
  disconnect,
  getConnection,
  runHealthCheck,
  saveConnectionSettings,
} from '@/lib/server/pdi';

export interface ConnectionFormState {
  errors?: Partial<
    Record<'instanceName' | 'clientId' | 'clientSecret' | 'oauthScope' | 'form', string>
  >;
  /** Set on success: the browser must do a full navigation to start OAuth. */
  redirectTo?: string;
}

const FormSchema = z.object({
  instanceName: z.string().trim().min(1, 'Enter your instance name.'),
  clientId: z.string().trim().min(1, 'Enter the OAuth client ID.').max(128),
  clientSecret: z.string().max(256).optional(),
  oauthScope: z
    .string()
    .trim()
    .max(200)
    .regex(/^[\w .:-]*$/, 'Use letters, numbers, spaces, dots, colons or dashes.')
    .optional(),
});

/** Saves the OAuth app details, then starts the OAuth flow. */
export async function saveConnectionAction(
  _previous: ConnectionFormState,
  formData: FormData,
): Promise<ConnectionFormState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: ConnectionFormState['errors'] = {};
    for (const issue of parsed.error.issues)
      errors[issue.path[0] as keyof typeof errors] ??= issue.message;
    return { errors };
  }

  let instanceName: string;
  try {
    instanceName = normalizeInstanceName(parsed.data.instanceName);
  } catch (error) {
    if (error instanceof SnowInvalidInstanceError) {
      return { errors: { instanceName: 'Use just the instance name, e.g. dev12345.' } };
    }
    throw error;
  }

  const user = await getCurrentUser();
  const existing = await getConnection(user.id);
  if (!parsed.data.clientSecret && !existing) {
    return { errors: { clientSecret: 'Enter the OAuth client secret.' } };
  }
  await saveConnectionSettings(user.id, {
    instanceName,
    clientId: parsed.data.clientId,
    clientSecret: parsed.data.clientSecret || undefined,
    oauthScope: parsed.data.oauthScope || undefined,
  });
  // Not redirect(): the OAuth hop leaves the app, so the browser must navigate for real.
  return { redirectTo: '/api/pdi/oauth/start' };
}

export async function healthCheckAction(): Promise<void> {
  const user = await getCurrentUser();
  const connection = await getConnection(user.id);
  if (connection) await runHealthCheck(connection);
  revalidatePath('/', 'layout');
}

export async function disconnectAction(): Promise<void> {
  const user = await getCurrentUser();
  await disconnect(user.id);
  revalidatePath('/', 'layout');
  redirect('/settings');
}
