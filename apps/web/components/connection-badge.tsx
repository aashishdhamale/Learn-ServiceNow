import type { PdiConnection } from '@snow-mastery/db';
import type { HealthReport } from '@snow-mastery/snow-client';
import { Badge } from '@/components/ui/badge';

type Variant = 'success' | 'warning' | 'destructive' | 'secondary';

export function connectionState(
  connection: PdiConnection | null,
  health: HealthReport | null,
): { label: string; variant: Variant } {
  if (!connection || connection.status === 'PENDING')
    return { label: 'Not connected', variant: 'secondary' };
  if (connection.status === 'AUTH_EXPIRED')
    return { label: 'Reconnect needed', variant: 'destructive' };
  switch (health?.status) {
    case 'HIBERNATING':
      return { label: 'PDI asleep', variant: 'warning' };
    case 'DEGRADED':
      return { label: 'Connected, ATF blocked', variant: 'warning' };
    case 'MISSING_ACCESS':
    case 'INSTANCE_NOT_FOUND':
    case 'UNREACHABLE':
    case 'ERROR':
      return { label: 'Connection problem', variant: 'destructive' };
    default:
      return { label: 'Connected', variant: 'success' };
  }
}

export function ConnectionBadge({
  connection,
  health,
}: {
  connection: PdiConnection | null;
  health: HealthReport | null;
}) {
  const { label, variant } = connectionState(connection, health);
  return (
    <Badge variant={variant} data-testid="connection-badge">
      {connection ? `${connection.instanceName} · ${label}` : label}
    </Badge>
  );
}
