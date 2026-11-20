import type { BudgetState, TriageFilterStage } from './types.ts';

export const DEFAULT_BUDGET_STATE: BudgetState = {
  dailyCapUsd: 10.0,
  maxRunsPerNight: 6,
  spentUsd: 0,
  runsUsed: 0,
  estimatedRunCostUsd: 1.4,
};

export interface BudgetCheckResult {
  allowed: boolean;
  stage: TriageFilterStage;
}

/**
 * Filter 3: Hard Nightly/Daily Budget Cap.
 * Protects engineering teams from runaway agent spend during 3 AM incidents.
 */
export function evaluateBudgetCap(
  budget: BudgetState,
  projectedRunCostUsd = budget.estimatedRunCostUsd
): BudgetCheckResult {
  const start = Date.now();
  const nextSpend = Number((budget.spentUsd + projectedRunCostUsd).toFixed(2));
  const nextRuns = budget.runsUsed + 1;

  if (nextRuns > budget.maxRunsPerNight) {
    return {
      allowed: false,
      stage: {
        stage: 'budget_cap',
        outcome: 'blocked',
        durationMs: Math.max(2, Date.now() - start),
        reason: `Hard nightly run cap reached (${budget.runsUsed}/${budget.maxRunsPerNight} agent runs used). Queued for morning triage without launching Devin.`,
        details: {
          runsUsed: budget.runsUsed,
          maxRunsPerNight: budget.maxRunsPerNight,
          spentUsd: budget.spentUsd,
          dailyCapUsd: budget.dailyCapUsd,
        },
      },
    };
  }

  if (nextSpend > budget.dailyCapUsd) {
    return {
      allowed: false,
      stage: {
        stage: 'budget_cap',
        outcome: 'blocked',
        durationMs: Math.max(2, Date.now() - start),
        reason: `Hard budget cap would be exceeded ($${nextSpend.toFixed(2)} > $${budget.dailyCapUsd.toFixed(2)} daily cap). Escalation paused for human approval.`,
        details: {
          spentUsd: budget.spentUsd,
          projectedSpendUsd: nextSpend,
          dailyCapUsd: budget.dailyCapUsd,
        },
      },
    };
  }

  return {
    allowed: true,
    stage: {
      stage: 'budget_cap',
      outcome: 'passed',
      durationMs: Math.max(2, Date.now() - start),
      reason: `Within budget guardrails ($${budget.spentUsd.toFixed(2)} / $${budget.dailyCapUsd.toFixed(2)} spent; ${budget.runsUsed}/${budget.maxRunsPerNight} runs).`,
      details: {
        spentUsd: budget.spentUsd,
        dailyCapUsd: budget.dailyCapUsd,
        runsUsed: budget.runsUsed,
        maxRunsPerNight: budget.maxRunsPerNight,
      },
    },
  };
}
