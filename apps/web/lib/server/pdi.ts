import 'server-only';
import { getPrisma, Prisma, type PdiConnection } from '@snow-mastery/db';
import {
  checkConnection,
  createSnowClient,
  instanceBaseUrl,
  refreshTokens,
  SnowAuthError,
  SnowOAuthError,
  type HealthReport,
  type OAuthClientConfig,
  type SnowClient,
  type TokenProvider,
  type TokenSet,
} from '@snow-mastery/snow-client';
import { oauthRedirectUri, serverEnv } from './env';
import { requiredTables } from './scenarios';
import { seal, unseal } from './secrets';

/** Refresh access tokens this long before they expire. */
const REFRESH_MARGIN_MS = 60_000;

export function getConnection(userId: string): Promise<PdiConnection | null> {
  return getPrisma().pdiConnection.findUnique({ where: { userId } });
}

export interface ConnectionSettings {
  instanceName: string;
  clientId: string;
  /** Omit to keep the stored secret. */
  clientSecret?: string;
  oauthScope?: string;
}

/** Saves OAuth app details. Changing the instance or client invalidates existing tokens. */
export async function saveConnectionSettings(
  userId: string,
  settings: ConnectionSettings,
): Promise<PdiConnection> {
  const prisma = getPrisma();
  const existing = await getConnection(userId);
  const clientSecretEnc = settings.clientSecret
    ? seal(settings.clientSecret)
    : existing?.clientSecretEnc;
  if (!clientSecretEnc) throw new Error('A client secret is required.');

  const credentialsChanged =
    !existing ||
    existing.instanceName !== settings.instanceName ||
    existing.clientId !== settings.clientId;
  const fields = {
    instanceName: settings.instanceName,
    clientId: settings.clientId,
    clientSecretEnc,
    oauthScope: settings.oauthScope || null,
  };
  const reset = {
    accessTokenEnc: null,
    refreshTokenEnc: null,
    accessTokenExpiresAt: null,
    status: 'PENDING' as const,
    lastHealth: Prisma.DbNull,
    lastHealthAt: null,
  };
  return prisma.pdiConnection.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: credentialsChanged || settings.clientSecret ? { ...fields, ...reset } : fields,
  });
}

export async function disconnect(userId: string): Promise<void> {
  await getPrisma().pdiConnection.deleteMany({ where: { userId } });
}

export function oauthConfigFor(connection: PdiConnection): OAuthClientConfig {
  const env = serverEnv();
  return {
    baseUrl: instanceBaseUrl(connection.instanceName, env.SNOW_INSTANCE_URL_TEMPLATE),
    clientId: connection.clientId,
    clientSecret: unseal(connection.clientSecretEnc),
    redirectUri: oauthRedirectUri(),
    timeoutMs: env.SNOW_HTTP_TIMEOUT_MS,
  };
}

export async function storeTokens(connectionId: string, tokens: TokenSet): Promise<void> {
  await getPrisma().pdiConnection.update({
    where: { id: connectionId },
    data: {
      accessTokenEnc: seal(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? seal(tokens.refreshToken) : undefined,
      accessTokenExpiresAt: tokens.expiresAt,
      status: 'CONNECTED',
    },
  });
}

async function markAuthExpired(connectionId: string): Promise<void> {
  await getPrisma().pdiConnection.update({
    where: { id: connectionId },
    data: { status: 'AUTH_EXPIRED' },
  });
}

// One refresh at a time per connection, so parallel requests don't race to rotate tokens.
// Per-process only, which is enough for the single-process local app.
const refreshes = new Map<string, Promise<string>>();

function refreshAccessToken(connectionId: string): Promise<string> {
  const inFlight = refreshes.get(connectionId);
  if (inFlight) return inFlight;
  const refresh = performRefresh(connectionId).finally(() => refreshes.delete(connectionId));
  refreshes.set(connectionId, refresh);
  return refresh;
}

async function performRefresh(connectionId: string): Promise<string> {
  const connection = await getPrisma().pdiConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  if (!connection.refreshTokenEnc) {
    await markAuthExpired(connectionId);
    throw new SnowAuthError('Your PDI connection has expired.');
  }
  try {
    const tokens = await refreshTokens(
      oauthConfigFor(connection),
      unseal(connection.refreshTokenEnc),
    );
    await storeTokens(connectionId, tokens);
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof SnowOAuthError || error instanceof SnowAuthError) {
      await markAuthExpired(connectionId);
      throw new SnowAuthError('Your PDI connection has expired.', { cause: error });
    }
    throw error;
  }
}

export function tokenProviderFor(connectionId: string): TokenProvider {
  return {
    async getAccessToken() {
      const connection = await getPrisma().pdiConnection.findUniqueOrThrow({
        where: { id: connectionId },
      });
      if (!connection.accessTokenEnc) throw new SnowAuthError('Your PDI is not connected yet.');
      const expiresAt = connection.accessTokenExpiresAt?.getTime() ?? 0;
      if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return unseal(connection.accessTokenEnc);
      return refreshAccessToken(connectionId);
    },
    refreshAccessToken: () => refreshAccessToken(connectionId),
  };
}

export function snowClientFor(connection: PdiConnection): SnowClient {
  const env = serverEnv();
  return createSnowClient({
    instance: connection.instanceName,
    tokens: tokenProviderFor(connection.id),
    urlTemplate: env.SNOW_INSTANCE_URL_TEMPLATE,
    timeoutMs: env.SNOW_HTTP_TIMEOUT_MS,
    retry: { maxRetries: env.SNOW_MAX_RETRIES },
  });
}

/** Runs the connection health check and stores the report on the connection. */
export async function runHealthCheck(connection: PdiConnection): Promise<HealthReport> {
  const report = await checkConnection(snowClientFor(connection), {
    requiredTables: requiredTables(),
  });
  await getPrisma().pdiConnection.update({
    where: { id: connection.id },
    data: {
      lastHealth: report as object,
      lastHealthAt: new Date(report.checkedAt),
      detectedRelease: report.release ?? connection.detectedRelease,
      snowUserName: report.user?.userName ?? connection.snowUserName,
      ...(report.status === 'AUTH_EXPIRED' ? { status: 'AUTH_EXPIRED' as const } : {}),
    },
  });
  return report;
}

export function storedHealth(connection: PdiConnection | null): HealthReport | null {
  return (connection?.lastHealth as HealthReport | null | undefined) ?? null;
}
