import type { ProbeObservation, TriageFilterStage } from './types.ts';

export interface RetryPolicy {
  /** Production defaults: [60_000, 180_000] (1m and 3m). Demo mode uses short ms delays. */
  delaysMs: number[];
  /** Human-readable schedule label for telemetry */
  scheduleLabel: string;
}

export const PRODUCTION_RETRY_POLICY: RetryPolicy = {
  delaysMs: [60_000, 180_000],
  scheduleLabel: '1 min -> 3 min',
};

export const DEMO_RETRY_POLICY: RetryPolicy = {
  delaysMs: [350, 650],
  scheduleLabel: '1 min -> 3 min (accelerated 350ms -> 650ms for live demo)',
};

export function isRetryableObservation(obs: ProbeObservation): boolean {
  if (obs.errorType === 'transient_504') return true;
  return obs.networkFailures.some(
    (f) => !f.isThirdParty && (f.status === 502 || f.status === 503 || f.status === 504 || f.status === 0)
  );
}

export interface StaggeredRetryResult {
  recovered: boolean;
  retriesExecuted: number;
  finalObservation: ProbeObservation;
  stage: TriageFilterStage;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Filter 2: Staggered Retries.
 * On 504, timeout, or transient network failure, retries after 1 min and 3 min
 * (or accelerated demo delays). If the flow recovers, logs silently and launches 0 agents.
 */
export async function runStaggeredRetries(
  initialObservation: ProbeObservation,
  reprobeFn: (attempt: number) => Promise<ProbeObservation>,
  policy: RetryPolicy = DEMO_RETRY_POLICY
): Promise<StaggeredRetryResult> {
  const startedAt = Date.now();

  if (!isRetryableObservation(initialObservation)) {
    return {
      recovered: false,
      retriesExecuted: 0,
      finalObservation: initialObservation,
      stage: {
        stage: 'staggered_retry',
        outcome: 'passed',
        durationMs: Math.max(2, Date.now() - startedAt),
        reason: `Deterministic failure (${initialObservation.errorType}); not a transient 504/timeout. Advancing immediately.`,
        details: {
          retryable: false,
          retriesExecuted: 0,
        },
      },
    };
  }

  let current = initialObservation;
  let retriesExecuted = 0;

  for (let i = 0; i < policy.delaysMs.length; i++) {
    const delayMs = policy.delaysMs[i];
    await sleep(delayMs);
    retriesExecuted += 1;
    const nextAttempt = initialObservation.attempt + retriesExecuted;
    current = await reprobeFn(nextAttempt);

    if (current.passed) {
      return {
        recovered: true,
        retriesExecuted,
        finalObservation: current,
        stage: {
          stage: 'staggered_retry',
          outcome: 'recovered',
          durationMs: Math.max(5, Date.now() - startedAt),
          reason: `Transient 504/timeout recovered on retry #${retriesExecuted} (schedule: ${policy.scheduleLabel}). Logged silently without spawning Devin agents.`,
          details: {
            retryable: true,
            retriesExecuted,
            recoveredOnAttempt: nextAttempt,
          },
        },
      };
    }
  }

  return {
    recovered: false,
    retriesExecuted,
    finalObservation: current,
    stage: {
      stage: 'staggered_retry',
      outcome: 'passed',
      durationMs: Math.max(5, Date.now() - startedAt),
      reason: `Failure persisted across ${retriesExecuted} staggered retries (${policy.scheduleLabel}). Confirmed sustained outage.`,
      details: {
        retryable: true,
        retriesExecuted,
        sustained: true,
      },
    },
  };
}
