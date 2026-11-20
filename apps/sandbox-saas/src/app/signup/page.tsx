import { cookies } from 'next/headers';
import Link from 'next/link';
import { SandboxShell } from '@/components/SandboxShell';
import { FAULT_COOKIE_NAME, parseFaultList } from '@/faults/state';

export default async function SignupPage() {
  const cookieStore = await cookies();
  const activeFaults = parseFaultList(cookieStore.get(FAULT_COOKIE_NAME)?.value);

  return (
    <SandboxShell activeFaults={activeFaults} currentPath="/signup">
      <div className="mx-auto max-w-md px-5 py-14">
        <p className="font-mono-tech text-[11px] uppercase tracking-widest text-[#1B4332]">
          Funnel Step 01 / Registration
        </p>
        <h1 className="mt-2 font-editorial text-4xl tracking-tight text-[#141518]">
          Create your LedgerFlow workspace
        </h1>
        <p className="mt-2 text-sm text-[#5A5D66]">
          Start a 14-day sandbox trial with automated revenue reporting.
        </p>

        <form
          action="/onboarding"
          method="GET"
          className="mt-8 space-y-4 rounded-md border border-[#DCD9D0] bg-[#FDFCFA] p-6"
        >
          <div>
            <label htmlFor="work-email" className="block text-xs font-medium text-[#3C3F47]">
              Work email
            </label>
            <input
              id="work-email"
              name="email"
              type="email"
              defaultValue="founder@acme-saas.dev"
              required
              className="mt-1.5 w-full rounded border border-[#CFCBC0] bg-[#F7F6F2] px-3 py-2 text-sm text-[#141518] focus:border-[#1B4332] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="company-name" className="block text-xs font-medium text-[#3C3F47]">
              Company name
            </label>
            <input
              id="company-name"
              name="company"
              type="text"
              defaultValue="Acme Metrics Inc."
              required
              className="mt-1.5 w-full rounded border border-[#CFCBC0] bg-[#F7F6F2] px-3 py-2 text-sm text-[#141518] focus:border-[#1B4332] focus:outline-none"
            />
          </div>
          <button
            id="signup-submit-btn"
            type="submit"
            className="w-full rounded bg-[#1B4332] px-4 py-2.5 text-sm font-medium text-[#F7F6F2] hover:bg-[#143326]"
          >
            Continue to onboarding
          </button>
          <p className="text-center text-xs text-[#63666F]">
            Prefer SSO?{' '}
            <Link href="/login" className="font-medium text-[#141518] underline">
              Sign in with OAuth
            </Link>
          </p>
        </form>
      </div>
    </SandboxShell>
  );
}
