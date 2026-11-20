import Link from 'next/link';
import { SandboxShell } from '@/components/SandboxShell';

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; provider?: string; received?: string }>;
}) {
  const sp = await searchParams;
  const reason = sp.reason || 'invalid_state';
  const provider = sp.provider || 'github';
  const received = sp.received || 'expired_nonce';

  return (
    <SandboxShell activeFaults={['oauth-broken-state']} currentPath="/login">
      <div className="mx-auto max-w-lg px-5 py-16">
        <div
          id="oauth-error-panel"
          className="rounded-md border border-red-800/30 bg-[#FDFCFA] p-7"
        >
          <p className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-red-700">
            Authentication Callback Rejected (HTTP 401 / Redirect Error)
          </p>
          <h1 className="mt-2 font-editorial text-3xl text-[#141518]">
            OAuth state parameter mismatch
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#4E5159]">
            We could not verify your <span className="font-mono-tech">{provider}</span> sign-in
            session because the returned OAuth <code className="font-mono-tech">state</code> token
            did not match the signed browser cookie.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3 rounded border border-[#DCD9D0] bg-[#F7F6F2] p-4 font-mono-tech text-xs">
            <div>
              <dt className="text-[#63666F]">Error Code</dt>
              <dd className="mt-0.5 font-semibold text-red-700">{reason}</dd>
            </div>
            <div>
              <dt className="text-[#63666F]">Received State</dt>
              <dd className="mt-0.5 text-[#141518]">{received}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[#63666F]">Endpoint</dt>
              <dd className="mt-0.5 text-[#141518]">GET /api/auth/oauth/callback</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="rounded bg-[#141518] px-4 py-2 text-xs font-medium text-[#F7F6F2] hover:bg-[#2A2C33]"
            >
              Retry sign in
            </Link>
            <Link
              href="/guardian"
              className="rounded border border-[#CFCBC0] px-4 py-2 font-mono-tech text-xs text-[#141518] hover:bg-[#EFECE6]"
            >
              Inspect in Funnel Guardian -&gt;
            </Link>
          </div>
        </div>
      </div>
    </SandboxShell>
  );
}
