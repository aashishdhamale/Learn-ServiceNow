import { buildAuthorizeUrl, createOAuthState, createPkcePair } from '@snow-mastery/snow-client';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/current-user';
import { saveOAuthSession } from '@/lib/server/oauth-session';
import { getConnection, oauthConfigFor } from '@/lib/server/pdi';

/** Sends the learner to their PDI to approve access (OAuth authorization code + PKCE). */
export async function GET() {
  const user = await getCurrentUser();
  const connection = await getConnection(user.id);
  if (!connection) redirect('/settings?error=no-connection');

  const config = oauthConfigFor(connection);
  const state = createOAuthState();
  const pkce = createPkcePair();
  await saveOAuthSession(state, pkce.verifier);
  redirect(
    buildAuthorizeUrl({
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      codeChallenge: pkce.challenge,
      scope: connection.oauthScope ?? undefined,
    }),
  );
}
