import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { SnowHttp, type FetchLike } from './http';

/**
 * OAuth 2.0 authorization code flow (with PKCE) against a ServiceNow instance.
 * The learner registers the OAuth app in their own PDI, so client credentials are per learner.
 */
export interface OAuthClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope?: string;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.union([z.number(), z.string()]).transform(Number),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function createOAuthState(): string {
  return randomBytes(24).toString('base64url');
}

export function buildAuthorizeUrl(options: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: 'S256',
  });
  if (options.scope) params.set('scope', options.scope);
  return `${options.baseUrl}/oauth_auth.do?${params.toString()}`;
}

export async function exchangeAuthorizationCode(
  config: OAuthClientConfig,
  grant: { code: string; codeVerifier: string },
  now: () => Date = () => new Date(),
): Promise<TokenSet> {
  return requestTokens(
    config,
    {
      grant_type: 'authorization_code',
      code: grant.code,
      redirect_uri: config.redirectUri,
      code_verifier: grant.codeVerifier,
    },
    now,
  );
}

export async function refreshTokens(
  config: OAuthClientConfig,
  refreshToken: string,
  now: () => Date = () => new Date(),
): Promise<TokenSet> {
  const tokens = await requestTokens(
    config,
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    now,
  );
  // ServiceNow may not rotate the refresh token; keep the old one when none comes back.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

async function requestTokens(
  config: OAuthClientConfig,
  form: Record<string, string>,
  now: () => Date,
): Promise<TokenSet> {
  const http = new SnowHttp({
    baseUrl: config.baseUrl,
    fetch: config.fetch,
    timeoutMs: config.timeoutMs,
  });
  const response = await http.request({
    method: 'POST',
    path: '/oauth_token.do',
    form: { ...form, client_id: config.clientId, client_secret: config.clientSecret },
    schema: TokenResponse,
    auth: false,
    idempotent: false,
  });
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: new Date(now().getTime() + response.expires_in * 1000),
    scope: response.scope,
  };
}
