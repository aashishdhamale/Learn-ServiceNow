import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from './env';
import { seal, unseal } from './secrets';

/**
 * The OAuth state and PKCE verifier live in a short-lived, encrypted, httpOnly cookie
 * between /api/pdi/oauth/start and the callback.
 */
const COOKIE = 'pdi_oauth';
const MAX_AGE_SECONDS = 600;

interface OAuthSession {
  state: string;
  verifier: string;
  createdAt: number;
}

export async function saveOAuthSession(state: string, verifier: string): Promise<void> {
  const value = seal(
    JSON.stringify({ state, verifier, createdAt: Date.now() } satisfies OAuthSession),
  );
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    // Lax: the callback is a top-level redirect from the instance, which still sends the cookie.
    sameSite: 'lax',
    secure: serverEnv().APP_URL.startsWith('https://'),
    path: '/api/pdi/oauth',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Returns the PKCE verifier if `state` matches the stored session; always clears the cookie. */
export async function consumeOAuthSession(state: string | null): Promise<string | undefined> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  store.delete({ name: COOKIE, path: '/api/pdi/oauth' });
  if (!raw || !state) return undefined;
  let session: OAuthSession;
  try {
    session = JSON.parse(unseal(raw)) as OAuthSession;
  } catch {
    return undefined;
  }
  if (Date.now() - session.createdAt > MAX_AGE_SECONDS * 1000) return undefined;
  const expected = Buffer.from(session.state);
  const actual = Buffer.from(state);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  return session.verifier;
}
