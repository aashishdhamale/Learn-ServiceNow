import type { ReviewDetails } from '@snow-mastery/grader';
import { Badge } from '@/components/ui/badge';

export function ReviewPanel({ details }: { details: ReviewDetails | null }) {
  if (!details || !('feedback' in details)) return null;
  const { feedback } = details;
  return (
    <div className="space-y-4 text-sm" data-testid="review-feedback">
      <p className="text-base">{feedback.summary}</p>
      <section>
        <h4 className="mb-1 font-medium">What works</h4>
        <ul className="list-disc space-y-1 pl-5">
          {feedback.whatWorks.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="mb-1 font-medium">What a CTA review board would challenge</h4>
        <ul className="space-y-2">
          {feedback.boardChallenges.map((challenge, i) => (
            <li key={i} className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                {challenge.rubricId && <Badge variant="outline">{challenge.rubricId}</Badge>}
                <span className="font-medium">{challenge.concern}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{challenge.whyItMatters}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg border bg-muted/40 p-3">
        <h4 className="mb-1 font-medium">One improvement: {feedback.improvement.title}</h4>
        <p>{feedback.improvement.detail}</p>
        {feedback.improvement.example && (
          <pre className="mt-2 overflow-x-auto rounded-md bg-background px-3 py-2 text-xs">
            <code>{feedback.improvement.example}</code>
          </pre>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Coaching only; it never changes whether you passed. Model: {details.model}
        {details.usage && ` · ${details.usage.inputTokens + details.usage.outputTokens} tokens`}
      </p>
    </div>
  );
}
