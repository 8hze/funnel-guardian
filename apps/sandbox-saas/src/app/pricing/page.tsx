import { cookies } from 'next/headers';
import Link from 'next/link';
import { SandboxShell } from '@/components/SandboxShell';
import { FAULT_COOKIE_NAME, parseFaultList } from '@/faults/state';

export default async function PricingPage() {
  const cookieStore = await cookies();
  const activeFaults = parseFaultList(cookieStore.get(FAULT_COOKIE_NAME)?.value);

  return (
    <SandboxShell activeFaults={activeFaults} currentPath="/pricing">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <div className="max-w-2xl">
          <p className="font-mono-tech text-[11px] uppercase tracking-widest text-[#1B4332]">
            Funnel Step 04 / Plan Selection
          </p>
          <h1 className="mt-2 font-editorial text-5xl tracking-tight text-[#141518]">
            Transparent billing for Seed and Series A teams.
          </h1>
          <p className="mt-3 text-base text-[#5A5D66]">
            Select a plan to enter the sandbox Stripe Test Mode checkout flow monitored by Funnel
            Guardian.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-12">
          <div className="flex flex-col justify-between rounded-md border border-[#1B4332] bg-[#FDFCFA] p-7 md:col-span-7">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono-tech text-xs uppercase tracking-wider text-[#1B4332]">
                  Growth Plan
                </span>
                <span className="rounded bg-[#1B4332] px-2 py-0.5 font-mono-tech text-[10px] uppercase text-[#F7F6F2]">
                  Default Probe Target
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-editorial text-5xl text-[#141518]">$49</span>
                <span className="text-sm text-[#5A5D66]">/ month (Stripe Test Mode)</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#4E5159]">
                Full self-serve revenue analytics, automated webhook verification, and up to 10,000
                monthly active seats.
              </p>
              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[#E6E3DA] pt-5 text-xs">
                <div>
                  <dt className="font-mono-tech text-[#63666F]">Checkout Flow</dt>
                  <dd className="mt-1 font-medium text-[#141518]">Stripe Test Card 4242</dd>
                </div>
                <div>
                  <dt className="font-mono-tech text-[#63666F]">Environments</dt>
                  <dd className="mt-1 font-medium text-[#141518]">Vercel Preview + Prod Read-Only</dd>
                </div>
              </dl>
            </div>
            <Link
              href="/checkout?plan=growth"
              className="mt-8 inline-flex w-full items-center justify-center rounded bg-[#1B4332] px-5 py-3 text-sm font-medium text-[#F7F6F2] hover:bg-[#143326]"
            >
              Proceed to Growth Checkout
            </Link>
          </div>

          <div className="flex flex-col justify-between rounded-md border border-[#DCD9D0] bg-[#EFECE6]/70 p-7 md:col-span-5">
            <div>
              <span className="font-mono-tech text-xs uppercase tracking-wider text-[#5A5D66]">
                Scale Plan
              </span>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-editorial text-5xl text-[#141518]">$149</span>
                <span className="text-sm text-[#5A5D66]">/ month</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#4E5159]">
                Dedicated multi-region reconciliation, custom SSO policies, and SLA-backed audit
                exports.
              </p>
            </div>
            <Link
              href="/checkout?plan=scale"
              className="mt-8 inline-flex w-full items-center justify-center rounded border border-[#141518] bg-transparent px-5 py-3 text-sm font-medium text-[#141518] hover:bg-[#141518] hover:text-[#F7F6F2]"
            >
              Proceed to Scale Checkout
            </Link>
          </div>
        </div>
      </div>
    </SandboxShell>
  );
}
