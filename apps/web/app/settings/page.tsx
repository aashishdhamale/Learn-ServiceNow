import { CircleAlert, CircleCheck } from 'lucide-react';
import { ConnectionBadge } from '@/components/connection-badge';
import { CopyField } from '@/components/copy-field';
import { HealthReport } from '@/components/health-report';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/server/current-user';
import { oauthRedirectUri } from '@/lib/server/env';
import { getConnection, storedHealth } from '@/lib/server/pdi';
import { disconnectAction, healthCheckAction } from './actions';
import { ConnectionForm } from './connection-form';

const ERRORS: Record<string, string> = {
  state: 'The sign-in attempt expired or did not match. Please connect again.',
  denied: 'Your PDI did not grant access.',
  exchange: 'Your PDI rejected the sign-in.',
  'no-connection': 'Save your instance and OAuth app details first.',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const connection = await getConnection(user.id);
  const health = storedHealth(connection);
  const connected = connection?.status === 'CONNECTED';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Connect your ServiceNow Personal Developer Instance (PDI).
        </p>
      </div>

      {params.connected && (
        <Alert variant="success">
          <CircleCheck />
          <AlertTitle>Your PDI is connected.</AlertTitle>
        </Alert>
      )}
      {params.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{ERRORS[params.error] ?? 'Connecting failed.'}</AlertTitle>
          {params.detail && <AlertDescription>{params.detail}</AlertDescription>}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Register an OAuth app in your PDI</CardTitle>
            <CardDescription>
              The app signs in to your PDI with OAuth 2.0 (authorization code flow) and only reads
              from it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In your PDI, open <strong>System OAuth &gt; Application Registry</strong> (on newer
                releases, the inbound integrations area of the Machine Identity Console) and create
                an OAuth API endpoint for external clients with the{' '}
                <strong>authorization code</strong> grant.
              </li>
              <li>Set its redirect URL to:</li>
            </ol>
            <CopyField value={oauthRedirectUri()} label="redirect URL" />
            <p className="text-muted-foreground">
              Then copy its client ID and secret here. The README has step-by-step instructions,
              including least-privilege options.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Connect</CardTitle>
            <CardDescription>Client secrets and tokens are encrypted at rest.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionForm
              defaults={{
                instanceName: connection?.instanceName,
                clientId: connection?.clientId,
                oauthScope: connection?.oauthScope ?? undefined,
                hasSecret: Boolean(connection),
              }}
            />
          </CardContent>
        </Card>
      </div>

      {connection && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Connection health <ConnectionBadge connection={connection} health={health} />
            </CardTitle>
            <CardDescription>
              Checks that your PDI is awake, that you are signed in, and that the Script Lab can
              read your configuration and run ATF.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {health ? (
              <HealthReport report={health} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {connected ? 'No health check yet.' : 'Finish connecting to run a health check.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {connected && (
                <form action={healthCheckAction}>
                  <Button type="submit" variant="outline">
                    Run health check
                  </Button>
                </form>
              )}
              {connection.status !== 'CONNECTED' && (
                <Button asChild variant="outline">
                  <a href="/api/pdi/oauth/start">Reconnect</a>
                </Button>
              )}
              <form action={disconnectAction}>
                <Button type="submit" variant="ghost">
                  Disconnect
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
