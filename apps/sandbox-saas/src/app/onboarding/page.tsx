import { cookies } from 'next/headers';
import Link from 'next/link';
import { SandboxShell } from '@/components/SandboxShell';
import { FAULT_COOKIE_NAME, parseFaultList } from '@/faults/state';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; verified?: string; company?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const activeFaults = parseFaultList(cookieStore.get(FAULT_COOKIE_NAME)?.value);

  return (
    <SandboxShell activeFaults={activeFaults} currentPath="/onboarding">
      <div className="mx-auto max-w-2xl px-5 py-14">
        <div className="flex items-center justify-between">
          <p className="font-mono-tech text-[11px] uppercase tracking-widest text-[#1B4332]">
            Funnel Step 03 / Workspace Onboarding
          </p>
          {sp.verified === '1' && (
            <span
              id="oauth-verified-badge"
              className="rounded border border-emerald-800/30 bg-emerald-50 px-2.5 py-0.5 font-mono-tech text-[11px] text-emerald-900"
            >
              OAuth State Verified ({sp.provider || 'github'})
            </span>
          )}
        </div>

        <h1 className="mt-2 font-editorial text-4xl tracking-tight text-[#141518]">
          Configure billing telemetry for {sp.company || 'Acme Metrics'}
        </h1>
        <p className="mt-2 text-sm text-[#5A5D66]">
          Your identity session is active. Select your production billing tier to complete setup.
        </p>

        <div className="mt-8 grid gap-4 rounded-md border border-[#DCD9D0] bg-[#FDFCFA] p-6 sm:grid-cols-2">
          <div>
            <p className="font-mono-tech text-xs text-[#63666F]">Environment</p>
            <p className="mt-1 text-sm font-medium text-[#141518]">Next.js App Router + Vercel</p>
          </div>
          <div>
            <p className="font-mono-tech text-xs text-[#63666F]">Payment Processor</p>
            <p className="mt-1 text-sm font-medium text-[#141518]">Stripe Test Mode (Sandboxed)</p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/pricing"
            className="rounded bg-[#1B4332] px-5 py-2.5 text-sm font-medium text-[#F7F6F2] hover:bg-[#143326]"
          >
            Select a plan
          </Link>
          <Link
            href="/checkout?plan=growth"
            className="rounded border border-[#CFCBC0] px-5 py-2.5 text-sm font-medium text-[#141518] hover:bg-[#EFECE6]"
          >
            Jump to Stripe checkout
          </Link>
        </div>
      </div>
    </SandboxShell>
  );
}
