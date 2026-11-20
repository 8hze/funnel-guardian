import Link from 'next/link';
import { SandboxShell } from '@/components/SandboxShell';

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const sp = await searchParams;
  const plan = sp.plan === 'scale' ? 'LedgerFlow Scale ($149/mo)' : 'LedgerFlow Growth ($49/mo)';

  return (
    <SandboxShell activeFaults={[]} currentPath="/checkout">
      <div className="mx-auto max-w-lg px-5 py-16">
        <div
          id="checkout-success-panel"
          className="rounded-md border border-emerald-800/30 bg-[#FDFCFA] p-7"
        >
          <p className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-emerald-800">
            Stripe Test Mode Confirmed (HTTP 200)
          </p>
          <h1 className="mt-2 font-editorial text-4xl text-[#141518]">Subscription activated</h1>
          <p className="mt-2 text-sm text-[#4E5159]">
            Test payment succeeded for <span className="font-medium text-[#141518]">{plan}</span>.
            No real card was charged.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/guardian"
              className="rounded bg-[#1B4332] px-4 py-2.5 text-xs font-medium text-[#F7F6F2] hover:bg-[#143326]"
            >
              Return to Funnel Guardian Console
            </Link>
            <Link
              href="/checkout"
              className="rounded border border-[#CFCBC0] px-4 py-2.5 text-xs font-medium text-[#141518] hover:bg-[#EFECE6]"
            >
              Run another test checkout
            </Link>
          </div>
        </div>
      </div>
    </SandboxShell>
  );
}
