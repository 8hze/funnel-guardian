import Link from 'next/link';
import { FAULT_LIST } from '@funnel-guardian/triage-gate';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let userEmail: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  } catch {
    userEmail = null;
  }

  const modules = [
    {
      num: '01',
      name: 'Browser Probe',
      subtitle: 'Playwright 24/7',
      detail:
        'Adversarial desktop and 390x844 mobile checkout journeys with real DOM hit-testing, console capture, and HTTP telemetry.',
    },
    {
      num: '02',
      name: 'Triage Gate',
      subtitle: 'Noise Elimination',
      detail:
        'Drops non-blocking third-party 500s, retries transient 504s on staggered windows, and enforces hard nightly budget caps.',
    },
    {
      num: '03',
      name: 'Deduplication',
      subtitle: 'SHA-256 + Linear',
      detail:
        'Fingerprints flow + error + route + selector against open Linear tickets and a 6-hour cooldown window.',
    },
    {
      num: '04',
      name: 'Staged Fan-Out',
      subtitle: 'Devin 1 -> 2 + 3',
      detail:
        'Devin-1 verifies a deterministic failing Playwright test first; only confirmed bugs launch parallel patch and visual QA agents.',
    },
    {
      num: '05',
      name: 'Human Approval',
      subtitle: 'Needs You Gate',
      detail:
        'Surfaces before/after Chromium captures, unified git diff, and exact run cost before merging sensitive Stripe or auth changes.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#08090C] text-[#F0F1F4]">
      <header className="border-b border-[#1A1D25] bg-[#0A0B0F]">
        <div className="mx-auto flex max-w-[1640px] items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="5" fill="#14171E" stroke="#282D38" />
              <rect x="6" y="7" width="20" height="4" rx="1" fill="#E05A2B" />
              <rect x="9" y="14" width="14" height="4" rx="1" fill="#F0F1F4" />
              <rect x="13" y="21" width="6" height="4" rx="1" fill="#10B981" />
            </svg>
            <span className="font-mono-tech text-xs font-semibold uppercase tracking-[0.18em]">
              Funnel Guardian
            </span>
            <span className="hidden h-4 w-px bg-[#222630] md:inline-block" />
            <span className="hidden font-mono-tech text-[11px] text-[#7D8494] md:inline-block">
              Autonomous Revenue-Funnel SRE
            </span>
          </div>

          <nav className="flex items-center gap-6 text-xs text-[#9AA1B0]">
            <Link href="/pricing" className="hover:text-[#F0F1F4]">
              Sandbox SaaS
            </Link>
            <Link href="/checkout" className="hover:text-[#F0F1F4]">
              Stripe Test Checkout
            </Link>
            <a
              href="https://github.com/8hze/funnel-guardian/pull/1"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#F0F1F4]"
            >
              Sample PR #1
            </a>
            {userEmail ? (
              <Link
                href="/guardian"
                className="rounded bg-[#E05A2B] px-4 py-2 font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-[#08090C] hover:bg-[#CA4D21]"
              >
                Open Command Center ({userEmail.split('@')[0]})
              </Link>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link
                  href="/auth?mode=signin"
                  className="rounded border border-[#282D38] bg-[#12151C] px-4 py-2 font-mono-tech text-[11px] font-medium text-[#E5E8F0] hover:border-[#3E4657]"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth?mode=signup"
                  className="rounded bg-[#E05A2B] px-4 py-2 font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-[#08090C] hover:bg-[#CA4D21]"
                >
                  Create Account
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1640px] px-8 py-14">
        <div className="grid grid-cols-12 items-end gap-10">
          <div className="col-span-12 lg:col-span-8">
            <div className="inline-flex items-center gap-2.5 rounded border border-[#232834] bg-[#101319] px-3 py-1 font-mono-tech text-[11px] text-[#AEB5C4]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Supabase Mandatory Auth · Sliding-Window Rate Limit · Stripe Test Guard</span>
            </div>
            <h1 className="mt-6 font-editorial text-6xl leading-[1.04] tracking-tight text-[#F5F6F8] xl:text-7xl">
              Eliminate silent checkout and OAuth regressions before they drain MRR.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[#949BAA]">
              Built for Seed and Series A engineering teams running Next.js, Vercel, GitHub,
              Linear, and Stripe. Funnel Guardian separates real first-party revenue outages from
              third-party noise at a deterministic Triage Gate, reproduces confirmed bugs in
              Playwright, and delivers review-ready pull requests with before/after visual proof.
            </p>
            <div className="mt-8 flex items-center gap-3.5">
              <Link
                href={userEmail ? '/guardian' : '/auth?next=/guardian'}
                className="rounded bg-[#E05A2B] px-6 py-3 font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#08090C] hover:bg-[#CA4D21]"
              >
                {userEmail ? 'Launch 1920px Command Center' : 'Sign In to Mission Control'}
              </Link>
              <Link
                href="/auth?mode=signup&next=/guardian"
                className="rounded border border-[#2B313F] bg-[#12151C] px-6 py-3 font-mono-tech text-xs font-medium uppercase tracking-wider text-[#E5E8F0] hover:border-[#424B5F]"
              >
                Register Operator Account
              </Link>
              <Link
                href="/checkout"
                className="rounded border border-[#222630] px-5 py-3 font-mono-tech text-xs text-[#9AA1B0] hover:text-[#F0F1F4]"
              >
                Inspect Sandbox Checkout -&gt;
              </Link>
            </div>
          </div>

          <div className="col-span-12 rounded-md border border-[#1E222C] bg-[#0E1015] p-6 lg:col-span-4">
            <div className="flex items-center justify-between border-b border-[#1B1F28] pb-3">
              <span className="font-mono-tech text-[10px] uppercase tracking-[0.18em] text-[#848B9A]">
                Verified Production Benchmarks
              </span>
              <span className="font-mono-tech text-[10px] text-emerald-400">
                5/5 Chromium Passed
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded border border-[#1A1E27] bg-[#12151C] p-3.5">
                <dt className="font-mono-tech text-[10px] uppercase text-[#7E8594]">
                  Revenue Bug Recall
                </dt>
                <dd className="mt-1 font-mono-tech text-2xl font-semibold text-[#F5F6F8]">100%</dd>
                <dd className="mt-0.5 font-mono-tech text-[10px] text-[#848B9A]">3/3 P0 patched</dd>
              </div>
              <div className="rounded border border-[#1A1E27] bg-[#12151C] p-3.5">
                <dt className="font-mono-tech text-[10px] uppercase text-[#7E8594]">
                  Noise Suppression
                </dt>
                <dd className="mt-1 font-mono-tech text-2xl font-semibold text-emerald-400">
                  100%
                </dd>
                <dd className="mt-0.5 font-mono-tech text-[10px] text-[#848B9A]">$0.00 burned</dd>
              </div>
              <div className="rounded border border-[#1A1E27] bg-[#12151C] p-3.5">
                <dt className="font-mono-tech text-[10px] uppercase text-[#7E8594]">
                  5-Event Spend
                </dt>
                <dd className="mt-1 font-mono-tech text-2xl font-semibold text-[#F5F6F8]">$4.09</dd>
                <dd className="mt-0.5 font-mono-tech text-[10px] text-[#848B9A]">
                  vs $24.25 naive
                </dd>
              </div>
              <div className="rounded border border-[#1A1E27] bg-[#12151C] p-3.5">
                <dt className="font-mono-tech text-[10px] uppercase text-[#7E8594]">
                  Net Savings
                </dt>
                <dd className="mt-1 font-mono-tech text-2xl font-semibold text-[#E05A2B]">83.1%</dd>
                <dd className="mt-0.5 font-mono-tech text-[10px] text-[#848B9A]">
                  per triage cycle
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <section className="mt-14 border-t border-[#1A1D25] pt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-mono-tech text-xs uppercase tracking-[0.18em] text-[#848B9A]">
              5-Module Autonomous Pipeline Architecture
            </h2>
            <span className="font-mono-tech text-[11px] text-[#697080]">
              Read-Only Production · Ephemeral Vercel Previews · Human Merge Gate
            </span>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-3.5">
            {modules.map((m) => (
              <div
                key={m.num}
                className="flex flex-col justify-between rounded border border-[#1E222C] bg-[#0E1015] p-5"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tech text-xs font-semibold text-[#E05A2B]">
                      {m.num}
                    </span>
                    <span className="font-mono-tech text-[10px] uppercase text-[#6E7585]">
                      {m.subtitle}
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-sm font-semibold text-[#F5F6F8]">{m.name}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#8C93A3]">{m.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-[#1A1D25] pt-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-mono-tech text-xs uppercase tracking-[0.18em] text-[#848B9A]">
                Injectable Synthetic Fault Matrix (LedgerFlow Reference SaaS)
              </h2>
              <p className="mt-1 text-xs text-[#7E8594]">
                Every scenario is executable live inside Mission Control after signing in.
              </p>
            </div>
            <Link
              href={userEmail ? '/guardian' : '/auth?next=/guardian'}
              className="font-mono-tech text-xs text-[#E05A2B] hover:underline"
            >
              Authenticate &amp; Execute Suite -&gt;
            </Link>
          </div>

          <div className="mt-5 overflow-hidden rounded border border-[#1E222C] bg-[#0E1015]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1E222C] bg-[#13161E] font-mono-tech text-[10px] uppercase tracking-wider text-[#848B9A]">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Fault Scenario</th>
                  <th className="px-5 py-3">Classification</th>
                  <th className="px-5 py-3">Target Surface</th>
                  <th className="px-5 py-3">Sensitive Gate</th>
                  <th className="px-5 py-3 text-right">Expected Gate Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1E27]">
                {FAULT_LIST.map((fault) => (
                  <tr key={fault.id} className="hover:bg-[#131720]">
                    <td className="px-5 py-3.5 font-mono-tech font-semibold text-[#E05A2B]">
                      {fault.code}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[#F0F1F4]">{fault.title}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={
                          fault.category === 'revenue-bug'
                            ? 'rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-red-300'
                            : 'rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono-tech text-[10px] uppercase text-emerald-300'
                        }
                      >
                        {fault.category === 'revenue-bug' ? 'P0 Revenue Bug' : 'Noise Trap'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono-tech text-[#9AA1B0]">
                      {fault.viewport} · {fault.route}
                    </td>
                    <td className="px-5 py-3.5 font-mono-tech text-[#AEB5C4]">
                      {fault.sensitiveArea}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono-tech text-[#E5E8F0]">
                      {fault.expectedTriageAction === 'escalate'
                        ? `PR + Needs Approval ($${fault.estimatedAgentCostUsd.toFixed(2)})`
                        : fault.expectedTriageAction === 'drop_third_party_noise'
                          ? 'Drop 3rd-Party Noise ($0.00)'
                          : 'Auto-Recover Retry #2 ($0.00)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1A1D25] px-8 py-5 text-xs text-[#697080]">
        <div className="mx-auto flex max-w-[1640px] items-center justify-between">
          <span>Funnel Guardian · Autonomous Revenue Reliability Control Plane</span>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-[#F0F1F4]">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-[#F0F1F4]">
              Privacy Policy
            </Link>
            <a
              href="https://github.com/8hze/funnel-guardian"
              target="_blank"
              rel="noreferrer"
              className="font-mono-tech text-[#C5CBD7] hover:text-[#E05A2B]"
            >
              GitHub Monorepo
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
