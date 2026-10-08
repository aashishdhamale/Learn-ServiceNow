import type { HealthReport as Report } from '@snow-mastery/snow-client';
import { CircleAlert, CircleCheck, CircleMinus, CircleX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ICONS = {
  ok: <CircleCheck className="size-4 text-success" aria-label="ok" />,
  warn: <CircleAlert className="size-4 text-warning" aria-label="warning" />,
  fail: <CircleX className="size-4 text-destructive" aria-label="failed" />,
  skipped: <CircleMinus className="size-4 text-muted-foreground" aria-label="not checked" />,
};

export function HealthReport({ report }: { report: Report }) {
  const healthy = report.status === 'OK';
  return (
    <div className="space-y-4" data-testid="health-report" data-status={report.status}>
      <Alert
        variant={healthy ? 'success' : report.status === 'DEGRADED' ? 'warning' : 'destructive'}
      >
        {healthy ? <CircleCheck /> : <CircleAlert />}
        <AlertTitle>{report.headline}</AlertTitle>
        {report.action && <AlertDescription>{report.action}</AlertDescription>}
      </Alert>
      <ul className="space-y-2">
        {report.checks.map((check) => (
          <li key={check.id} className="flex gap-3 text-sm">
            <span className="mt-0.5">{ICONS[check.status]}</span>
            <div>
              <div className="font-medium">{check.label}</div>
              <div className="text-muted-foreground">{check.message}</div>
              {check.action && <div className="mt-1">{check.action}</div>}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Checked {new Date(report.checkedAt).toLocaleString()}
        {report.user && ` as ${report.user.userName}`}
        {report.release && ` · release ${report.release}`}
      </p>
    </div>
  );
}
