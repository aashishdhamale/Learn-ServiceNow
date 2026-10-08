import { Badge } from '@/components/ui/badge';
import type { AttemptStatus, LayerViewStatus } from '@/lib/attempt-view';

type Variant = 'success' | 'destructive' | 'warning' | 'secondary' | 'outline';

const LAYER: Record<LayerViewStatus, { label: string; variant: Variant }> = {
  PENDING: { label: 'Waiting', variant: 'outline' },
  RUNNING: { label: 'Checking…', variant: 'secondary' },
  PASSED: { label: 'Passed', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  BLOCKED: { label: 'Blocked', variant: 'warning' },
  SKIPPED: { label: 'Skipped', variant: 'outline' },
  ERROR: { label: 'Error', variant: 'destructive' },
  COMPLETED: { label: 'Done', variant: 'secondary' },
};

const ATTEMPT: Record<AttemptStatus, { label: string; variant: Variant }> = {
  QUEUED: { label: 'Queued', variant: 'outline' },
  RUNNING: { label: 'Checking…', variant: 'secondary' },
  PASSED: { label: 'Passed', variant: 'success' },
  FAILED: { label: 'Not yet', variant: 'destructive' },
  ERROR: { label: 'Error', variant: 'destructive' },
};

export function LayerStatusBadge({ status }: { status: LayerViewStatus }) {
  const { label, variant } = LAYER[status];
  return (
    <Badge variant={variant} data-testid="layer-status" data-status={status}>
      {label}
    </Badge>
  );
}

export function AttemptStatusBadge({ status }: { status: AttemptStatus }) {
  const { label, variant } = ATTEMPT[status];
  return (
    <Badge variant={variant} data-testid="attempt-status" data-status={status}>
      {label}
    </Badge>
  );
}
