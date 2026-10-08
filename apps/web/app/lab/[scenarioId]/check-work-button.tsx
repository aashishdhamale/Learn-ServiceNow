'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { checkWorkAction, type CheckWorkState } from './actions';

export function CheckWorkButton({
  scenarioId,
  disabled,
}: {
  scenarioId: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<CheckWorkState>(
    checkWorkAction.bind(null, scenarioId),
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" size="lg" disabled={disabled || pending} className="w-full">
        {pending ? 'Starting…' : 'Check my work'}
      </Button>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
