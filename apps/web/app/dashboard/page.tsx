import { MODULE_LABELS } from '@snow-mastery/scenarios';
import { ArrowRight, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { Meter } from '@/components/meter';
import { ProgressBadge } from '@/components/progress-badge';
import { AttemptStatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/server/current-user';
import { dashboardData } from '@/lib/server/dashboard';
import { getConnection } from '@/lib/server/pdi';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [data, connection] = await Promise.all([dashboardData(user.id), getConnection(user.id)]);
  const { totals } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your progress</h1>
          <p className="text-muted-foreground">
            Architect judgment, one realistic scenario at a time.
          </p>
        </div>
        {data.nextUp && (
          <Button asChild>
            <Link href={`/lab/${data.nextUp.scenario.id}`}>
              {data.nextUp.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}:{' '}
              {data.nextUp.scenario.title}
              <ArrowRight />
            </Link>
          </Button>
        )}
      </div>

      {connection?.status !== 'CONNECTED' && (
        <Alert variant="warning">
          <CircleAlert />
          <AlertTitle>{connection ? 'Reconnect your PDI' : 'Connect your PDI to start'}</AlertTitle>
          <AlertDescription>
            <Link href="/settings" className="underline underline-offset-4">
              Open Settings
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3" data-testid="stats">
        <StatTile
          label="Scenarios completed"
          value={`${totals.completed} of ${totals.scenarios}`}
          testId="stat-completed"
        />
        <StatTile label="In progress" value={String(totals.inProgress)} testId="stat-in-progress" />
        <StatTile label="Checks run" value={String(totals.attempts)} testId="stat-attempts" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Completed by module</CardTitle>
            <CardDescription>
              Architects work across modules; aim for breadth as well as depth.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {data.modules.map((module) => (
              <section
                key={module.module}
                className="space-y-2"
                data-testid={`module-${module.module}`}
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{MODULE_LABELS[module.module]}</span>
                  <span className="text-muted-foreground">
                    {module.completed} of {module.total} completed
                  </span>
                </div>
                <Meter
                  value={module.completed}
                  max={module.total}
                  label={`${MODULE_LABELS[module.module]}: ${module.completed} of ${module.total} completed`}
                />
                <ul className="space-y-1 pt-1 text-sm">
                  {module.scenarios.map(({ scenario, status }) => (
                    <li key={scenario.id} className="flex items-center justify-between gap-2">
                      <Link href={`/lab/${scenario.id}`} className="hover:underline">
                        {scenario.title}
                      </Link>
                      <ProgressBadge status={status} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent checks</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No checks yet. Build a scenario in your PDI, then check your work.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.recent.map((attempt) => (
                  <li key={attempt.id}>
                    <Link
                      href={`/lab/${attempt.scenarioId}/attempts/${attempt.id}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{attempt.scenarioTitle}</span>
                        <span className="text-xs text-muted-foreground">
                          {attempt.createdAt.toLocaleString()}
                        </span>
                      </span>
                      <AttemptStatusBadge status={attempt.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Card className="gap-1 py-5">
      <CardContent>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold tracking-tight" data-testid={testId}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
