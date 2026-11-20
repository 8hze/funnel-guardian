'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

export interface OperatorProfile {
  id: string;
  email: string;
  fullName: string;
  organization: string;
  role: string;
}

type WorkspaceView = 'command' | 'approvals' | 'ledger' | 'sandbox';

interface RateLimitState {
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

function formatOutcome(status: PipelineRunResult['finalStatus']): {
  label: string;
  tone: string;
} {
  switch (status) {
    case 'needs_human_approval':
      return {
        label: 'PR Ready · Needs Approval',
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
        label: 'Auto-Recovered Retry ($0)',
        tone: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
      };
    case 'deduplicated':
      return {
        label: 'Deduplicated · 6h Cooldown ($0)',
        tone: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
      };
    case 'budget_capped':
      return {
        label: 'Blocked · Hard Budget Cap ($0)',
        tone: 'border-red-500/40 bg-red-500/10 text-red-300',
      };
    case 'not_reproduced':
      return {
        label: 'Halted at Phase A · No Repro',
        tone: 'border-stone-500/40 bg-stone-500/10 text-stone-300',
      };
    default:
      return {
        label: 'Healthy Flow',
        tone: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
      };
  }
}

export function MissionControl({ operator }: { operator: OperatorProfile }) {
  const router = useRouter();
  const [view, setView] = useState<WorkspaceView>('command');
  const [runs, setRuns] = useState<PipelineRunResult[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetState>({ ...DEFAULT_BUDGET_STATE });
  const [dedupeRecords, setDedupeRecords] = useState<DedupeRecord[]>([]);
  const [linearTickets, setLinearTickets] = useState<LinearTicket[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequestRecord[]>([]);
  const [healedFaults, setHealedFaults] = useState<FaultId[]>([]);

  const [isRunning, setIsRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [apiRateLimit, setApiRateLimit] = useState<RateLimitState>({
    limit: 30,
    remaining: 30,
    retryAfterSec: 0,
  });

  // Embedded live target state
  const [previewFault, setPreviewFault] = useState<FaultId>('checkout-mobile-overlap');
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [previewHealed, setPreviewHealed] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(1);

  const initials = useMemo(() => {
    const parts = operator.fullName.trim().split(/\s+/);
    return ((parts[0]?.[0] || 'O') + (parts[1]?.[0] || '')).toUpperCase();
  }, [operator.fullName]);

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
    return {
      revenueBugsCaught,
      noiseBlocked,
      totalSpent,
      naiveTotal,
      saved,
      pctSaved,
      pendingApprovals,
    };
  }, [runs, pullRequests]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } finally {
      router.push('/auth');
      router.refresh();
    }
  }

  async function triggerProbe(options: { faultId?: FaultId; runAll?: boolean }) {
    if (isRunning) return;
    setIsRunning(true);
    setApiError(null);
    setRunningLabel(
      options.runAll
        ? 'Executing full 5-scenario benchmark across Browser Probe, Triage Gate & Staged Fan-Out...'
        : `Executing Browser Probe & Triage Gate for ${options.faultId ? FAULT_SCENARIOS[options.faultId].code : 'funnel'}...`
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

      if (res.status === 401) {
        router.push('/auth?next=/guardian&required=1');
        return;
      }

      const data = (await res.json()) as {
        error?: string;
        rateLimit?: RateLimitState;
        results?: PipelineRunResult[];
        budget?: BudgetState;
        dedupeRecords?: DedupeRecord[];
        linearTickets?: LinearTicket[];
        pullRequests?: PullRequestRecord[];
      };

      if (data.rateLimit) {
        setApiRateLimit(data.rateLimit);
      }

      if (!res.ok) {
        setApiError(data.error || `Probe execution failed (HTTP ${res.status})`);
        return;
      }

      const incoming = data.results ?? [];
      setRuns((prev) => [...incoming.slice().reverse(), ...prev]);
      if (incoming.length > 0) {
        const picked = options.runAll ? incoming[0] : incoming[incoming.length - 1];
        setSelectedRunId(picked.runId);
      }
      if (data.budget) setBudget(data.budget);
      if (data.dedupeRecords) setDedupeRecords(data.dedupeRecords);
      if (data.linearTickets) setLinearTickets(data.linearTickets);
      if (data.pullRequests) setPullRequests(data.pullRequests);
    } catch {
      setApiError('Network error communicating with Mission Control API.');
    } finally {
      setIsRunning(false);
      setRunningLabel(null);
    }
  }

  async function handleApproval(pr: PullRequestRecord, decision: 'approve' | 'reject') {
    setApiError(null);
    const res = await fetch('/api/guardian/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prNumber: pr.number,
        faultId: pr.faultId,
        decision,
      }),
    });

    if (res.status === 401) {
      router.push('/auth?next=/guardian&required=1');
      return;
    }

    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      rateLimit?: RateLimitState;
    };
    if (payload.rateLimit) setApiRateLimit(payload.rateLimit);
    if (!res.ok) {
      setApiError(payload.error || 'Approval action failed.');
      return;
    }

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
    setApiError(null);
    setPreviewFault('checkout-mobile-overlap');
    setPreviewViewport('mobile');
    setPreviewHealed(false);
    setPreviewNonce((n) => n + 1);
    setView('command');
  }

  function loadPreview(faultId: FaultId) {
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
        { num: '03', name: 'Deduplication', state: 'idle', note: 'SHA-256 + Linear' },
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
            ? 'Dropped 3rd-party ($0)'
            : r.triage.action === 'recovered_on_retry'
              ? `Recovered retry #${r.triage.retriesExecuted}`
              : budgetBlocked
                ? 'Hard cap blocked'
                : '1st-party confirmed',
      },
      {
        num: '03',
        name: 'Deduplication',
        state: deduped ? 'filtered' : triageStopped ? 'skipped' : 'ok',
        note: deduped
          ? `Hit ${r.triage.existingLinearTicketId} (6h)`
          : triageStopped
            ? 'Skipped upstream'
            : `${r.triage.incidentHash} · ${r.linearTicket?.id ?? 'FG'}`,
      },
      {
        num: '04',
        name: 'Staged Fan-Out',
        state: r.phaseB ? 'ok' : r.phaseA ? 'alert' : 'skipped',
        note: r.phaseB
          ? `1 FAIL -> 2+3 PASS ($${r.totalCostUsd.toFixed(2)})`
          : triageStopped
            ? '0 agents ($0.00)'
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
              : 'No PR required',
      },
    ];
  }, [selectedRun]);

  const budgetPct = Math.min(
    100,
    Math.round((budget.spentUsd / Math.max(0.01, budget.dailyCapUsd)) * 100)
  );

  return (
    <div className="flex min-h-screen w-full bg-[#08090C] text-[#F0F1F4]">
      {/* FIXED LEFT DESKTOP SIDEBAR (252px) */}
      <aside className="sticky top-0 flex h-screen w-[252px] shrink-0 flex-col justify-between border-r border-[#1A1E28] bg-[#0A0C10]">
        <div>
          {/* Brand Header */}
          <div className="flex h-[58px] items-center gap-2.5 border-b border-[#1A1E28] px-5">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="5" fill="#14171E" stroke="#282D38" />
              <rect x="6" y="7" width="20" height="4" rx="1" fill="#E05A2B" />
              <rect x="9" y="14" width="14" height="4" rx="1" fill="#F0F1F4" />
              <rect x="13" y="21" width="6" height="4" rx="1" fill="#10B981" />
            </svg>
            <div className="min-w-0">
              <span className="block truncate font-mono-tech text-xs font-semibold uppercase tracking-[0.16em] text-[#F5F6F8]">
                Funnel Guardian
              </span>
              <span className="block font-mono-tech text-[9px] uppercase tracking-widest text-[#6D7485]">
                Control Plane v1.4
              </span>
            </div>
          </div>

          {/* Primary Navigation */}
          <div className="px-3 py-4">
            <p className="px-2.5 font-mono-tech text-[10px] uppercase tracking-[0.16em] text-[#616878]">
              Workspaces
            </p>
            <nav className="mt-2 space-y-1">
              <button
                type="button"
                onClick={() => setView('command')}
                className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  view === 'command'
                    ? 'bg-[#171B24] text-[#F5F6F8]'
                    : 'text-[#9299A8] hover:bg-[#11141B] hover:text-[#E5E8F0]'
                }`}
              >
                <span>Command Center</span>
                <span className="font-mono-tech text-[10px] text-[#6D7485]">3-Pane</span>
              </button>

              <button
                type="button"
                onClick={() => setView('approvals')}
                className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  view === 'approvals'
                    ? 'bg-[#171B24] text-[#F5F6F8]'
                    : 'text-[#9299A8] hover:bg-[#11141B] hover:text-[#E5E8F0]'
                }`}
              >
                <span>PR Approval Queue</span>
                {metrics.pendingApprovals > 0 ? (
                  <span className="rounded bg-amber-500 px-1.5 py-0.5 font-mono-tech text-[10px] font-bold text-[#08090C]">
                    {metrics.pendingApprovals}
                  </span>
                ) : (
                  <span className="font-mono-tech text-[10px] text-[#6D7485]">
                    {pullRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setView('ledger')}
                className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  view === 'ledger'
                    ? 'bg-[#171B24] text-[#F5F6F8]'
                    : 'text-[#9299A8] hover:bg-[#11141B] hover:text-[#E5E8F0]'
                }`}
              >
                <span>Incident &amp; Linear Ledger</span>
                <span className="font-mono-tech text-[10px] text-[#6D7485]">{runs.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setView('sandbox')}
                className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  view === 'sandbox'
                    ? 'bg-[#171B24] text-[#F5F6F8]'
                    : 'text-[#9299A8] hover:bg-[#11141B] hover:text-[#E5E8F0]'
                }`}
              >
                <span>Sandbox Target Bench</span>
                <span className="font-mono-tech text-[10px] text-[#6D7485]">Split</span>
              </button>
            </nav>
          </div>

          {/* Safety & Rate Limit Guardrails */}
          <div className="mx-3 mt-2 rounded border border-[#1B1F29] bg-[#0D0F14] p-3.5">
            <p className="font-mono-tech text-[10px] uppercase tracking-[0.14em] text-[#7D8494]">
              Runtime Guardrails
            </p>
            <dl className="mt-3 space-y-2.5 font-mono-tech text-[11px]">
              <div className="flex items-center justify-between">
                <dt className="text-[#7E8594]">Auth Gate</dt>
                <dd className="text-emerald-400">Supabase JWT</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#7E8594]">API Quota</dt>
                <dd
                  className={
                    apiRateLimit.remaining <= 5 ? 'text-amber-300' : 'text-[#D8DCE6]'
                  }
                >
                  {apiRateLimit.remaining}/{apiRateLimit.limit} /min
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#7E8594]">Production</dt>
                <dd className="text-emerald-400">Read-Only</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#7E8594]">Patches</dt>
                <dd className="text-[#D8DCE6]">Preview Only</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#7E8594]">Payments</dt>
                <dd className="text-[#D8DCE6]">Stripe Test</dd>
              </div>
            </dl>
          </div>

          {/* External Links */}
          <div className="mx-3 mt-3 space-y-1 px-2 font-mono-tech text-[11px] text-[#7D8494]">
            <a
              href="https://github.com/8hze/funnel-guardian/pull/1"
              target="_blank"
              rel="noreferrer"
              className="block py-1 hover:text-[#E05A2B]"
            >
              GitHub Live PR #1 -&gt;
            </a>
            <Link href="/checkout" target="_blank" className="block py-1 hover:text-[#F0F1F4]">
              Open LedgerFlow SaaS -&gt;
            </Link>
          </div>
        </div>

        {/* Authenticated Supabase Operator Card */}
        <div className="border-t border-[#1A1E28] bg-[#0C0E13] p-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#2A303E] bg-[#161A23] font-mono-tech text-xs font-semibold text-[#E05A2B]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#F0F1F4]">{operator.fullName}</p>
              <p className="truncate font-mono-tech text-[10px] text-[#7D8494]">
                {operator.organization} · {operator.role}
              </p>
            </div>
          </div>
          <p className="mt-2 truncate font-mono-tech text-[10px] text-[#666D7D]">
            {operator.email}
          </p>
          <button
            type="button"
            disabled={signingOut}
            onClick={handleSignOut}
            className="mt-2.5 w-full rounded border border-[#242936] bg-[#13161E] px-3 py-1.5 font-mono-tech text-[11px] text-[#AEB5C4] hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
          >
            {signingOut ? 'Signing Out...' : 'Sign Out Session'}
          </button>
        </div>
      </aside>

      {/* MAIN RIGHT WORKSTATION AREA (up to 1668px on 1920x1080) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TOP COMMAND HEADER */}
        <header className="sticky top-0 z-20 flex h-[58px] items-center justify-between gap-4 border-b border-[#1A1E28] bg-[#090B0F]/95 px-6 backdrop-blur-xs">
          <div className="flex items-center gap-3.5">
            <h1 className="text-sm font-semibold text-[#F5F6F8]">
              {view === 'command'
                ? 'Command Center'
                : view === 'approvals'
                  ? 'PR Approval Queue ("Needs You")'
                  : view === 'ledger'
                    ? 'Incident & Linear Deduplication Ledger'
                    : 'Sandbox Live Target Bench'}
            </h1>
            <span className="h-4 w-px bg-[#222630]" />
            {selectedRun ? (
              <div className="flex items-center gap-2.5">
                <span className="font-mono-tech text-xs font-semibold text-[#E05A2B]">
                  {selectedRun.scenarioCode}
                </span>
                <span className="max-w-[340px] truncate text-xs text-[#C5CBD7]">
                  {selectedRun.scenarioTitle}
                </span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono-tech text-[10px] ${formatOutcome(selectedRun.finalStatus).tone}`}
                >
                  {formatOutcome(selectedRun.finalStatus).label}
                </span>
              </div>
            ) : (
              <span className="font-mono-tech text-xs text-[#757C8C]">
                Idle · Select a fault or run the full 5-scenario suite
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Inline Nightly Budget Cap Meter */}
            <div className="flex items-center gap-2.5 rounded border border-[#1E222C] bg-[#0E1015] px-3 py-1.5">
              <span className="font-mono-tech text-[10px] uppercase text-[#7E8594]">
                Budget Cap
              </span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#1E232E]">
                <div
                  className={`h-full transition-all ${
                    budget.spentUsd >= budget.dailyCapUsd ? 'bg-red-500' : 'bg-[#E05A2B]'
                  }`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <span className="font-mono-tech text-[11px] text-[#E5E8F0]">
                ${budget.spentUsd.toFixed(2)}/${budget.dailyCapUsd.toFixed(0)}
              </span>
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
                className="rounded border border-[#272D3B] bg-[#090B0E] px-1.5 py-0.5 font-mono-tech text-[10px] text-[#C5CBD7]"
              >
                <option value={10}>$10 / 6 runs</option>
                <option value={3}>$3 / 6 runs</option>
                <option value={1}>$1 / 1 run (test cap)</option>
              </select>
            </div>

            <button
              type="button"
              disabled={isRunning}
              onClick={() => triggerProbe({ runAll: true })}
              className="rounded bg-[#E05A2B] px-4 py-2 font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#08090C] hover:bg-[#CA4D21] disabled:opacity-50"
            >
              {isRunning ? 'Executing...' : 'Run All 5 Scenarios'}
            </button>

            <button
              type="button"
              onClick={resetDemo}
              className="rounded border border-[#262B38] bg-[#12151C] px-3 py-2 font-mono-tech text-xs text-[#AEB5C4] hover:border-[#3E4657] hover:text-[#F5F6F8]"
            >
              Reset
            </button>
          </div>
        </header>

        {/* WORKSPACE BODY */}
        <div className="flex-1 space-y-4 p-5">
          {isRunning && runningLabel && (
            <div className="flex items-center gap-3 rounded border border-[#E05A2B]/40 bg-[#E05A2B]/10 px-4 py-2.5 font-mono-tech text-xs text-[#F5B097]">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#E05A2B]/40 border-t-[#E05A2B]" />
              <span>{runningLabel}</span>
            </div>
          )}

          {apiError && (
            <div
              role="alert"
              className="flex items-center justify-between rounded border border-red-500/40 bg-red-500/10 px-4 py-2.5 font-mono-tech text-xs text-red-200"
            >
              <span>{apiError}</span>
              <button
                type="button"
                onClick={() => setApiError(null)}
                className="text-red-300 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* VIEW 1: 1920x1080 COMMAND CENTER (3-PANE DESKTOP WORKSTATION) */}
          {view === 'command' && (
            <>
              {/* Top Telemetry Strip: 5-Module Rail (8 cols) + 4 Economics KPIs (4 cols) */}
              <div className="grid grid-cols-12 gap-4">
                <section className="col-span-12 rounded border border-[#1D212B] bg-[#0D0F14] p-3.5 xl:col-span-8">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="font-mono-tech text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7E8594]">
                      5-Module Autonomous Trajectory
                    </span>
                    <span className="font-mono-tech text-[10px] text-[#697080]">
                      {selectedRun
                        ? `Fingerprint: ${selectedRun.triage.incidentHash}`
                        : 'Awaiting probe trigger'}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2.5">
                    {pipelineSteps.map((step) => {
                      const cls =
                        step.state === 'ok'
                          ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                          : step.state === 'filtered'
                            ? 'border-sky-500/40 bg-sky-500/[0.07]'
                            : step.state === 'pending'
                              ? 'border-amber-500/45 bg-amber-500/[0.08]'
                              : step.state === 'alert' || step.state === 'blocked'
                                ? 'border-red-500/40 bg-red-500/[0.07]'
                                : 'border-[#20242F] bg-[#12151C]';
                      const dot =
                        step.state === 'ok'
                          ? 'bg-emerald-400'
                          : step.state === 'filtered'
                            ? 'bg-sky-400'
                            : step.state === 'pending'
                              ? 'bg-amber-400'
                              : step.state === 'alert' || step.state === 'blocked'
                                ? 'bg-red-400'
                                : 'bg-[#464D5E]';
                      return (
                        <div key={step.num} className={`rounded border px-3 py-2 ${cls}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-mono-tech text-[9px] text-[#7D8494]">
                              MOD {step.num}
                            </span>
                            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                          </div>
                          <p className="mt-1 text-xs font-semibold text-[#F5F6F8]">{step.name}</p>
                          <p className="mt-0.5 truncate font-mono-tech text-[10px] text-[#A1A8B7]">
                            {step.note}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="col-span-12 grid grid-cols-4 gap-2.5 xl:col-span-4">
                  <div className="flex flex-col justify-between rounded border border-[#1D212B] bg-[#0D0F14] p-3.5">
                    <span className="font-mono-tech text-[9px] uppercase tracking-wider text-[#7D8494]">
                      Bugs Patched
                    </span>
                    <span className="font-mono-tech text-2xl font-semibold text-[#F5F6F8]">
                      {metrics.revenueBugsCaught}
                    </span>
                    <span className="font-mono-tech text-[10px] text-amber-400">
                      {metrics.pendingApprovals} pending
                    </span>
                  </div>

                  <div className="flex flex-col justify-between rounded border border-[#1D212B] bg-[#0D0F14] p-3.5">
                    <span className="font-mono-tech text-[9px] uppercase tracking-wider text-[#7D8494]">
                      Noise Blocked
                    </span>
                    <span className="font-mono-tech text-2xl font-semibold text-emerald-400">
                      {metrics.noiseBlocked}
                    </span>
                    <span className="font-mono-tech text-[10px] text-[#7D8494]">$0.00 spent</span>
                  </div>

                  <div className="flex flex-col justify-between rounded border border-[#1D212B] bg-[#0D0F14] p-3.5">
                    <span className="font-mono-tech text-[9px] uppercase tracking-wider text-[#7D8494]">
                      Total Spend
                    </span>
                    <span className="font-mono-tech text-2xl font-semibold text-[#F5F6F8]">
                      ${metrics.totalSpent.toFixed(2)}
                    </span>
                    <span className="font-mono-tech text-[10px] text-[#7D8494]">
                      naive ${metrics.naiveTotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex flex-col justify-between rounded border border-[#1D212B] bg-[#0D0F14] p-3.5">
                    <span className="font-mono-tech text-[9px] uppercase tracking-wider text-[#7D8494]">
                      Cost Saved
                    </span>
                    <span className="font-mono-tech text-2xl font-semibold text-[#E05A2B]">
                      {metrics.naiveTotal > 0 ? `${metrics.pctSaved}%` : '--'}
                    </span>
                    <span className="font-mono-tech text-[10px] text-emerald-400">
                      ${metrics.saved.toFixed(2)} net
                    </span>
                  </div>
                </section>
              </div>

              {/* 3-PANE DESKTOP WORKBENCH (1920x1080 SINGLE-SCREEN FIT) */}
              <div className="grid grid-cols-12 items-start gap-4">
                {/* PANE 1 (4 cols): Fault Injection Control Matrix */}
                <section className="col-span-12 rounded border border-[#1D212B] bg-[#0D0F14] xl:col-span-4">
                  <div className="flex items-center justify-between border-b border-[#1A1E28] px-4 py-3">
                    <div>
                      <h2 className="font-mono-tech text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D8DCE6]">
                        Synthetic Fault Deck (F-01 – F-05)
                      </h2>
                      <p className="mt-0.5 text-[11px] text-[#757C8C]">
                        Click a row to inspect; run twice on a bug to trigger 6h Deduplication.
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-[#181C25]">
                    {FAULT_LIST.map((fault) => {
                      const isHealed = healedFaults.includes(fault.id);
                      const latestForFault = runs.find((r) => r.faultId === fault.id);
                      const isSelected = selectedRun?.faultId === fault.id;

                      return (
                        <div
                          key={fault.id}
                          onClick={() => {
                            if (latestForFault) setSelectedRunId(latestForFault.runId);
                            loadPreview(fault.id);
                          }}
                          className={`cursor-pointer px-4 py-3.5 transition-colors ${
                            isSelected ? 'bg-[#161A23]' : 'hover:bg-[#12151C]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
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
                                  {fault.category === 'revenue-bug' ? 'P0 Revenue' : 'Noise Trap'}
                                </span>
                                <span className="font-mono-tech text-[10px] text-[#737A8A]">
                                  {fault.viewport} · {fault.route}
                                </span>
                                {isHealed && (
                                  <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono-tech text-[9px] uppercase text-emerald-300">
                                    Healed
                                  </span>
                                )}
                              </div>

                              <p className="mt-1 text-xs font-semibold text-[#F0F1F4]">
                                {fault.title}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-snug text-[#848B9A]">
                                {fault.revenueImpact}
                              </p>

                              {latestForFault && (
                                <div className="mt-2 flex items-center gap-2">
                                  <span
                                    className={`rounded border px-1.5 py-0.5 font-mono-tech text-[10px] ${formatOutcome(latestForFault.finalStatus).tone}`}
                                  >
                                    {formatOutcome(latestForFault.finalStatus).label}
                                  </span>
                                </div>
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
                                className="rounded border border-[#E05A2B]/60 bg-[#E05A2B]/15 px-2.5 py-1.5 font-mono-tech text-[10px] font-semibold uppercase text-[#F6B49B] hover:bg-[#E05A2B] hover:text-[#08090C] disabled:opacity-50"
                              >
                                Run Probe
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadPreview(fault.id);
                                }}
                                className="rounded border border-[#252A36] bg-[#13161E] px-2.5 py-1 font-mono-tech text-[10px] text-[#8E95A5] hover:text-[#F0F1F4]"
                              >
                                Preview
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* PANE 2 (5 cols): Deep Pipeline & Staged Fan-Out Inspector */}
                <section className="col-span-12 rounded border border-[#1D212B] bg-[#0D0F14] xl:col-span-5">
                  <div className="flex items-center justify-between border-b border-[#1A1E28] px-4 py-3">
                    <h2 className="font-mono-tech text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D8DCE6]">
                      Deep Execution Trace &amp; Agent Fan-Out
                    </h2>
                    {selectedRun?.pullRequest && (
                      <button
                        type="button"
                        onClick={() => setView('approvals')}
                        className="rounded bg-amber-400 px-2.5 py-1 font-mono-tech text-[10px] font-bold uppercase text-[#08090C] hover:bg-amber-300"
                      >
                        Review PR #{selectedRun.pullRequest.number} -&gt;
                      </button>
                    )}
                  </div>

                  <div className="p-4">
                    {!selectedRun ? (
                      <div className="rounded border border-dashed border-[#262C39] bg-[#0A0C10] px-6 py-16 text-center">
                        <p className="font-mono-tech text-[11px] uppercase tracking-[0.18em] text-[#E05A2B]">
                          Control Plane Armed
                        </p>
                        <h3 className="mt-2 font-editorial text-3xl text-[#F5F6F8]">
                          Execute a synthetic fault to trace the 5-module gate.
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#848B9A]">
                          Run F-04 or F-05 first to verify $0.00 noise filtering, then trigger F-01
                          to observe Phase A Playwright reproduction and Phase B parallel patching.
                        </p>
                        <div className="mt-6 flex justify-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => triggerProbe({ faultId: 'checkout-mobile-overlap' })}
                            className="rounded bg-[#E05A2B] px-4 py-2 font-mono-tech text-xs font-semibold text-[#08090C]"
                          >
                            Run F-01 (Mobile Overlap)
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerProbe({ faultId: 'third-party-analytics-500' })}
                            className="rounded border border-[#2B313F] bg-[#13161E] px-4 py-2 font-mono-tech text-xs text-[#D5DAE5]"
                          >
                            Run F-04 (Noise Trap)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* 01 Probe Observation */}
                        <div className="rounded border border-[#1E222C] bg-[#0A0C10] p-3.5">
                          <div className="flex items-center justify-between font-mono-tech text-[10px]">
                            <span className="uppercase tracking-wider text-[#E05A2B]">
                              01 · Browser Probe Observation
                            </span>
                            <span className="text-[#7E8594]">
                              {selectedRun.probe.engineMode} · {selectedRun.probe.viewport} ·{' '}
                              {selectedRun.probe.durationMs}ms
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs font-medium leading-relaxed text-[#F0F1F4]">
                            {selectedRun.probe.summary}
                          </p>
                          <div className="mt-2.5 grid grid-cols-3 gap-2 font-mono-tech text-[10px]">
                            <div className="rounded border border-[#1A1E27] bg-[#11141B] px-2.5 py-1.5">
                              <span className="text-[#6F7685]">Route</span>
                              <p className="truncate text-[#D5DAE5]">{selectedRun.probe.route}</p>
                            </div>
                            <div className="rounded border border-[#1A1E27] bg-[#11141B] px-2.5 py-1.5">
                              <span className="text-[#6F7685]">Error Type</span>
                              <p className="truncate text-[#D5DAE5]">
                                {selectedRun.probe.errorType}
                              </p>
                            </div>
                            <div className="rounded border border-[#1A1E27] bg-[#11141B] px-2.5 py-1.5">
                              <span className="text-[#6F7685]">Target</span>
                              <p className="truncate text-[#D5DAE5]">
                                {selectedRun.probe.selectorOrEndpoint}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* 02 & 03 Triage Gate */}
                        <div className="rounded border border-[#1E222C] bg-[#0A0C10] p-3.5">
                          <div className="flex items-center justify-between font-mono-tech text-[10px]">
                            <span className="uppercase tracking-wider text-[#E05A2B]">
                              02 &amp; 03 · Triage Gate &amp; Deduplication
                            </span>
                            <span className="text-emerald-400">
                              {selectedRun.costSavedUsd > 0
                                ? `Saved $${selectedRun.costSavedUsd.toFixed(2)}`
                                : 'Escalated to Devin'}
                            </span>
                          </div>
                          <div className="mt-2.5 space-y-2">
                            {selectedRun.triage.stages.map((st, idx) => (
                              <div
                                key={`${st.stage}-${idx}`}
                                className="flex items-start justify-between gap-2.5 rounded border border-[#1A1E27] bg-[#11141B] px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono-tech text-[10px] font-semibold uppercase text-[#D8DCE6]">
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
                                  <p className="mt-1 text-[11px] leading-snug text-[#9AA1B0]">
                                    {st.reason}
                                  </p>
                                </div>
                                <span className="shrink-0 font-mono-tech text-[10px] text-[#6F7685]">
                                  {st.durationMs}ms
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 04 Staged Fan-Out */}
                        {selectedRun.phaseA ? (
                          <div className="space-y-2.5 rounded border border-[#1E222C] bg-[#0A0C10] p-3.5">
                            <div className="flex items-center justify-between font-mono-tech text-[10px]">
                              <span className="uppercase tracking-wider text-[#E05A2B]">
                                04 · Staged Fan-Out (Devin 1 -&gt; 2 + 3)
                              </span>
                              <span className="text-[#E5E8F0]">
                                Run Cost: ${selectedRun.totalCostUsd.toFixed(2)}
                              </span>
                            </div>

                            <div className="rounded border border-[#1F2430] bg-[#11141B] p-3">
                              <div className="flex items-center justify-between">
                                <span className="font-mono-tech text-[11px] font-semibold text-[#F0F1F4]">
                                  Phase A · {selectedRun.phaseA.agent}
                                </span>
                                <span className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 font-mono-tech text-[9px] text-amber-300">
                                  2/2 FAIL CONFIRMED · ${selectedRun.phaseA.costUsd.toFixed(2)}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-[#9AA1B0]">
                                {selectedRun.phaseA.summary}
                              </p>
                              {selectedRun.phaseA.artifactContent && (
                                <pre className="mt-2 max-h-36 overflow-auto rounded border border-[#1C202B] bg-[#07080B] p-2.5 font-mono-tech text-[10px] leading-relaxed text-[#C6CDD9]">
                                  {selectedRun.phaseA.artifactContent}
                                </pre>
                              )}
                            </div>

                            {selectedRun.phaseB && (
                              <div className="grid grid-cols-2 gap-2.5">
                                <div className="rounded border border-[#1F2430] bg-[#11141B] p-3">
                                  <div className="flex items-center justify-between font-mono-tech text-[10px]">
                                    <span className="font-semibold text-[#F0F1F4]">
                                      B1 · Devin-2 Patch
                                    </span>
                                    <span className="text-emerald-400">
                                      ${selectedRun.phaseB.devin2.costUsd.toFixed(2)}
                                    </span>
                                  </div>
                                  <ul className="mt-1.5 space-y-1 font-mono-tech text-[10px] text-[#8C93A3]">
                                    {selectedRun.phaseB.devin2.logs.slice(0, 4).map((l, i) => (
                                      <li key={i} className="truncate">
                                        {l}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="rounded border border-[#1F2430] bg-[#11141B] p-3">
                                  <div className="flex items-center justify-between font-mono-tech text-[10px]">
                                    <span className="font-semibold text-[#F0F1F4]">
                                      B2 · Devin-3 QA
                                    </span>
                                    <span className="text-emerald-400">
                                      ${selectedRun.phaseB.devin3.costUsd.toFixed(2)}
                                    </span>
                                  </div>
                                  <ul className="mt-1.5 space-y-1 font-mono-tech text-[10px] text-[#8C93A3]">
                                    {selectedRun.phaseB.devin3.logs.slice(0, 4).map((l, i) => (
                                      <li key={i} className="truncate">
                                        {l}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                            <p className="font-mono-tech text-xs font-semibold text-emerald-300">
                              Zero Agents Spawned · Budget Protected ($0.00)
                            </p>
                            <p className="mt-1 text-xs text-[#AEB5C4]">
                              {selectedRun.triage.reason}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* PANE 3 (3 cols): Docked Live Sandbox Viewport Monitor (Always Visible on 1920x1080!) */}
                <section className="col-span-12 rounded border border-[#1D212B] bg-[#0D0F14] xl:col-span-3">
                  <div className="border-b border-[#1A1E28] px-3.5 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D8DCE6]">
                        Live Target ({previewSpec.code})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewHealed((h) => !h);
                          setPreviewNonce((n) => n + 1);
                        }}
                        className={`rounded border px-2 py-0.5 font-mono-tech text-[10px] ${
                          previewHealed
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                            : 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {previewHealed ? 'Patched' : 'Faulty'}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono-tech text-[10px]">
                      <span className="truncate text-[#757C8C]">{previewPath}</span>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewViewport('mobile')}
                          className={`rounded px-1.5 py-0.5 ${
                            previewViewport === 'mobile'
                              ? 'bg-[#E05A2B] text-[#08090C]'
                              : 'border border-[#262C39] text-[#848B9A]'
                          }`}
                        >
                          390px
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewViewport('desktop')}
                          className={`rounded px-1.5 py-0.5 ${
                            previewViewport === 'desktop'
                              ? 'bg-[#E05A2B] text-[#08090C]'
                              : 'border border-[#262C39] text-[#848B9A]'
                          }`}
                        >
                          Full
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center bg-[#07080B] p-3">
                    <div
                      className={`overflow-hidden rounded border border-[#242936] bg-[#F7F6F2] ${
                        previewViewport === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
                      }`}
                    >
                      <iframe
                        key={`${previewPath}-${previewNonce}`}
                        src={previewPath}
                        title="Live LedgerFlow Target Monitor"
                        className="h-[620px] w-full border-0"
                      />
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}

          {/* VIEW 2: FULL-WIDTH 1920x1080 PR APPROVAL WORKBENCH ("NEEDS YOU") */}
          {view === 'approvals' && (
            <div className="space-y-4">
              {!activePR ? (
                <div className="rounded border border-dashed border-[#262C39] bg-[#0D0F14] py-20 text-center">
                  <p className="font-mono-tech text-xs uppercase tracking-widest text-[#848B9A]">
                    Approval Queue Empty
                  </p>
                  <p className="mt-2 text-sm text-[#9AA1B0]">
                    Execute any revenue regression (F-01, F-02, F-03) or run all 5 scenarios to
                    populate the PR review bench.
                  </p>
                  <button
                    type="button"
                    onClick={() => triggerProbe({ runAll: true })}
                    className="mt-5 rounded bg-[#E05A2B] px-5 py-2.5 font-mono-tech text-xs font-semibold uppercase text-[#08090C]"
                  >
                    Run All 5 Scenarios Now
                  </button>
                </div>
              ) : (
                <>
                  {/* PR Selector Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#1D212B] bg-[#0D0F14] px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {pullRequests.map((pr) => (
                        <button
                          key={pr.number}
                          type="button"
                          onClick={() => {
                            const match = runs.find((r) => r.pullRequest?.number === pr.number);
                            if (match) setSelectedRunId(match.runId);
                          }}
                          className={`rounded border px-3 py-1.5 font-mono-tech text-xs ${
                            activePR.number === pr.number
                              ? 'border-[#E05A2B] bg-[#E05A2B]/15 text-[#F6B49B]'
                              : 'border-[#252A36] bg-[#12151C] text-[#9AA1B0]'
                          }`}
                        >
                          PR #{pr.number} · {pr.sensitiveArea} ({pr.status})
                        </button>
                      ))}
                    </div>
                    <a
                      href="https://github.com/8hze/funnel-guardian/pull/1"
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono-tech text-xs text-[#E05A2B] hover:underline"
                    >
                      Open Real GitHub PR #1 -&gt;
                    </a>
                  </div>

                  {/* PR Decision Header */}
                  <div className="rounded border border-[#242936] bg-[#0D0F14] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tech text-xs font-bold text-[#E05A2B]">
                            PR #{activePR.number}
                          </span>
                          <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-amber-300">
                            Sensitive Scope: {activePR.sensitiveArea}
                          </span>
                          <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-emerald-300">
                            CI/CD Passing
                          </span>
                          <span className="font-mono-tech text-xs text-[#848B9A]">
                            Linear {activePR.linearTicketId} · Hash {activePR.incidentHash}
                          </span>
                        </div>
                        <h2 className="mt-2 text-lg font-semibold text-[#F5F6F8]">
                          {activePR.title}
                        </h2>
                        <p className="mt-1 font-mono-tech text-xs text-[#848B9A]">
                          Branch: {activePR.branch} · Run Cost: ${activePR.totalCostUsd.toFixed(2)}{' '}
                          (vs ${activePR.naiveCostUsd.toFixed(2)} naive) · Reviewer:{' '}
                          {operator.email}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {activePR.status === 'needs_approval' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproval(activePR, 'approve')}
                              className="rounded bg-emerald-500 px-5 py-2.5 font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#08090C] hover:bg-emerald-400"
                            >
                              Approve &amp; Merge PR
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproval(activePR, 'reject')}
                              className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2.5 font-mono-tech text-xs uppercase text-red-300 hover:bg-red-500/20"
                            >
                              Reject PR
                            </button>
                          </>
                        ) : (
                          <span
                            className={`rounded border px-4 py-2 font-mono-tech text-xs font-semibold uppercase ${
                              activePR.status === 'merged'
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                : 'border-red-500/40 bg-red-500/15 text-red-300'
                            }`}
                          >
                            {activePR.status === 'merged'
                              ? `Merged by ${operator.fullName} · Fault Healed`
                              : 'Rejected by Reviewer'}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="mt-4 border-t border-[#1A1E28] pt-3 text-xs leading-relaxed text-[#AEB5C4]">
                      <strong className="text-[#F0F1F4]">Root Cause Analysis:</strong>{' '}
                      {activePR.rootCause}
                    </p>
                  </div>

                  {/* Visual QA Before/After — Full Widescreen */}
                  <div className="grid grid-cols-2 gap-4">
                    <figure className="overflow-hidden rounded border border-red-500/35 bg-[#0A0C10]">
                      <figcaption className="flex items-center justify-between border-b border-[#1A1E28] bg-[#12151C] px-4 py-2 font-mono-tech text-[11px] uppercase text-red-300">
                        <span>Before Patch · Chromium Playwright Capture (FAIL)</span>
                        <span>Fault Active</span>
                      </figcaption>
                      <img
                        src={activePR.evidenceBefore}
                        alt="Before patch capture"
                        className="h-[360px] w-full bg-[#07080B] object-contain p-2"
                      />
                    </figure>

                    <figure className="overflow-hidden rounded border border-emerald-500/35 bg-[#0A0C10]">
                      <figcaption className="flex items-center justify-between border-b border-[#1A1E28] bg-[#12151C] px-4 py-2 font-mono-tech text-[11px] uppercase text-emerald-300">
                        <span>After Patch · Ephemeral Preview Verification (PASS)</span>
                        <span>Verified Clean</span>
                      </figcaption>
                      <img
                        src={activePR.evidenceAfter}
                        alt="After patch capture"
                        className="h-[360px] w-full bg-[#07080B] object-contain p-2"
                      />
                    </figure>
                  </div>

                  {/* Side-by-Side Code Review: Diff + Playwright Repro */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded border border-[#1D212B] bg-[#0D0F14]">
                      <div className="border-b border-[#1A1E28] px-4 py-2.5 font-mono-tech text-[11px] text-[#C5CBD7]">
                        Devin-2 Unified Diff · {activePR.patchFile}
                      </div>
                      <pre className="overflow-x-auto p-4 font-mono-tech text-xs leading-relaxed">
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
                                    : 'text-[#9AA1B0]'
                            }
                          >
                            {line}
                          </div>
                        ))}
                      </pre>
                    </div>

                    <div className="rounded border border-[#1D212B] bg-[#0D0F14]">
                      <div className="border-b border-[#1A1E28] px-4 py-2.5 font-mono-tech text-[11px] text-[#C5CBD7]">
                        Devin-1 Deterministic Regression Spec · {activePR.reproTestFilename}
                      </div>
                      <pre className="overflow-x-auto p-4 font-mono-tech text-xs leading-relaxed text-[#CBD1DD]">
                        {activePR.reproTestCode}
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* VIEW 3: FULL-WIDTH INCIDENT & LINEAR LEDGER */}
          {view === 'ledger' && (
            <div className="grid grid-cols-12 gap-4">
              <section className="col-span-12 rounded border border-[#1D212B] bg-[#0D0F14] xl:col-span-8">
                <div className="border-b border-[#1A1E28] px-5 py-3">
                  <h2 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#D8DCE6]">
                    Executed Probe &amp; Triage Audit Ledger ({runs.length} runs)
                  </h2>
                </div>
                {runs.length === 0 ? (
                  <p className="py-16 text-center font-mono-tech text-xs text-[#757C8C]">
                    No probe runs recorded yet.
                  </p>
                ) : (
                  <table className="w-full text-left font-mono-tech text-xs">
                    <thead className="border-b border-[#1A1E28] bg-[#12151C] text-[10px] uppercase text-[#848B9A]">
                      <tr>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Scenario</th>
                        <th className="px-4 py-3">SHA-256 Hash</th>
                        <th className="px-4 py-3">Outcome</th>
                        <th className="px-4 py-3">Linear</th>
                        <th className="px-4 py-3 text-right">Cost</th>
                        <th className="px-4 py-3 text-right">Saved</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#181C25]">
                      {runs.map((r) => (
                        <tr
                          key={r.runId}
                          onClick={() => {
                            setSelectedRunId(r.runId);
                            setView('command');
                          }}
                          className="cursor-pointer hover:bg-[#141821]"
                        >
                          <td className="px-4 py-3 font-semibold text-[#E05A2B]">
                            {r.scenarioCode}
                          </td>
                          <td className="px-4 py-3 font-sans text-[#F0F1F4]">{r.scenarioTitle}</td>
                          <td className="px-4 py-3 text-[#8E95A5]">{r.triage.incidentHash}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] ${formatOutcome(r.finalStatus).tone}`}
                            >
                              {formatOutcome(r.finalStatus).label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#D5DAE5]">
                            {r.linearTicket?.id ?? r.triage.existingLinearTicketId ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-[#F5F6F8]">
                            ${r.totalCostUsd.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-400">
                            ${r.costSavedUsd.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="col-span-12 rounded border border-[#1D212B] bg-[#0D0F14] xl:col-span-4">
                <div className="border-b border-[#1A1E28] px-5 py-3">
                  <h2 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#D8DCE6]">
                    Linear Queue &amp; 6h Cooldown Fingerprints
                  </h2>
                </div>
                <div className="divide-y divide-[#181C25] p-2">
                  {linearTickets.length === 0 ? (
                    <p className="py-14 text-center font-mono-tech text-xs text-[#757C8C]">
                      No escalated Linear issues yet.
                    </p>
                  ) : (
                    linearTickets.map((t) => (
                      <div key={t.id} className="p-3">
                        <div className="flex items-center justify-between font-mono-tech text-xs">
                          <span className="font-semibold text-[#E05A2B]">{t.id}</span>
                          <span className="rounded border border-[#272D3B] bg-[#13161E] px-2 py-0.5 text-[10px] text-[#D8DCE6]">
                            {t.state}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#E5E8F0]">{t.title}</p>
                        <p className="mt-1 font-mono-tech text-[10px] text-[#737A8A]">
                          Hash: {t.hash} · Mode: {t.mode}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {/* VIEW 4: FULL-WIDTH 1920x1080 DUAL SANDBOX BENCH */}
          {view === 'sandbox' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#1D212B] bg-[#0D0F14] px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {FAULT_LIST.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => loadPreview(f.id)}
                      className={`rounded border px-3 py-1.5 font-mono-tech text-xs ${
                        previewFault === f.id
                          ? 'border-[#E05A2B] bg-[#E05A2B]/15 text-[#F6B49B]'
                          : 'border-[#252A36] bg-[#12151C] text-[#9AA1B0]'
                      }`}
                    >
                      {f.code} · {f.shortTitle}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewHealed((h) => !h);
                    setPreviewNonce((n) => n + 1);
                  }}
                  className={`rounded border px-3.5 py-1.5 font-mono-tech text-xs font-semibold ${
                    previewHealed
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {previewHealed ? 'Showing Patched State' : 'Showing Active Fault'}
                </button>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 rounded border border-[#1D212B] bg-[#0D0F14] p-4 xl:col-span-8">
                  <p className="mb-2 font-mono-tech text-[11px] uppercase text-[#848B9A]">
                    Desktop Viewport (1280px+) · {previewPath}
                  </p>
                  <iframe
                    key={`desk-${previewPath}-${previewNonce}`}
                    src={previewPath}
                    title="Desktop Sandbox Preview"
                    className="h-[720px] w-full rounded border border-[#242936] bg-[#F7F6F2]"
                  />
                </div>
                <div className="col-span-12 flex flex-col items-center rounded border border-[#1D212B] bg-[#0D0F14] p-4 xl:col-span-4">
                  <p className="mb-2 self-start font-mono-tech text-[11px] uppercase text-[#848B9A]">
                    Mobile Adversarial Viewport (390x844)
                  </p>
                  <iframe
                    key={`mob-${previewPath}-${previewNonce}`}
                    src={previewPath}
                    title="Mobile Sandbox Preview"
                    className="h-[720px] w-[390px] rounded border border-[#242936] bg-[#F7F6F2]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
