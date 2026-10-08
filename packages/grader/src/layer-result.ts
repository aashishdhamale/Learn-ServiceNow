import type { Clock, Finding, LayerName, LayerResult, LayerStatus } from './types';

/** Collects findings for one layer and stamps timings. */
export class LayerRecorder {
  readonly findings: Finding[] = [];
  private readonly startedAt: Date;

  constructor(
    readonly layer: LayerName,
    private readonly clock: Pick<Clock, 'now'>,
  ) {
    this.startedAt = clock.now();
  }

  add(finding: Finding) {
    this.findings.push(finding);
  }

  /** Error-severity findings that did not pass. */
  get blockingFailures(): Finding[] {
    return this.findings.filter((f) => !f.passed && f.severity === 'error');
  }

  get warnings(): Finding[] {
    return this.findings.filter((f) => !f.passed && f.severity === 'warning');
  }

  finish<D>(status: LayerStatus, summary: string, details?: D): LayerResult<D> {
    return {
      layer: this.layer,
      status,
      summary,
      findings: this.findings,
      details,
      startedAt: this.startedAt.toISOString(),
      finishedAt: this.clock.now().toISOString(),
    };
  }
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
