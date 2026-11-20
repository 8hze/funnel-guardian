import { cookies } from 'next/headers';
import Link from 'next/link';
import { SandboxShell } from '@/components/SandboxShell';
import { FAULT_COOKIE_NAME, mergeFaultSources } from '@/faults/state';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fault?: string; healed?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const activeFaults = mergeFaultSources(
    sp.fault,
    cookieStore.get(FAULT_COOKIE_NAME)?.value,
    sp.healed
  );

  const oauthFaultActive = activeFaults.includes('oauth-broken-state');
  const faultQuery = sp.fault ? `&fault=${encodeURIComponent(sp.fault)}` : '';
  const healedQuery = sp.healed ? `&healed=${encodeURIComponent(sp.healed)}` : '';

  return (
    <SandboxShell activeFaults={activeFaults} currentPath="/login">
      <div className="mx-auto max-w-md px-5 py-14">
        <p className="font-mono-tech text-[11px] uppercase tracking-widest text-[#1B4332]">
          Funnel Step 02 / OAuth Authentication
        </p>
        <h1 className="mt-2 font-editorial text-4xl tracking-tight text-[#141518]">
          Sign in to LedgerFlow
        </h1>
        <p className="mt-2 text-sm text-[#5A5D66]">
          Authenticate with your engineering identity provider to enter workspace onboarding.
        </p>

        {oauthFaultActive && (
          <div className="mt-5 rounded border border-amber-700/30 bg-amber-100/70 px-4 py-3 text-xs text-amber-950">
            <span className="font-mono-tech font-semibold uppercase">Fault F-03 Armed:</span>{' '}
            OAuth start will emit a stale state nonce, causing `/api/auth/oauth/callback` to reject
            the redirect.
          </div>
        )}

        <div className="mt-6 space-y-3 rounded-md border border-[#DCD9D0] bg-[#FDFCFA] p-6">
          <a
            id="oauth-github-btn"
            href={`/api/auth/oauth/start?provider=github${faultQuery}${healedQuery}`}
            className="flex w-full items-center justify-center gap-2 rounded bg-[#141518] px-4 py-2.5 text-sm font-medium text-[#F7F6F2] hover:bg-[#27292F]"
          >
            Continue with GitHub OAuth
          </a>
          <a
            id="oauth-google-btn"
            href={`/api/auth/oauth/start?provider=google${faultQuery}${healedQuery}`}
            className="flex w-full items-center justify-center gap-2 rounded border border-[#CFCBC0] bg-[#F7F6F2] px-4 py-2.5 text-sm font-medium text-[#141518] hover:bg-[#EFECE6]"
          >
            Continue with Google Workspace
          </a>

          <div className="pt-3 text-center text-xs text-[#63666F]">
            New organization?{' '}
            <Link href="/signup" className="font-medium text-[#141518] underline">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </SandboxShell>
  );
}
