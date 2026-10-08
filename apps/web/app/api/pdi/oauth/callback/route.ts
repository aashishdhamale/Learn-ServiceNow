import { describeSnowError, exchangeAuthorizationCode } from '@snow-mastery/snow-client';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/server/current-user';
import { consumeOAuthSession } from '@/lib/server/oauth-session';
import { getConnection, oauthConfigFor, runHealthCheck, storeTokens } from '@/lib/server/pdi';

function settingsUrl(params: Record<string, string>): string {
  return `/settings?${new URLSearchParams(params).toString()}`;
}

/** The PDI redirects here after the learner approves (or denies) access. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verifier = await consumeOAuthSession(params.get('state'));
  if (params.get('error')) {
    redirect(
      settingsUrl({
        error: 'denied',
        detail: (params.get('error_description') ?? params.get('error')!).slice(0, 200),
      }),
    );
  }
  if (!verifier) redirect(settingsUrl({ error: 'state' }));

  const user = await getCurrentUser();
  const connection = await getConnection(user.id);
  const code = params.get('code');
  if (!connection || !code) redirect(settingsUrl({ error: 'no-connection' }));

  let failure: string | undefined;
  try {
    const tokens = await exchangeAuthorizationCode(oauthConfigFor(connection), {
      code,
      codeVerifier: verifier,
    });
    await storeTokens(connection.id, tokens);
  } catch (error) {
    const described = describeSnowError(error, connection.instanceName);
    failure = `${described.title}: ${described.message}`.slice(0, 200);
  }
  if (failure) redirect(settingsUrl({ error: 'exchange', detail: failure }));

  try {
    await runHealthCheck((await getConnection(user.id))!);
  } catch (error) {
    console.error('Health check after connecting failed', error);
  }
  redirect(settingsUrl({ connected: '1' }));
}
