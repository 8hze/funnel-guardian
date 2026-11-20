'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  LinearTicket,
  PipelineRunResult,
  PullRequestRecord,
} from '@funnel-guardian/orchestrator';
import {
  DEFAULT_BUDGET_STATE,
  FAULT_LIST,
  FAULT_SCENARIOS,
  type BudgetState,
  type DedupeRecord,
  type FaultId,
} from '@funnel-guardian/triage-gate';

type InspectorTab = 'trace' | 'approval' | 'ledger';

function formatOutcomeLabel(status: PipelineRunResult['finalStatus']): {
  label: string;
  tone: string;
} {
  switch (status) {
    case 'needs_human_approval':
      return {
        label: 'PR Ready · Needs You',
        tone: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
      };
    case 'approved_merged':
      return {
        label: 'Approved & Merged',
        tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
      };
    case 'filtered_noise':
      return {
        label: 'Dropped · 3rd-Party Noise ($0)',
        tone: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
      };
    case 'recovered_retry':
      return {
        label: 'Recovered on Retry ($0)',
        tone: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
      };
    case 'deduplicated':
      return {
        label: 'Deduplicated · 6h Cooldown ($0)',
        tone: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
      };
    case 'budget_capped':
      return {
        label: 'Paused · Hard Budget Cap ($0)',
        tone: 'border-red-500/40 bg-red-500/10 text-red-300',
      };
    case 'not_reproduced':
      return {
        label: 'Stopped at Phase A · No Repro',
        tone: 'border-stone-500/40 bg-stone-500/10 text-stone-300',
      };
    default:
      return {
        label: 'Healthy Flow',
        tone: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
      };
  }
}

export function MissionControl() {
  const [runs, setRuns] = useState<PipelineRunResult[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetState>({ ...DEFAULT_BUDGET_STATE });
  const [dedupeRecords, setDedupeRecords] = useState<DedupeRecord[]>([]);
  const [linearTickets, setLinearTickets] = useState<LinearTicket[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequestRecord[]>([]);
  const [healedFaults, setHealedFaults] = useState<FaultId[]>([]);

  const [isRunning, setIsRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>('trace');

  // Embedded live Sandbox Preview controls
  const [previewFault, setPreviewFault] = useState<FaultId>('checkout-mobile-overlap');
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [previewHealed, setPreviewHealed] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(1);

  const selectedRun = useMemo(() => {
    if (!runs.length) return null;
    return runs.find((r) => r.runId === selectedRunId) ?? runs[0];
  }, [runs, selectedRunId]);

  const activePR = useMemo(() => {
    if (selectedRun?.pullRequest) {
      return (
        pullRequests.find((p) => p.number === selectedRun.pullRequest?.number) ??
        selectedRun.pullRequest
      );
    }
    return pullRequests.find((p) => p.status === 'needs_approval') ?? pullRequests[0] ?? null;
  }, [selectedRun, pullRequests]);

  const metrics = useMemo(() => {
    const revenueBugsCaught = pullRequests.length;
    const noiseBlocked = runs.filter(
      (r) =>
        r.finalStatus === 'filtered_noise' ||
        r.finalStatus === 'recovered_retry' ||
        r.finalStatus === 'deduplicated' ||
        r.finalStatus === 'budget_capped'
    ).length;
    const totalSpent = runs.reduce((acc, r) => acc + r.totalCostUsd, 0);
    const naiveTotal = runs.reduce((acc, r) => acc + r.naiveCostUsd, 0);
    const saved = Math.max(0, naiveTotal - totalSpent);
    const pctSaved = naiveTotal > 0 ? Math.round((saved / naiveTotal) * 100) : 0;
    const pendingApprovals = pullRequests.filter((p) => p.status === 'needs_approval').length;
    return { revenueBugsCaught, noiseBlocked, totalSpent, naiveTotal, saved, pctSaved, pendingApprovals };
  }, [runs, pullRequests]);

  async function triggerProbe(options: { faultId?: FaultId; runAll?: boolean }) {
    if (isRunning) return;
    setIsRunning(true);
    setRunningLabel(
      options.runAll
        ? 'Executing all 5 synthetic scenarios (Browser Probe -> Triage Gate -> Staged Fan-Out)...'
        : `Running Browser Probe & Triage Gate for ${options.faultId ? FAULT_SCENARIOS[options.faultId].code : 'funnel'}...`
    );

    if (options.faultId) {
      const spec = FAULT_SCENARIOS[options.faultId];
      setPreviewFault(options.faultId);
      setPreviewViewport(spec.viewport);
      setPreviewHealed(false);
      setPreviewNonce((n) => n + 1);
    }

    try {
      const res = await fetch('/api/guardian/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faultId: options.faultId,
          runAll: options.runAll,
          budget,
          dedupeRecords,
          linearTickets,
          pullRequests,
        }),
      });

      const data = (await res.json()) as {
        results: PipelineRunResult[];
        budget: BudgetState;
        dedupeRecords: DedupeRecord[];
        linearTickets: LinearTicket[];
        pullRequests: PullRequestRecord[];
      };

      const incoming = data.results ?? [];
      setRuns((prev) => [...incoming.slice().reverse(), ...prev]);
      if (incoming.length > 0) {
        const latest = options.runAll ? incoming[0] : incoming[incoming.length - 1];
        setSelectedRunId(latest.runId);
        if (latest.pullRequest && !options.runAll) {
          setActiveTab('approval');
        } else {
          setActiveTab('trace');
        }
      }
      setBudget(data.budget);
      setDedupeRecords(data.dedupeRecords);
      setLinearTickets(data.linearTickets);
      setPullRequests(data.pullRequests);
    } finally {
      setIsRunning(false);
      setRunningLabel(null);
    }
  }

  async function handleApproval(pr: PullRequestRecord, decision: 'approve' | 'reject') {
    const res = await fetch('/api/guardian/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prNumber: pr.number,
        faultId: pr.faultId,
        decision,
      }),
    });

    if (!res.ok) return;
    const nowIso = new Date().toISOString();

    setPullRequests((prev) =>
      prev.map((item) =>
        item.number === pr.number
          ? {
              ...item,
              status: decision === 'approve' ? 'merged' : 'rejected',
              approvedAt: nowIso,
            }
          : item
      )
    );

    setLinearTickets((prev) =>
      prev.map((t) =>
        t.id === pr.linearTicketId
          ? { ...t, state: decision === 'approve' ? 'Done' : 'Canceled' }
          : t
      )
    );

    setRuns((prev) =>
      prev.map((r) =>
        r.pullRequest?.number === pr.number
          ? {
              ...r,
              finalStatus: decision === 'approve' ? 'approved_merged' : r.finalStatus,
              pullRequest: {
                ...r.pullRequest,
                status: decision === 'approve' ? 'merged' : 'rejected',
                approvedAt: nowIso,
              },
            }
          : r
      )
    );

    if (decision === 'approve') {
      setHealedFaults((prev) => Array.from(new Set([...prev, pr.faultId])));
      setPreviewFault(pr.faultId);
      setPreviewHealed(true);
      setPreviewNonce((n) => n + 1);
    }
  }

  function resetDemo() {
    setRuns([]);
    setSelectedRunId(null);
    setBudget({ ...DEFAULT_BUDGET_STATE });
    setDedupeRecords([]);
    setLinearTickets([]);
    setPullRequests([]);
    setHealedFaults([]);
    setPreviewFault('checkout-mobile-overlap');
    setPreviewViewport('mobile');
    setPreviewHealed(false);
    setPreviewNonce((n) => n + 1);
    setActiveTab('trace');
  }

  function inspectFaultLive(faultId: FaultId) {
    const spec = FAULT_SCENARIOS[faultId];
    setPreviewFault(faultId);
    setPreviewViewport(spec.viewport);
    setPreviewHealed(healedFaults.includes(faultId));
    setPreviewNonce((n) => n + 1);
  }

  const previewSpec = FAULT_SCENARIOS[previewFault];
  const previewPath =
    previewFault === 'oauth-broken-state'
      ? `/login${previewHealed ? `?healed=${previewFault}` : `?fault=${previewFault}`}`
      : `/checkout?plan=growth${previewHealed ? `&healed=${previewFault}` : `&fault=${previewFault}`}`;

  const pipelineSteps = useMemo(() => {
    const r = selectedRun;
    if (!r) {
      return [
        { num: '01', name: 'Browser Probe', state: 'idle', note: 'Playwright 24/7' },
        { num: '02', name: 'Triage Gate', state: 'idle', note: 'Domain · Retry · Cap' },
        { num: '03', name: 'Deduplication', state: 'idle', note: 'SHA-256 + Linear 6h' },
        { num: '04', name: 'Staged Fan-Out', state: 'idle', note: 'Devin 1 -> 2 + 3' },
        { num: '05', name: 'Human Approval', state: 'idle', note: 'PR + Needs You' },
      ];
    }

    const triageStopped = !r.triage.shouldTriggerAgents;
    const deduped = r.triage.action === 'drop_duplicate';
    const budgetBlocked = r.triage.action === 'blocked_budget_cap';

    return [
      {
        num: '01',
        name: 'Browser Probe',
        state: r.probe.passed ? 'ok' : 'alert',
        note: `${r.probe.viewport} · ${r.probe.errorType} (${r.probe.durationMs}ms)`,
      },
      {
        num: '02',
        name: 'Triage Gate',
        state:
          r.triage.action === 'drop_third_party_noise' || r.triage.action === 'recovered_on_retry'
            ? 'filtered'
            : budgetBlocked
              ? 'blocked'
              : 'ok',
        note:
          r.triage.action === 'drop_third_party_noise'
            ? 'Dropped 3rd-party noise ($0)'
            : r.triage.action === 'recovered_on_retry'
              ? `Recovered retry #${r.triage.retriesExecuted} ($0)`
              : budgetBlocked
                ? 'Hard budget cap reached'
                : 'Confirmed 1st-party bug',
      },
      {
        num: '03',
        name: 'Deduplication',
        state: deduped ? 'filtered' : triageStopped ? 'skipped' : 'ok',
        note: deduped
          ? `Hit ${r.triage.existingLinearTicketId} (6h)`
          : triageStopped
            ? 'Skipped (filtered upstream)'
            : `${r.triage.incidentHash} -> ${r.linearTicket?.id ?? 'Linear'}`,
      },
      {
        num: '04',
        name: 'Staged Fan-Out',
        state: r.phaseB ? 'ok' : r.phaseA ? 'alert' : 'skipped',
        note: r.phaseB
          ? `Devin 1 FAIL -> 2+3 PASS ($${r.totalCostUsd.toFixed(2)})`
          : triageStopped
            ? '0 agents launched ($0.00)'
            : 'Phase A only',
      },
      {
        num: '05',
        name: 'Human Approval',
        state:
          r.finalStatus === 'approved_merged'
            ? 'ok'
            : r.finalStatus === 'needs_human_approval'
              ? 'pending'
              : 'skipped',
        note:
          r.finalStatus === 'approved_merged'
            ? `PR #${r.pullRequest?.number} Merged`
            : r.pullRequest
              ? `PR #${r.pullRequest.number} · ${r.pullRequest.sensitiveArea}`
              : 'No PR needed',
      },
    ];
  }, [selectedRun]);

  return (
    <div className="min-h-screen bg-[#0C0D0F] text-[#F0F1F4]">
      {/* Top Ops Command Header */}
      <header className="sticky top-0 z-30 border-b border-[#1E222A] bg-[#0C0D0F]/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#E05A2B]" />
              <span className="font-mono-tech text-xs font-semibold uppercase tracking-[0.16em]">
                Funnel Guardian
              </span>
            </Link>
            <span className="hidden h-4 w-px bg-[#242830] sm:inline-block" />
            <div className="hidden flex-wrap items-center gap-2 font-mono-tech text-[10px] uppercase tracking-wider text-[#9AA0AE] lg:flex">
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Prod: Read-Only
              </span>
              <span className="rounded border border-[#262A34] bg-[#14171D] px-2 py-0.5">
                Patches: Preview Only
              </span>
              <span className="rounded border border-[#262A34] bg-[#14171D] px-2 py-0.5">
                Stripe: Test Mode
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => triggerProbe({ runAll: true })}
              className="rounded bg-[#E05A2B] px-3.5 py-1.5 font-mono-tech text-xs font-semibold text-[#0C0D0F] hover:bg-[#C94D21] disabled:opacity-50"
            >
              {isRunning ? 'Running Pipeline...' : 'Run All 5 Scenarios'}
            </button>
            <button
              type="button"
              onClick={resetDemo}
              className="rounded border border-[#2A2F3B] bg-[#14171D] px-3 py-1.5 font-mono-tech text-xs text-[#C6CAD3] hover:border-[#424959]"
            >
              Reset Session
            </button>
            <Link
              href="/checkout"
              target="_blank"
              className="rounded border border-[#2A2F3B] px-3 py-1.5 font-mono-tech text-xs text-[#9AA0AE] hover:text-[#F0F1F4]"
            >
              Sandbox App -&gt;
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-5 py-5">
        {isRunning && runningLabel && (
          <div className="flex items-center gap-3 rounded-md border border-[#E05A2B]/40 bg-[#E05A2B]/10 px-4 py-2.5 font-mono-tech text-xs text-[#F5B097]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#E05A2B]/40 border-t-[#E05A2B]" />
            <span>{runningLabel}</span>
          </div>
        )}

        {/* 5-Module Pipeline Visualizer */}
        <section className="rounded-md border border-[#22262F] bg-[#121418] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2.5">
              <h1 className="font-mono-tech text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9AA0AE]">
                Active Pipeline Trajectory
              </h1>
              {selectedRun && (
                <span className="font-mono-tech text-xs text-[#F0F1F4]">
                  [{selectedRun.scenarioCode}] {selectedRun.scenarioTitle}
                </span>
              )}
            </div>
            {selectedRun && (
              <span
                className={`rounded border px-2 py-0.5 font-mono-tech text-[11px] ${formatOutcomeLabel(selectedRun.finalStatus).tone}`}
              >
                {formatOutcomeLabel(selectedRun.finalStatus).label}
              </span>
            )}
          </div>

          <div className="grid gap-2.5 md:grid-cols-5">
            {pipelineSteps.map((step) => {
              const borderClass =
                step.state === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                  : step.state === 'filtered'
                    ? 'border-sky-500/40 bg-sky-500/[0.07]'
                    : step.state === 'pending'
                      ? 'border-amber-500/50 bg-amber-500/[0.08]'
                      : step.state === 'alert' || step.state === 'blocked'
                        ? 'border-red-500/40 bg-red-500/[0.07]'
                        : 'border-[#232731] bg-[#161920]/70';

              const dotClass =
                step.state === 'ok'
                  ? 'bg-emerald-400'
                  : step.state === 'filtered'
                    ? 'bg-sky-400'
                    : step.state === 'pending'
                      ? 'bg-amber-400'
                      : step.state === 'alert' || step.state === 'blocked'
                        ? 'bg-red-400'
                        : 'bg-[#4B5160]';

              return (
                <div key={step.num} className={`rounded border px-3.5 py-2.5 ${borderClass}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tech text-[10px] text-[#8A909E]">
                      MODULE {step.num}
                    </span>
                    <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#F0F1F4]">{step.name}</p>
                  <p className="mt-1 truncate font-mono-tech text-[11px] text-[#A2A8B6]">
                    {step.note}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Economics & Guardrail Telemetry Strip */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[#22262F] bg-[#121418] p-4">
            <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
              Revenue Bugs Patched
            </p>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="font-mono-tech text-2xl font-semibold text-[#F0F1F4]">
                {metrics.revenueBugsCaught}
              </span>
              <span className="font-mono-tech text-[11px] text-amber-400">
                {metrics.pendingApprovals} awaiting approval
              </span>
            </div>
          </div>

          <div className="rounded-md border border-[#22262F] bg-[#121418] p-4">
            <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
              Noise / Dupes Suppressed
            </p>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="font-mono-tech text-2xl font-semibold text-emerald-400">
                {metrics.noiseBlocked}
              </span>
              <span className="font-mono-tech text-[11px] text-[#8A909E]">
                $0.00 agent credits burned
              </span>
            </div>
          </div>

          <div className="rounded-md border border-[#22262F] bg-[#121418] p-4">
            <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
              Spend vs. Naive Bot
            </p>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="font-mono-tech text-2xl font-semibold text-[#F0F1F4]">
                ${metrics.totalSpent.toFixed(2)}
              </span>
              <span className="font-mono-tech text-[11px] text-emerald-400">
                {metrics.naiveTotal > 0
                  ? `-${metrics.pctSaved}% vs $${metrics.naiveTotal.toFixed(2)}`
                  : 'Run probe to measure'}
              </span>
            </div>
          </div>

          <div className="rounded-md border border-[#22262F] bg-[#121418] p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
                Nightly Budget Cap
              </p>
              <select
                aria-label="Nightly budget cap"
                value={budget.dailyCapUsd}
                onChange={(e) => {
                  const cap = Number(e.target.value);
                  setBudget((b) => ({
                    ...b,
                    dailyCapUsd: cap,
                    maxRunsPerNight: cap <= 2 ? 1 : 6,
                  }));
                }}
                className="rounded border border-[#2A2F3B] bg-[#0C0D0F] px-1.5 py-0.5 font-mono-tech text-[10px] text-[#D4D7DF]"
              >
                <option value={10}>$10.00 / 6 runs</option>
                <option value={3}>$3.00 / 6 runs</option>
                <option value={1}>$1.00 / 1 run (test cap)</option>
              </select>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#22262F]">
              <div
                className={`h-full transition-all ${
                  budget.spentUsd >= budget.dailyCapUsd ? 'bg-red-500' : 'bg-[#E05A2B]'
                }`}
                style={{
                  width: `${Math.min(100, Math.round((budget.spentUsd / Math.max(0.01, budget.dailyCapUsd)) * 100))}%`,
                }}
              />
            </div>
            <p className="mt-1.5 font-mono-tech text-[11px] text-[#9AA0AE]">
              ${budget.spentUsd.toFixed(2)} / ${budget.dailyCapUsd.toFixed(2)} · {budget.runsUsed}/
              {budget.maxRunsPerNight} runs
            </p>
          </div>
        </section>

        {/* Main 2-Column Split: Fault Injection & Live Preview (Left) + Deep Run Inspector (Right) */}
        <div className="grid gap-5 lg:grid-cols-12">
          {/* LEFT COLUMN (5 cols) */}
          <div className="space-y-5 lg:col-span-5">
            {/* Fault Injection Deck */}
            <section className="rounded-md border border-[#22262F] bg-[#121418]">
              <div className="flex items-center justify-between border-b border-[#1E222A] px-4 py-3">
                <div>
                  <h2 className="font-mono-tech text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D4D7DF]">
                    Fault Injection Deck (5 Synthetic Scenarios)
                  </h2>
                  <p className="mt-0.5 text-[11px] text-[#8A909E]">
                    Click Run Probe twice on any revenue bug to demonstrate 6h Deduplication.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[#1E222A]">
                {FAULT_LIST.map((fault) => {
                  const isHealed = healedFaults.includes(fault.id);
                  const latestForFault = runs.find((r) => r.faultId === fault.id);
                  const isSelected = selectedRun?.faultId === fault.id;
                  return (
                    <div
                      key={fault.id}
                      onClick={() => {
                        if (latestForFault) {
                          setSelectedRunId(latestForFault.runId);
                        }
                      }}
                      className={`px-4 py-3 transition-colors ${
                        latestForFault ? 'cursor-pointer' : ''
                      } ${isSelected ? 'bg-[#181C24]' : 'hover:bg-[#161920]/70'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono-tech text-[11px] font-semibold text-[#E05A2B]">
                              {fault.code}
                            </span>
                            <span
                              className={
                                fault.category === 'revenue-bug'
                                  ? 'rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono-tech text-[9px] uppercase text-red-300'
                                  : 'rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono-tech text-[9px] uppercase text-emerald-300'
                              }
                            >
                              {fault.category === 'revenue-bug' ? 'Revenue Bug' : 'Noise Trap'}
                            </span>
                            <span className="font-mono-tech text-[10px] text-[#7D8391]">
                              {fault.viewport} · {fault.route}
                            </span>
                            {isHealed && (
                              <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono-tech text-[9px] uppercase text-emerald-300">
                                Healed
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs font-medium text-[#F0F1F4]">{fault.title}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-[#8A909E]">
                            {fault.revenueImpact}
                          </p>
                          {latestForFault && (
                            <p className="mt-1.5 font-mono-tech text-[10px] text-[#A9AFBD]">
                              Last: {formatOutcomeLabel(latestForFault.finalStatus).label}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerProbe({ faultId: fault.id });
                            }}
                            className="rounded border border-[#E05A2B]/60 bg-[#E05A2B]/15 px-2.5 py-1 font-mono-tech text-[11px] font-medium text-[#F6B49B] hover:bg-[#E05A2B] hover:text-[#0C0D0F] disabled:opacity-50"
                          >
                            Run Probe
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              inspectFaultLive(fault.id);
                            }}
                            className="rounded border border-[#2B303B] bg-[#181B22] px-2.5 py-1 font-mono-tech text-[10px] text-[#9AA0AE] hover:text-[#F0F1F4]"
                          >
                            Preview UI
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Live Sandbox Preview Frame */}
            <section className="rounded-md border border-[#22262F] bg-[#121418]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E222A] px-4 py-2.5">
                <div>
                  <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-[#D4D7DF]">
                    Live Sandbox Target ({previewSpec.code})
                  </span>
                  <span className="ml-2 font-mono-tech text-[10px] text-[#8A909E]">
                    {previewPath}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono-tech text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    className={`rounded px-2 py-1 ${
                      previewViewport === 'mobile'
                        ? 'bg-[#E05A2B] text-[#0C0D0F]'
                        : 'border border-[#2B303B] text-[#9AA0AE]'
                    }`}
                  >
                    Mobile 390px
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    className={`rounded px-2 py-1 ${
                      previewViewport === 'desktop'
                        ? 'bg-[#E05A2B] text-[#0C0D0F]'
                        : 'border border-[#2B303B] text-[#9AA0AE]'
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewHealed((h) => !h);
                      setPreviewNonce((n) => n + 1);
                    }}
                    className={`rounded border px-2 py-1 ${
                      previewHealed
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {previewHealed ? 'State: Patched' : 'State: Faulty'}
                  </button>
                </div>
              </div>

              <div className="flex justify-center bg-[#090A0C] p-4">
                <div
                  className={`overflow-hidden rounded border border-[#2B303B] bg-[#F7F6F2] transition-all ${
                    previewViewport === 'mobile' ? 'w-[390px]' : 'w-full'
                  }`}
                >
                  <iframe
                    key={`${previewPath}-${previewNonce}`}
                    src={previewPath}
                    title="LedgerFlow Live Sandbox Preview"
                    className="h-[460px] w-full border-0"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN (7 cols): Deep Inspector */}
          <div className="lg:col-span-7">
            <section className="rounded-md border border-[#22262F] bg-[#121418]">
              {/* Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E222A] px-4 py-2.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('trace')}
                    className={`rounded px-3 py-1.5 font-mono-tech text-xs ${
                      activeTab === 'trace'
                        ? 'bg-[#1F232C] font-semibold text-[#F0F1F4]'
                        : 'text-[#8A909E] hover:text-[#F0F1F4]'
                    }`}
                  >
                    Pipeline Trace & Agents
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('approval')}
                    className={`flex items-center gap-2 rounded px-3 py-1.5 font-mono-tech text-xs ${
                      activeTab === 'approval'
                        ? 'bg-[#1F232C] font-semibold text-[#F0F1F4]'
                        : 'text-[#8A909E] hover:text-[#F0F1F4]'
                    }`}
                  >
                    <span>Needs You (PR Approval)</span>
                    {metrics.pendingApprovals > 0 && (
                      <span className="rounded bg-amber-500 px-1.5 py-0.2 font-mono-tech text-[10px] font-bold text-[#0C0D0F]">
                        {metrics.pendingApprovals}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ledger')}
                    className={`rounded px-3 py-1.5 font-mono-tech text-xs ${
                      activeTab === 'ledger'
                        ? 'bg-[#1F232C] font-semibold text-[#F0F1F4]'
                        : 'text-[#8A909E] hover:text-[#F0F1F4]'
                    }`}
                  >
                    Incident Ledger ({runs.length})
                  </button>
                </div>

                {selectedRun && (
                  <span className="font-mono-tech text-[11px] text-[#7D8391]">
                    Hash: {selectedRun.triage.incidentHash}
                  </span>
                )}
              </div>

              {/* TAB 1: Pipeline Trace & Staged Fan-Out */}
              {activeTab === 'trace' && (
                <div className="p-5">
                  {!selectedRun ? (
                    <div className="rounded border border-dashed border-[#2A2F3B] bg-[#0F1115] px-6 py-12 text-center">
                      <p className="font-mono-tech text-xs uppercase tracking-widest text-[#E05A2B]">
                        Ready for Adversarial Probe
                      </p>
                      <h3 className="mt-2 font-editorial text-3xl text-[#F0F1F4]">
                        Trigger a fault scenario or run the full 5-scenario benchmark.
                      </h3>
                      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#8A909E]">
                        Start with F-04 (3rd-party analytics 500) or F-05 (transient 504) to watch
                        the Triage Gate reject false positives at $0.00, then run F-01 (mobile
                        checkout overlap) to watch Staged Fan-Out deliver a verified PR.
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => triggerProbe({ faultId: 'checkout-mobile-overlap' })}
                          className="rounded bg-[#E05A2B] px-4 py-2 font-mono-tech text-xs font-semibold text-[#0C0D0F]"
                        >
                          Run F-01 (Mobile Overlap Bug)
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerProbe({ faultId: 'third-party-analytics-500' })}
                          className="rounded border border-[#2D3340] bg-[#161920] px-4 py-2 font-mono-tech text-xs text-[#D4D7DF]"
                        >
                          Run F-04 (3rd-Party Noise Trap)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {/* Module 1: Probe Summary */}
                      <div className="rounded border border-[#242830] bg-[#0F1115] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#E05A2B]">
                            01 · Browser Probe Observation
                          </span>
                          <span className="font-mono-tech text-[11px] text-[#8A909E]">
                            {selectedRun.probe.engineMode} · {selectedRun.probe.viewport} ·{' '}
                            {selectedRun.probe.durationMs}ms
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-[#F0F1F4]">
                          {selectedRun.probe.summary}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2 font-mono-tech text-[11px]">
                          <div className="rounded border border-[#1E222A] bg-[#14171D] px-3 py-2">
                            <span className="text-[#7D8391]">Route</span>
                            <p className="mt-0.5 truncate text-[#D4D7DF]">
                              {selectedRun.probe.route}
                            </p>
                          </div>
                          <div className="rounded border border-[#1E222A] bg-[#14171D] px-3 py-2">
                            <span className="text-[#7D8391]">Error Type</span>
                            <p className="mt-0.5 truncate text-[#D4D7DF]">
                              {selectedRun.probe.errorType}
                            </p>
                          </div>
                          <div className="rounded border border-[#1E222A] bg-[#14171D] px-3 py-2">
                            <span className="text-[#7D8391]">Target Selector / API</span>
                            <p className="mt-0.5 truncate text-[#D4D7DF]">
                              {selectedRun.probe.selectorOrEndpoint}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Module 2 & 3: Triage Gate Filter Stages */}
                      <div className="rounded border border-[#242830] bg-[#0F1115] p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#E05A2B]">
                            02 & 03 · Triage Gate & Deduplication Filters
                          </span>
                          <span className="font-mono-tech text-[11px] text-emerald-400">
                            {selectedRun.costSavedUsd > 0
                              ? `Saved $${selectedRun.costSavedUsd.toFixed(2)} vs Naive Bot`
                              : 'Escalated to Phase A'}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {selectedRun.triage.stages.map((st, idx) => (
                            <div
                              key={`${st.stage}-${idx}`}
                              className="flex items-start justify-between gap-3 rounded border border-[#1E222A] bg-[#14171D] px-3.5 py-2.5"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono-tech text-[11px] font-semibold uppercase text-[#D4D7DF]">
                                    {st.stage.replace('_', ' ')}
                                  </span>
                                  <span
                                    className={`rounded px-1.5 py-0.5 font-mono-tech text-[9px] uppercase ${
                                      st.outcome === 'passed'
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : st.outcome === 'recovered' || st.outcome === 'dropped'
                                          ? 'bg-sky-500/15 text-sky-300'
                                          : 'bg-red-500/15 text-red-300'
                                    }`}
                                  >
                                    {st.outcome}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-[#A2A8B6]">{st.reason}</p>
                              </div>
                              <span className="shrink-0 font-mono-tech text-[10px] text-[#7D8391]">
                                {st.durationMs}ms
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Module 4: Staged Fan-Out */}
                      {selectedRun.phaseA ? (
                        <div className="space-y-3 rounded border border-[#242830] bg-[#0F1115] p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#E05A2B]">
                              04 · Staged Fan-Out (Devin 1 -&gt; Parallel Devin 2 + Devin 3)
                            </span>
                            <span className="font-mono-tech text-[11px] text-[#D4D7DF]">
                              Total Run Cost: ${selectedRun.totalCostUsd.toFixed(2)}
                            </span>
                          </div>

                          {/* Phase A */}
                          <div className="rounded border border-[#252A35] bg-[#14171D] p-3.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono-tech text-xs font-semibold text-[#F0F1F4]">
                                Phase A · {selectedRun.phaseA.agent}
                              </span>
                              <span className="rounded border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 font-mono-tech text-[10px] text-amber-300">
                                {selectedRun.phaseA.status === 'reproduced_fail'
                                  ? '2/2 FAIL CONFIRMED'
                                  : 'NOT REPRODUCED'}{' '}
                                · ${selectedRun.phaseA.costUsd.toFixed(2)}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs text-[#A2A8B6]">
                              {selectedRun.phaseA.summary}
                            </p>
                            {selectedRun.phaseA.artifactContent && (
                              <pre className="mt-2.5 max-h-44 overflow-auto rounded border border-[#20242E] bg-[#0A0B0D] p-3 font-mono-tech text-[11px] leading-relaxed text-[#CBD0DC]">
                                {selectedRun.phaseA.artifactContent}
                              </pre>
                            )}
                          </div>

                          {/* Phase B Parallel */}
                          {selectedRun.phaseB && (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded border border-[#252A35] bg-[#14171D] p-3.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono-tech text-xs font-semibold text-[#F0F1F4]">
                                    Phase B1 · {selectedRun.phaseB.devin2.agent}
                                  </span>
                                  <span className="font-mono-tech text-[10px] text-emerald-400">
                                    PASS · ${selectedRun.phaseB.devin2.costUsd.toFixed(2)}
                                  </span>
                                </div>
                                <ul className="mt-2 space-y-1 font-mono-tech text-[10px] text-[#9AA0AE]">
                                  {selectedRun.phaseB.devin2.logs.map((line, i) => (
                                    <li key={i}>{line}</li>
                                  ))}
                                </ul>
                              </div>

                              <div className="rounded border border-[#252A35] bg-[#14171D] p-3.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono-tech text-xs font-semibold text-[#F0F1F4]">
                                    Phase B2 · {selectedRun.phaseB.devin3.agent}
                                  </span>
                                  <span className="font-mono-tech text-[10px] text-emerald-400">
                                    PASS · ${selectedRun.phaseB.devin3.costUsd.toFixed(2)}
                                  </span>
                                </div>
                                <ul className="mt-2 space-y-1 font-mono-tech text-[10px] text-[#9AA0AE]">
                                  {selectedRun.phaseB.devin3.logs.map((line, i) => (
                                    <li key={i}>{line}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}

                          {selectedRun.pullRequest && (
                            <div className="flex items-center justify-between rounded border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                              <span className="text-xs text-amber-200">
                                PR #{selectedRun.pullRequest.number} passed CI/CD and is waiting at
                                the Human Approval Gate ({selectedRun.pullRequest.sensitiveArea}).
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveTab('approval')}
                                className="rounded bg-amber-400 px-3 py-1 font-mono-tech text-xs font-semibold text-[#0C0D0F]"
                              >
                                Review PR -&gt;
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                          <p className="font-mono-tech text-xs font-semibold text-emerald-300">
                            Zero Devin Agents Spawned · Budget Protected ($0.00 spent)
                          </p>
                          <p className="mt-1 text-xs text-[#B5BBC8]">{selectedRun.triage.reason}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Module 5 — Human Approval ("Needs You") Gate */}
              {activeTab === 'approval' && (
                <div className="p-5">
                  {!activePR ? (
                    <div className="rounded border border-dashed border-[#2A2F3B] bg-[#0F1115] px-6 py-12 text-center">
                      <p className="font-mono-tech text-xs uppercase tracking-widest text-[#8A909E]">
                        No Pull Requests Waiting
                      </p>
                      <p className="mt-2 text-xs text-[#9AA0AE]">
                        Run a revenue bug scenario (F-01, F-02, or F-03) to generate a verified PR
                        with before/after Playwright evidence and unified diff.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {/* PR selector if multiple PRs exist */}
                      {pullRequests.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          {pullRequests.map((pr) => (
                            <button
                              key={pr.number}
                              type="button"
                              onClick={() => {
                                const matching = runs.find(
                                  (r) => r.pullRequest?.number === pr.number
                                );
                                if (matching) setSelectedRunId(matching.runId);
                              }}
                              className={`rounded border px-2.5 py-1 font-mono-tech text-[11px] ${
                                activePR.number === pr.number
                                  ? 'border-[#E05A2B] bg-[#E05A2B]/15 text-[#F6B49B]'
                                  : 'border-[#252A35] bg-[#14171D] text-[#9AA0AE]'
                              }`}
                            >
                              PR #{pr.number} ({pr.status})
                            </button>
                          ))}
                        </div>
                      )}

                      {/* PR Header & Approve/Reject Bar */}
                      <div className="rounded border border-[#282D38] bg-[#0F1115] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono-tech text-xs font-semibold text-[#E05A2B]">
                                PR #{activePR.number}
                              </span>
                              <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-amber-300">
                                Sensitive: {activePR.sensitiveArea}
                              </span>
                              <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-emerald-300">
                                CI/CD Passing
                              </span>
                              <span className="font-mono-tech text-[10px] text-[#8A909E]">
                                Linear {activePR.linearTicketId}
                              </span>
                            </div>
                            <h3 className="mt-2 text-base font-semibold text-[#F0F1F4]">
                              {activePR.title}
                            </h3>
                            <p className="mt-1 font-mono-tech text-[11px] text-[#8A909E]">
                              Branch: {activePR.branch} · Cost: ${activePR.totalCostUsd.toFixed(2)}{' '}
                              (vs ${activePR.naiveCostUsd.toFixed(2)} naive)
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {activePR.status === 'needs_approval' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApproval(activePR, 'approve')}
                                  className="rounded bg-emerald-500 px-3.5 py-2 font-mono-tech text-xs font-semibold text-[#0C0D0F] hover:bg-emerald-400"
                                >
                                  Approve & Merge PR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApproval(activePR, 'reject')}
                                  className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono-tech text-xs text-red-300 hover:bg-red-500/20"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span
                                className={`rounded border px-3 py-1.5 font-mono-tech text-xs font-semibold uppercase ${
                                  activePR.status === 'merged'
                                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                    : 'border-red-500/40 bg-red-500/15 text-red-300'
                                }`}
                              >
                                {activePR.status === 'merged'
                                  ? 'Merged · Fault Healed in Sandbox'
                                  : 'Rejected by Reviewer'}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="mt-3 border-t border-[#1E222A] pt-3 text-xs leading-relaxed text-[#A2A8B6]">
                          <strong className="text-[#E5E7EC]">Root Cause:</strong>{' '}
                          {activePR.rootCause}
                        </p>
                      </div>

                      {/* Real Playwright Before / After Screenshots */}
                      <div>
                        <p className="mb-2 font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
                          Devin-3 Visual QA Evidence (Real Chromium Playwright Captures)
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <figure className="overflow-hidden rounded border border-red-500/30 bg-[#0A0B0D]">
                            <figcaption className="flex items-center justify-between border-b border-[#1E222A] bg-[#14171D] px-3 py-1.5 font-mono-tech text-[10px] uppercase text-red-300">
                              <span>Before Patch (FAIL)</span>
                              <span>Fault Active</span>
                            </figcaption>
                            <img
                              src={activePR.evidenceBefore}
                              alt="Before patch Playwright capture"
                              className="h-64 w-full object-contain bg-[#090A0C] p-1"
                            />
                          </figure>
                          <figure className="overflow-hidden rounded border border-emerald-500/30 bg-[#0A0B0D]">
                            <figcaption className="flex items-center justify-between border-b border-[#1E222A] bg-[#14171D] px-3 py-1.5 font-mono-tech text-[10px] uppercase text-emerald-300">
                              <span>After Patch (PASS)</span>
                              <span>Ephemeral Preview</span>
                            </figcaption>
                            <img
                              src={activePR.evidenceAfter}
                              alt="After patch Playwright capture"
                              className="h-64 w-full object-contain bg-[#090A0C] p-1"
                            />
                          </figure>
                        </div>
                      </div>

                      {/* Unified Git Diff */}
                      <div>
                        <div className="mb-1.5 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
                          <span>Unified Patch Diff ({activePR.patchFile})</span>
                          <span>Regression Spec: {activePR.reproTestFilename}</span>
                        </div>
                        <pre className="overflow-x-auto rounded border border-[#22262F] bg-[#0A0B0D] p-3.5 font-mono-tech text-[11px] leading-relaxed">
                          {activePR.patchDiff.split('\n').map((line, i) => (
                            <div
                              key={i}
                              className={
                                line.startsWith('+') && !line.startsWith('+++')
                                  ? 'bg-emerald-500/10 text-emerald-300'
                                  : line.startsWith('-') && !line.startsWith('---')
                                    ? 'bg-red-500/10 text-red-300'
                                    : line.startsWith('@@')
                                      ? 'text-sky-300'
                                      : 'text-[#A2A8B6]'
                              }
                            >
                              {line}
                            </div>
                          ))}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Incident Ledger & Linear Dedupe Queue */}
              {activeTab === 'ledger' && (
                <div className="p-5">
                  {runs.length === 0 ? (
                    <p className="py-10 text-center font-mono-tech text-xs text-[#8A909E]">
                      No probe runs recorded yet in this session.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      <div className="overflow-x-auto rounded border border-[#22262F]">
                        <table className="w-full text-left font-mono-tech text-[11px]">
                          <thead className="border-b border-[#22262F] bg-[#161920] text-[10px] uppercase text-[#8A909E]">
                            <tr>
                              <th className="px-3 py-2.5">Code</th>
                              <th className="px-3 py-2.5">Hash</th>
                              <th className="px-3 py-2.5">Outcome</th>
                              <th className="px-3 py-2.5">Linear</th>
                              <th className="px-3 py-2.5 text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1E222A]">
                            {runs.map((r) => (
                              <tr
                                key={r.runId}
                                onClick={() => {
                                  setSelectedRunId(r.runId);
                                  setActiveTab('trace');
                                }}
                                className="cursor-pointer hover:bg-[#171A21]"
                              >
                                <td className="px-3 py-2.5 text-[#E05A2B]">{r.scenarioCode}</td>
                                <td className="px-3 py-2.5 text-[#A2A8B6]">
                                  {r.triage.incidentHash}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[10px] ${formatOutcomeLabel(r.finalStatus).tone}`}
                                  >
                                    {formatOutcomeLabel(r.finalStatus).label}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-[#D4D7DF]">
                                  {r.linearTicket?.id ??
                                    r.triage.existingLinearTicketId ??
                                    '-'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[#F0F1F4]">
                                  ${r.totalCostUsd.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {linearTickets.length > 0 && (
                        <div>
                          <p className="mb-2 font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
                            Linear Deduplication Queue ({linearTickets.length} issues)
                          </p>
                          <div className="space-y-1.5">
                            {linearTickets.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center justify-between rounded border border-[#22262F] bg-[#0F1115] px-3.5 py-2 font-mono-tech text-xs"
                              >
                                <div>
                                  <span className="font-semibold text-[#E05A2B]">{t.id}</span>
                                  <span className="ml-2.5 text-[#E5E7EC]">{t.title}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px]">
                                  <span className="text-[#7D8391]">{t.hash}</span>
                                  <span className="rounded border border-[#2B303B] bg-[#161920] px-2 py-0.5 text-[#D4D7DF]">
                                    {t.state}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
