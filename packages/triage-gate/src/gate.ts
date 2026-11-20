import { evaluateBudgetCap } from './budget.ts';
import { computeIncidentHash, DedupeEngine } from './dedupe.ts';
import { evaluateDomainFilter } from './domain-filter.ts';
import { DEMO_RETRY_POLICY, runStaggeredRetries, type RetryPolicy } from './retry.ts';
import type { BudgetState, ProbeObservation, TriageDecision, TriageFilterStage } from './types.ts';

export const NAIVE_BOT_AGENT_COST_USD = 4.85;

export interface TriageGateOptions {
  firstPartyHost?: string;
  budget: BudgetState;
  dedupe: DedupeEngine;
  retryPolicy?: RetryPolicy;
  projectedRunCostUsd?: number;
  reprobeFn: (attempt: number) => Promise<ProbeObservation>;
}

/**
 * Core Funnel Guardian Triage Gate + Deduplication Engine.
 * Sequence:
 *   1. Healthy fast-path
 *   2. Domain Filter (ignores non-blocking 3rd-party scripts)
 *   3. Staggered Retries (1m -> 3m; accelerated in demo mode)
 *   4. Deterministic Deduplication (SHA-256 + 6h cooldown + open Linear ticket)
 *   5. Hard Budget Cap (daily USD + max nightly agent runs)
 */
export async function evaluateTriageGate(
  initialObservation: ProbeObservation,
  options: TriageGateOptions
): Promise<{ decision: TriageDecision; finalObservation: ProbeObservation }> {
  const stages: TriageFilterStage[] = [];
  const incidentHash = computeIncidentHash(initialObservation);

  if (initialObservation.passed && initialObservation.errorType === 'none') {
    return {
      finalObservation: initialObservation,
      decision: {
        incidentHash,
        action: 'healthy',
        shouldTriggerAgents: false,
        reason: `Flow ${initialObservation.flow} (${initialObservation.viewport}) passed all assertions.`,
        stages,
        retriesExecuted: 0,
        estimatedCostSavedUsd: 0,
      },
    };
  }

  // Filter 1: Domain Filter
  const domainResult = evaluateDomainFilter(initialObservation, options.firstPartyHost);
  stages.push(domainResult.stage);

  if (!domainResult.passedToNextStage) {
    return {
      finalObservation: initialObservation,
      decision: {
        incidentHash,
        action: 'drop_third_party_noise',
        shouldTriggerAgents: false,
        reason: domainResult.stage.reason,
        stages,
        retriesExecuted: 0,
        estimatedCostSavedUsd: NAIVE_BOT_AGENT_COST_USD,
      },
    };
  }

  // Filter 2: Staggered Retries
  const retryResult = await runStaggeredRetries(
    initialObservation,
    options.reprobeFn,
    options.retryPolicy ?? DEMO_RETRY_POLICY
  );
  stages.push(retryResult.stage);

  if (retryResult.recovered) {
    return {
      finalObservation: retryResult.finalObservation,
      decision: {
        incidentHash,
        action: 'recovered_on_retry',
        shouldTriggerAgents: false,
        reason: retryResult.stage.reason,
        stages,
        retriesExecuted: retryResult.retriesExecuted,
        estimatedCostSavedUsd: NAIVE_BOT_AGENT_COST_USD,
      },
    };
  }

  // Module 3: Deduplication & 6h Cooldown
  const dedupeResult = options.dedupe.check(retryResult.finalObservation);
  stages.push(dedupeResult.stage);

  if (dedupeResult.isDuplicate) {
    return {
      finalObservation: retryResult.finalObservation,
      decision: {
        incidentHash: dedupeResult.incidentHash,
        action: 'drop_duplicate',
        shouldTriggerAgents: false,
        reason: dedupeResult.stage.reason,
        stages,
        retriesExecuted: retryResult.retriesExecuted,
        estimatedCostSavedUsd: NAIVE_BOT_AGENT_COST_USD,
        existingLinearTicketId: dedupeResult.existingRecord?.linearTicketId,
      },
    };
  }

  // Filter 3: Hard Nightly/Daily Budget Cap
  const budgetResult = evaluateBudgetCap(options.budget, options.projectedRunCostUsd);
  stages.push(budgetResult.stage);

  if (!budgetResult.allowed) {
    return {
      finalObservation: retryResult.finalObservation,
      decision: {
        incidentHash: dedupeResult.incidentHash,
        action: 'blocked_budget_cap',
        shouldTriggerAgents: false,
        reason: budgetResult.stage.reason,
        stages,
        retriesExecuted: retryResult.retriesExecuted,
        estimatedCostSavedUsd: options.projectedRunCostUsd ?? options.budget.estimatedRunCostUsd,
      },
    };
  }

  return {
    finalObservation: retryResult.finalObservation,
    decision: {
      incidentHash: dedupeResult.incidentHash,
      action: 'escalate',
      shouldTriggerAgents: true,
      reason: `Verified first-party revenue incident (${dedupeResult.incidentHash}). Cleared all Triage Gate filters -> launching Staged Fan-Out (Phase A: Devin 1).`,
      stages,
      retriesExecuted: retryResult.retriesExecuted,
      estimatedCostSavedUsd: 0,
    },
  };
}
