import Link from 'next/link';
import { FAULT_LIST } from '@funnel-guardian/triage-gate';

export default function HomePage() {
  const modules = [
    {
      num: '01',
      name: 'Browser Probe',
      detail: 'Playwright 24/7 across desktop, 390x844 mobile, slow networks, and script blockers.',
    },
    {
      num: '02',
      name: 'Triage Gate',
      detail: 'Domain filter for 3rd-party noise, 1m/3m staggered retries, and hard nightly budget caps.',
    },
    {
      num: '03',
      name: 'Deduplication',
      detail: 'Deterministic SHA-256 fingerprint + Linear queue check + 6h cooldown window.',
    },
    {
      num: '04',
      name: 'Staged Fan-Out',
      detail: 'Phase A (Devin 1 repro test) gates parallel Phase B (Devin 2 patch + Devin 3 visual QA).',
    },
    {
      num: '05',
      name: 'Human Approval',
      detail: 'Before/after screenshots, diff, and run cost delivered for one-click merge approval.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0C0D0F] text-[#F0F1F4]">
      <header className="border-b border-[#1E222A]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#E05A2B]" />
            <span className="font-mono-tech text-xs font-semibold uppercase tracking-[0.18em]">
              Funnel Guardian
            </span>
          </div>
          <nav className="flex items-center gap-6 text-xs text-[#9AA0AE]">
            <Link href="/guardian" className="hover:text-[#F0F1F4]">
              Mission Control
            </Link>
            <Link href="/checkout" className="hover:text-[#F0F1F4]">
              Sandbox Checkout
            </Link>
            <Link href="/login" className="hover:text-[#F0F1F4]">
              Sandbox OAuth
            </Link>
            <Link
              href="/guardian"
              className="rounded border border-[#E05A2B] bg-[#E05A2B] px-3.5 py-1.5 font-mono-tech text-[11px] font-medium text-[#0C0D0F] hover:bg-[#C94D21]"
            >
              Launch Demo Console
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="font-mono-tech text-[11px] uppercase tracking-[0.2em] text-[#E05A2B]">
              Autonomous Revenue-Funnel Reliability for SaaS
            </p>
            <h1 className="mt-4 font-editorial text-5xl leading-[1.06] tracking-tight text-[#F4F5F7] sm:text-6xl">
              Catch silent checkout and OAuth regressions. Ship verified PRs instead of alerts.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#9AA0AE]">
              Funnel Guardian continuously probes signup, OAuth login, onboarding, and Stripe
              checkout. A strict Triage Gate strips third-party script noise and transient 504
              blips before launching staged Devin reproduction, patch, and visual QA agents on
              ephemeral preview deployments.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/guardian"
                className="rounded bg-[#E05A2B] px-5 py-3 text-sm font-semibold text-[#0C0D0F] hover:bg-[#C94D21]"
              >
                Open Mission Control Console
              </Link>
              <Link
                href="/pricing"
                className="rounded border border-[#2B303B] bg-[#14171D] px-5 py-3 text-sm font-medium text-[#E5E7EC] hover:border-[#414857]"
              >
                Explore LedgerFlow Sandbox SaaS
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-[#242830] bg-[#121418] p-5 lg:col-span-4">
            <p className="font-mono-tech text-[10px] uppercase tracking-[0.18em] text-[#8A909E]">
              Non-Negotiable Safety Invariant
            </p>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-4 border-b border-[#1E222A] pb-2.5">
                <dt className="text-[#9AA0AE]">Production</dt>
                <dd className="font-mono-tech text-right text-emerald-400">Read-Only / Synthetic</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-[#1E222A] pb-2.5">
                <dt className="text-[#9AA0AE]">Patches & Repros</dt>
                <dd className="font-mono-tech text-right text-[#F0F1F4]">Vercel Preview Only</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-[#1E222A] pb-2.5">
                <dt className="text-[#9AA0AE]">Payments</dt>
                <dd className="font-mono-tech text-right text-[#F0F1F4]">Stripe Test Mode Only</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-[#9AA0AE]">Payments / UX Merge</dt>
                <dd className="font-mono-tech text-right text-amber-400">Human Approval Gate</dd>
              </div>
            </dl>
          </div>
        </div>

        <section className="mt-16 border-t border-[#1E222A] pt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono-tech text-xs uppercase tracking-[0.18em] text-[#8A909E]">
              5-Module Pipeline Architecture
            </h2>
            <span className="font-mono-tech text-[11px] text-[#6E7482]">
              Next.js · Playwright · Linear · Devin · GitHub
            </span>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {modules.map((m) => (
              <div
                key={m.num}
                className="flex flex-col justify-between rounded-md border border-[#22262F] bg-[#121418] p-4"
              >
                <div>
                  <span className="font-mono-tech text-[11px] text-[#E05A2B]">{m.num}</span>
                  <h3 className="mt-1.5 text-sm font-semibold text-[#F0F1F4]">{m.name}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#8E95A3]">{m.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-[#1E222A] pt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-mono-tech text-xs uppercase tracking-[0.18em] text-[#8A909E]">
                Injectable Synthetic Fault Benchmark (5 Demo Scenarios)
              </h2>
              <p className="mt-1.5 text-sm text-[#9AA0AE]">
                Three genuine revenue regressions paired with two classic noise traps to prove zero
                wasted agent spend.
              </p>
            </div>
            <Link
              href="/guardian"
              className="font-mono-tech text-xs text-[#E05A2B] underline underline-offset-4"
            >
              Run all 5 live in Mission Control -&gt;
            </Link>
          </div>

          <div className="mt-6 overflow-hidden rounded-md border border-[#22262F] bg-[#121418]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#22262F] bg-[#161920] font-mono-tech text-[10px] uppercase tracking-wider text-[#8A909E]">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Scenario</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Viewport / Route</th>
                  <th className="px-4 py-3 text-right">Expected Gate Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222A]">
                {FAULT_LIST.map((fault) => (
                  <tr key={fault.id} className="hover:bg-[#171A21]">
                    <td className="px-4 py-3 font-mono-tech text-[#E05A2B]">{fault.code}</td>
                    <td className="px-4 py-3 font-medium text-[#F0F1F4]">{fault.title}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          fault.category === 'revenue-bug'
                            ? 'rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-red-300'
                            : 'rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-emerald-300'
                        }
                      >
                        {fault.category === 'revenue-bug' ? 'Revenue Bug' : 'Noise Trap'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono-tech text-[#9AA0AE]">
                      {fault.viewport} · {fault.route}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tech text-[#D4D7DF]">
                      {fault.expectedTriageAction === 'escalate'
                        ? `PR + Needs Approval ($${fault.estimatedAgentCostUsd.toFixed(2)})`
                        : fault.expectedTriageAction === 'drop_third_party_noise'
                          ? 'Drop 3rd-Party Noise ($0.00)'
                          : 'Auto-Recover on Retry ($0.00)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1E222A] px-6 py-6 text-xs text-[#6E7482]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span>Funnel Guardian Monorepo · Autonomous Revenue Reliability</span>
          <div className="flex items-center gap-5">
            <Link href="/terms" className="hover:text-[#F0F1F4]">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-[#F0F1F4]">
              Privacy Policy
            </Link>
            <Link href="/guardian" className="font-mono-tech text-[#F0F1F4] hover:text-[#E05A2B]">
              Mission Control
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
