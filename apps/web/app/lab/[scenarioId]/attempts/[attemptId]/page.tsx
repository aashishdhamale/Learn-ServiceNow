import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AttemptResults } from '@/components/results/attempt-results';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/server/current-user';
import { getAttemptView } from '@/lib/server/grading';

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ scenarioId: string; attemptId: string }>;
}) {
  const { scenarioId, attemptId } = await params;
  const user = await getCurrentUser();
  const attempt = await getAttemptView(user.id, attemptId);
  if (!attempt || attempt.scenarioId !== scenarioId) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link href={`/lab/${scenarioId}`} className="hover:text-foreground">
              {attempt.scenarioTitle}
            </Link>{' '}
            / Results
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Check my work</h1>
        </div>
        <Button asChild variant="outline">
          <Link href={`/lab/${scenarioId}`}>Back to the scenario</Link>
        </Button>
      </div>
      <AttemptResults initial={attempt} />
    </div>
  );
}
