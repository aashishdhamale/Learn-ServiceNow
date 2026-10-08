'use client';

import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveConnectionAction, type ConnectionFormState } from './actions';

interface Props {
  defaults: { instanceName?: string; clientId?: string; oauthScope?: string; hasSecret: boolean };
}

export function ConnectionForm({ defaults }: Props) {
  const [state, formAction, pending] = useActionState<ConnectionFormState, FormData>(
    saveConnectionAction,
    {},
  );
  const errors = state.errors ?? {};
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <Field label="Instance name" name="instanceName" error={errors.instanceName}>
        <Input
          id="instanceName"
          name="instanceName"
          placeholder="dev12345"
          defaultValue={defaults.instanceName}
          aria-invalid={Boolean(errors.instanceName)}
          autoComplete="off"
        />
      </Field>
      <Field label="OAuth client ID" name="clientId" error={errors.clientId}>
        <Input
          id="clientId"
          name="clientId"
          defaultValue={defaults.clientId}
          aria-invalid={Boolean(errors.clientId)}
          autoComplete="off"
        />
      </Field>
      <Field
        label="OAuth client secret"
        name="clientSecret"
        error={errors.clientSecret}
        hint={
          defaults.hasSecret ? 'A secret is saved (encrypted). Leave blank to keep it.' : undefined
        }
      >
        <Input
          id="clientSecret"
          name="clientSecret"
          type="password"
          aria-invalid={Boolean(errors.clientSecret)}
          autoComplete="new-password"
        />
      </Field>
      <Field
        label="OAuth scope (optional)"
        name="oauthScope"
        error={errors.oauthScope}
        hint="Leave blank to use your OAuth app's default scope. Set it if you created a restricted auth scope."
      >
        <Input
          id="oauthScope"
          name="oauthScope"
          defaultValue={defaults.oauthScope}
          autoComplete="off"
        />
      </Field>
      <div>
        <Button type="submit" disabled={pending || Boolean(state.redirectTo)}>
          {pending || state.redirectTo
            ? 'Connecting…'
            : defaults.instanceName
              ? 'Save and reconnect'
              : 'Save and connect'}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
