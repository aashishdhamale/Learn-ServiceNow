import {
  DIFFICULTY_LABELS,
  MODULE_LABELS,
  type LoadedScenario,
  type Module,
} from '@snow-mastery/scenarios';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { ProgressBadge } from '@/components/progress-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/server/current-user';
import { progressByScenario } from '@/lib/server/progress';
import { loadScenarios } from '@/lib/server/scenarios';

export default async function LabPage() {
  const user = await getCurrentUser();
  const progress = await progressByScenario(user.id);
  const byModule = new Map<Module, LoadedScenario[]>();
  for (const scenario of loadScenarios()) {
    byModule.set(scenario.module, [...(byModule.get(scenario.module) ?? []), scenario]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Script Lab</h1>
        <p className="text-muted-foreground">
          Read the scenario, build it in your PDI with ServiceNow&apos;s own tools, then check your
          work.
        </p>
      </div>
      {[...byModule].map(([module, scenarios]) => (
        <section key={module} className="space-y-3">
          <h2 className="text-lg font-medium">{MODULE_LABELS[module]}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {scenarios.map((scenario) => (
              <Link
                key={scenario.id}
                href={`/lab/${scenario.id}`}
                data-testid={`scenario-${scenario.id}`}
              >
                <Card className="h-full transition-colors hover:border-foreground/30">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      {scenario.title}
                      <ProgressBadge status={progress.get(scenario.id)?.status} />
                    </CardTitle>
                    <CardDescription>{scenario.summary}</CardDescription>
                    <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{DIFFICULTY_LABELS[scenario.difficulty]}</Badge>
                      {scenario.estimatedMinutes && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" /> {scenario.estimatedMinutes} min
                        </span>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
