import { SandboxShell } from '@/components/SandboxShell';

export default function TermsPage() {
  return (
    <SandboxShell>
      <div className="mx-auto max-w-3xl px-5 py-14">
        <p className="font-mono-tech text-[11px] uppercase tracking-widest text-[#1B4332]">
          Legal & Safety Invariants
        </p>
        <h1 className="mt-2 font-editorial text-4xl text-[#141518]">Terms of Service</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-[#4E5159]">
          <p>
            Funnel Guardian operates under a non-negotiable safety invariant: autonomous probes
            never mutate customer records or execute live payment charges in production.
          </p>
          <p>
            Production synthetic checks run strictly in read-only mode or against isolated test
            accounts. Reproduction suites, patch generation, and visual verification run exclusively
            on ephemeral Preview Deployments configured with Stripe Test Mode credentials.
          </p>
          <p>
            Any pull request modifying payment checkout flows, pricing logic, authentication
            handlers, or visible customer-facing UI requires explicit human approval before merge.
          </p>
        </div>
      </div>
    </SandboxShell>
  );
}
