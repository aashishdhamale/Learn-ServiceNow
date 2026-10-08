import type { FunctionalDetails } from '@snow-mastery/grader';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function FunctionalPanel({ details }: { details: FunctionalDetails | null }) {
  if (!details?.counts) return null;
  const { success, failure, error, skip } = details.counts;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{details.suiteName}</span>
        <Badge variant="success">{success} passed</Badge>
        {failure + error > 0 && <Badge variant="destructive">{failure + error} failed</Badge>}
        {skip > 0 && <Badge variant="outline">{skip} skipped</Badge>}
        {details.duration && <span className="text-muted-foreground">{details.duration}</span>}
      </div>
      {details.resultsUrl && (
        <a
          href={details.resultsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs underline underline-offset-4"
        >
          Open the suite result in your PDI <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
