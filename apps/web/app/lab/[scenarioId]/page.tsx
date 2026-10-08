import { DIFFICULTY_LABELS, MODULE_LABELS, readScenarioFile } from '@snow-mastery/scenarios';
import { ChevronDown, CircleAlert, ExternalLink, Lightbulb, MonitorPlay } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConnectionBadge } from '@/components/connection-badge';
import { Markdown } from '@/components/markdown';
import { ProgressBadge } from '@/components/progress-badge';
import { AttemptStatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getCurrentUser } from '@/lib/server/current-user';
import { recentAttempts } from '@/lib/server/grading';
import { getConnection, storedHealth } from '@/lib/server/pdi';
import { getProgress } from '@/lib/server/progress';
import { getScenario } from '@/lib/server/scenarios';
import { revealHintAction } from './actions';
import { CheckWorkButton } from './check-work-button';

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  if (!scenario) notFound();

  const user = await getCurrentUser();
  const [connection, progress, attempts] = await Promise.all([
    getConnection(user.id),
    getProgress(user.id, scenario.id),
    recentAttempts(user.id, scenario.id),
  ]);
  const health = storedHealth(connection);
  const connected = connection?.status === 'CONNECTED';
  const hintsRevealed = progress?.hintsRevealed ?? 0;
  const functional = scenario.functional;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link href="/lab" className="hover:text-foreground">
              Script Lab
            </Link>
            <span>/</span>
            <span>{MODULE_LABELS[scenario.module]}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{scenario.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ProgressBadge status={progress?.status} />
            <Badge variant="outline">{DIFFICULTY_LABELS[scenario.difficulty]}</Badge>
            <Badge variant="outline">Written for {capitalize(scenario.releaseFamily)}</Badge>
            {scenario.estimatedMinutes && (
              <Badge variant="outline">~{scenario.estimatedMinutes} min</Badge>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>The requirement</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{scenario.requirement}</Markdown>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Acceptance criteria</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {scenario.acceptanceCriteria.map((criterion) => (
                  <li key={criterion}>
                    <Markdown className="prose-p:my-0">{criterion}</Markdown>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>You will practise</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {scenario.objectives.map((objective) => (
                  <li key={objective.id}>{objective.title}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {scenario.hints.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4" /> Hints
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {scenario.hints.slice(0, hintsRevealed).map((hint, i) => (
                <div key={hint.title} className="rounded-lg border p-3" data-testid="hint">
                  <div className="mb-1 text-sm font-medium">
                    {i + 1}. {hint.title}
                  </div>
                  <Markdown>{hint.body}</Markdown>
                </div>
              ))}
              {hintsRevealed < scenario.hints.length ? (
                <form action={revealHintAction.bind(null, scenario.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Show hint {hintsRevealed + 1} of {scenario.hints.length}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">That&apos;s every hint.</p>
              )}
            </CardContent>
          </Card>
        )}

        {functional && (
          <Card>
            <Collapsible>
              <CardHeader>
                <CollapsibleTrigger className="group flex w-full items-center justify-between text-left">
                  <CardTitle>ATF setup for layer 3</CardTitle>
                  <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-4">
                  <Markdown>{readScenarioFile(scenario, functional.setupGuide)}</Markdown>
                  {functional.scripts.map((script) => (
                    <div key={script.path} className="space-y-2">
                      <div className="text-sm font-medium">{script.title}</div>
                      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                        <code>{readScenarioFile(scenario, script.path)}</code>
                      </pre>
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}

        {scenario.docs.length > 0 && (
          <div className="space-y-2 text-sm">
            <div className="font-medium">Reference</div>
            <ul className="space-y-1">
              {scenario.docs.map((doc) => (
                <li key={doc.url}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-4"
                  >
                    {doc.title} <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Check my work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Your PDI</span>
              <ConnectionBadge connection={connection} health={health} />
            </div>
            {!connected && (
              <Alert variant="warning">
                <CircleAlert />
                <AlertTitle>Connect your PDI first</AlertTitle>
                <AlertDescription>
                  <Link href="/settings" className="underline underline-offset-4">
                    Go to Settings
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            {functional?.requiresClientRunner && (
              <Alert variant="warning">
                <MonitorPlay />
                <AlertTitle>Open a Client Test Runner</AlertTitle>
                <AlertDescription>
                  This ATF suite has UI steps. In your PDI, open Automated Test Framework &gt; Run
                  &gt; Client Test Runner in another tab and keep it open while checking.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-muted-foreground">
              Reads your configuration, analyses your scripts, runs the ATF suite
              {functional ? ` "${functional.suiteName}"` : ''}, then asks an AI architect to review
              it. Nothing is written to your PDI.
            </p>
            <CheckWorkButton scenarioId={scenario.id} disabled={!connected} />
          </CardContent>
        </Card>

        {attempts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent attempts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <Link
                      href={`/lab/${scenario.id}/attempts/${attempt.id}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted"
                    >
                      <span>{attempt.createdAt.toLocaleString()}</span>
                      <AttemptStatusBadge status={attempt.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
