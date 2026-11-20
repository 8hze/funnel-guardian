import {
  DedupeEngine,
  evaluateTriageGate,
  FAULT_SCENARIOS,
  NAIVE_BOT_AGENT_COST_USD,
  type BudgetState,
  type FaultId,
  type ProbeObservation,
  type RetryPolicy,
} from '@funnel-guardian/triage-gate';
import {
  runDevinPhaseARepro,
  runDevinPhaseBPatch,
  runDevinPhaseBVisualQA,
} from './devin-client.ts';
import { GitHubAdapter } from './github-client.ts';
import { LinearAdapter } from './linear-client.ts';
import type { PipelineRunResult, SafetyPolicyStatus } from './types.ts';

export const SAFETY_POLICY: SafetyPolicyStatus = {
  readOnlyProd: true,
  ephemeralPreviewOnly: true,
  stripeTestModeOnly: true,
  humanGateOnSensitiveChanges: true,
};

export interface OrchestrateRunParams {
  faultId?: FaultId;
  targetUrl: string;
  previewBaseUrl?: string;
  firstPartyHost?: string;
  budget: BudgetState;
  dedupe: DedupeEngine;
  linear: LinearAdapter;
  github: GitHubAdapter;
  retryPolicy?: RetryPolicy;
  initialObservation: ProbeObservation;
  reprobeFn: (attempt: number) => Promise<ProbeObservation>;
  verifyReproFails?: () => Promise<boolean>;
}

/**
 * Full 5-Module Funnel Guardian Pipeline:
 * [1. Browser Probe] -> [2. Triage Gate] -> [3. Deduplication] -> [4. Staged Fan-Out (Devin 1 -> Devin 2 + 3)] -> [5. Human Approval]
 */
export async function runFunnelGuardianPipeline(
  params: OrchestrateRunParams
): Promise<{ result: PipelineRunResult; updatedBudget: BudgetState }> {
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const spec = params.faultId ? FAULT_SCENARIOS[params.faultId] : undefined;
  const projectedCost = spec?.estimatedAgentCostUsd ?? params.budget.estimatedRunCostUsd;
  const naiveCost = spec?.naiveBotCostUsd ?? NAIVE_BOT_AGENT_COST_USD;

  const { decision, finalObservation } = await evaluateTriageGate(params.initialObservation, {
    firstPartyHost: params.firstPartyHost,
    budget: params.budget,
    dedupe: params.dedupe,
    retryPolicy: params.retryPolicy,
    projectedRunCostUsd: projectedCost,
    reprobeFn: params.reprobeFn,
  });

  const baseResult: Omit<
    PipelineRunResult,
    'finalStatus' | 'totalCostUsd' | 'naiveCostUsd' | 'costSavedUsd'
  > = {
    runId,
    timestamp: new Date().toISOString(),
    faultId: params.faultId,
    scenarioCode: spec?.code ?? 'HEALTH',
    scenarioTitle: spec?.title ?? `Healthy check (${finalObservation.flow})`,
    targetUrl: params.targetUrl,
    safetyPolicy: SAFETY_POLICY,
    probe: finalObservation,
    triage: decision,
  };

  if (!decision.shouldTriggerAgents) {
    const statusMap = {
      healthy: 'healthy',
      drop_third_party_noise: 'filtered_noise',
      recovered_on_retry: 'recovered_retry',
      drop_duplicate: 'deduplicated',
      blocked_budget_cap: 'budget_capped',
      escalate: 'healthy',
    } as const;

    const finalStatus = statusMap[decision.action];
    const effectiveNaive = finalStatus === 'healthy' ? 0 : naiveCost;
    const saved = finalStatus === 'healthy' ? 0 : effectiveNaive;

    return {
      updatedBudget: { ...params.budget },
      result: {
        ...baseResult,
        finalStatus,
        totalCostUsd: 0,
        naiveCostUsd: effectiveNaive,
        costSavedUsd: saved,
      },
    };
  }

  // Confirmed real first-party revenue bug -> Create Linear ticket & register dedupe fingerprint
  const linearTicket = await params.linear.createIncidentTicket(
    finalObservation,
    decision.incidentHash,
    spec?.title ?? finalObservation.summary
  );
  params.dedupe.recordIncident(finalObservation, linearTicket.id);

  const fallbackSpec = spec ?? FAULT_SCENARIOS['checkout-mobile-overlap'];

  // Module 4 — Phase A: Devin 1 (Verification / Deterministic Repro ONLY)
  const phaseA = await runDevinPhaseARepro(
    finalObservation,
    fallbackSpec,
    params.verifyReproFails
  );

  if (phaseA.status !== 'reproduced_fail') {
    const updatedBudget: BudgetState = {
      ...params.budget,
      spentUsd: Number((params.budget.spentUsd + phaseA.costUsd).toFixed(2)),
      runsUsed: params.budget.runsUsed + 1,
    };
    return {
      updatedBudget,
      result: {
        ...baseResult,
        linearTicket,
        phaseA,
        finalStatus: 'not_reproduced',
        totalCostUsd: phaseA.costUsd,
        naiveCostUsd: naiveCost,
        costSavedUsd: Number(Math.max(0, naiveCost - phaseA.costUsd).toFixed(2)),
      },
    };
  }

  // Module 4 — Phase B: Parallel Fan-Out (Devin 2 Patch + Devin 3 Visual QA on Ephemeral Preview)
  const previewBase = params.previewBaseUrl || params.targetUrl;
  const previewUrl = `${previewBase.replace(/\/$/, '')}${fallbackSpec.route}?preview=pr-${params.github.getNextPrCounter()}&healed=${fallbackSpec.id}`;

  const [devin2, devin3] = await Promise.all([
    runDevinPhaseBPatch(finalObservation, fallbackSpec),
    runDevinPhaseBVisualQA(finalObservation, fallbackSpec, previewUrl),
  ]);

  const totalCostUsd = Number((phaseA.costUsd + devin2.costUsd + devin3.costUsd).toFixed(2));
  const updatedBudget: BudgetState = {
    ...params.budget,
    spentUsd: Number((params.budget.spentUsd + totalCostUsd).toFixed(2)),
    runsUsed: params.budget.runsUsed + 1,
  };

  // Module 5 — Open Pull Request & Enforce Human Approval Gate ("Needs You")
  const pullRequest = await params.github.openPullRequest({
    spec: fallbackSpec,
    linearTicketId: linearTicket.id,
    incidentHash: decision.incidentHash,
    previewUrl,
    totalCostUsd,
    evidenceBefore: finalObservation.screenshotBefore ?? fallbackSpec.evidenceBefore,
    evidenceAfter: fallbackSpec.evidenceAfter,
  });

  params.linear.updateState(linearTicket.id, 'In Review');
  linearTicket.state = 'In Review';

  return {
    updatedBudget,
    result: {
      ...baseResult,
      linearTicket,
      phaseA,
      phaseB: {
        devin2,
        devin3,
        ranInParallel: true,
      },
      pullRequest,
      totalCostUsd,
      naiveCostUsd: naiveCost,
      costSavedUsd: Number(Math.max(0, naiveCost - totalCostUsd).toFixed(2)),
      finalStatus: pullRequest.requiresHumanApproval ? 'needs_human_approval' : 'approved_merged',
    },
  };
}
