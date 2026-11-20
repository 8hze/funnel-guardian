import { SandboxShell } from '@/components/SandboxShell';

export default function PrivacyPage() {
  return (
    <SandboxShell>
      <div className="mx-auto max-w-3xl px-5 py-14">
        <p className="font-mono-tech text-[11px] uppercase tracking-widest text-[#1B4332]">
          Data Governance
        </p>
        <h1 className="mt-2 font-editorial text-4xl text-[#141518]">Privacy Policy</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-[#4E5159]">
          <p>
            Funnel Guardian processes only synthetic test account telemetry, browser trace
            artifacts, and ephemeral preview screenshots. Real customer PII and production payment
            tokens are excluded from probe contexts.
          </p>
          <p>
            The Sandbox SaaS stores active synthetic fault toggles exclusively in a local browser
            session cookie (`fg_active_faults`) for demonstration purposes and transmits no personal
            data to external analytics vendors.
          </p>
        </div>
      </div>
    </SandboxShell>
  );
}
