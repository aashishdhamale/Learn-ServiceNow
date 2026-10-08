import type { ProgressStatus } from '@snow-mastery/db';
import { Badge } from '@/components/ui/badge';

export function ProgressBadge({ status }: { status: ProgressStatus | undefined }) {
  if (status === 'COMPLETED') return <Badge variant="success">Completed</Badge>;
  if (status === 'IN_PROGRESS') return <Badge variant="secondary">In progress</Badge>;
  return <Badge variant="outline">Not started</Badge>;
}
