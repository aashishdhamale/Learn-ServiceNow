import type { Finding } from '@snow-mastery/grader';
import { CircleAlert, CircleCheck, CircleX, ExternalLink, Info } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const ORDER: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };

export function FindingsList({ findings }: { findings: Finding[] }) {
  const open = findings
    .filter((f) => !f.passed)
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const passed = findings.filter((f) => f.passed);
  if (findings.length === 0) return null;
  return (
    <div className="space-y-3">
      {open.map((finding, i) => (
        <FindingItem key={`${finding.checkId}-${i}`} finding={finding} />
      ))}
      {passed.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            {passed.length} check{passed.length === 1 ? '' : 's'} passed
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-1 text-sm">
              {passed.map((finding, i) => (
                <li key={`${finding.checkId}-${i}`} className="flex items-start gap-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>
                    {finding.title}
                    {finding.target?.name && (
                      <span className="text-muted-foreground"> · {finding.target.name}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function FindingItem({ finding }: { finding: Finding }) {
  const icon =
    finding.severity === 'error' ? (
      <CircleX className="size-4 text-destructive" />
    ) : finding.severity === 'warning' ? (
      <CircleAlert className="size-4 text-warning" />
    ) : (
      <Info className="size-4 text-muted-foreground" />
    );
  return (
    <div
      className="rounded-lg border p-3 text-sm"
      data-testid="finding"
      data-check={finding.checkId}
      data-severity={finding.severity}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="font-medium">
            {finding.title}
            {finding.target?.name && (
              <span className="font-normal text-muted-foreground"> · {finding.target.name}</span>
            )}
          </div>
          <p>
            {finding.message}
            {finding.line && <span className="text-muted-foreground"> (line {finding.line})</span>}
          </p>
          {finding.snippet && (
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
              <code>{finding.snippet}</code>
            </pre>
          )}
          {finding.why && (
            <p>
              <span className="font-medium">Why it matters: </span>
              {finding.why}
            </p>
          )}
          {finding.fix && (
            <p>
              <span className="font-medium">How to fix: </span>
              {finding.fix}
            </p>
          )}
          {finding.docsUrl && (
            <a
              href={finding.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs underline underline-offset-4"
            >
              Learn more <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
