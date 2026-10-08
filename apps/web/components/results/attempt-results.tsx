'use client';

import type { FunctionalDetails, ReviewDetails } from '@snow-mastery/grader';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AttemptStatusBadge, LayerStatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isFinished, LAYER_LABELS, type AttemptView, type LayerView } from '@/lib/attempt-view';
import { FindingsList } from './findings-list';
import { FunctionalPanel } from './functional-panel';
import { ReviewPanel } from './review-panel';

const POLL_MS = 1500;

/** Shows an attempt's four layers and polls until grading finishes. */
export function AttemptResults({ initial }: { initial: AttemptView }) {
  const [attempt, setAttempt] = useState(initial);

  useEffect(() => {
    if (isFinished(attempt.status)) return;
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/attempts/${attempt.id}`, { cache: 'no-store' });
      if (response.ok) setAttempt((await response.json()) as AttemptView);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [attempt]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AttemptStatusBadge status={attempt.status} />
        <span className="text-sm text-muted-foreground">
          {attempt.instanceName} · {new Date(attempt.createdAt).toLocaleString()} · scenario v
          {attempt.scenarioVersion}
        </span>
        {!isFinished(attempt.status) && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <Verdict attempt={attempt} />
      {attempt.layers.map((layer, index) => (
        <LayerCard key={layer.layer} layer={layer} index={index + 1} />
      ))}
    </div>
  );
}

function Verdict({ attempt }: { attempt: AttemptView }) {
  if (attempt.status === 'PASSED') {
    return (
      <Alert variant="success">
        <CircleCheck />
        <AlertTitle>You passed this scenario.</AlertTitle>
        <AlertDescription>
          Read the architect review below; it is what a review board would push on next.
        </AlertDescription>
      </Alert>
    );
  }
  if (attempt.status === 'FAILED') {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Not passed yet.</AlertTitle>
        <AlertDescription>
          Fix the problems below in your PDI, then check your work again.
        </AlertDescription>
      </Alert>
    );
  }
  if (attempt.status === 'ERROR') {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Checking stopped.</AlertTitle>
        {attempt.errorMessage && <AlertDescription>{attempt.errorMessage}</AlertDescription>}
      </Alert>
    );
  }
  return null;
}

function LayerCard({ layer, index }: { layer: LayerView; index: number }) {
  const label = LAYER_LABELS[layer.layer];
  return (
    <Card data-testid={`layer-${layer.layer}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span>
            {index}. {label.title}
          </span>
          <LayerStatusBadge status={layer.status} />
        </CardTitle>
        <CardDescription>
          {/* The review panel shows its own summary prominently. */}
          {layer.layer === 'REVIEW' && layer.status === 'COMPLETED'
            ? label.description
            : (layer.summary ?? label.description)}
        </CardDescription>
      </CardHeader>
      {(layer.findings.length > 0 || layer.details != null) && (
        <CardContent className="space-y-4">
          {layer.layer === 'FUNCTIONAL' && (
            <FunctionalPanel details={layer.details as FunctionalDetails | null} />
          )}
          {layer.layer === 'REVIEW' && (
            <ReviewPanel details={layer.details as ReviewDetails | null} />
          )}
          <FindingsList findings={layer.findings} />
        </CardContent>
      )}
    </Card>
  );
}
