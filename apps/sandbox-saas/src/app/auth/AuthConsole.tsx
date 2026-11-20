'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AuthConsoleProps {
  initialMode: 'signin' | 'signup';
  nextPath: string;
  authRequiredNotice: boolean;
}

interface RateLimitSnapshot {
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

const ROLES = [
  'Founder / CTO',
  'Staff / Principal Engineer',
  'SRE / Reliability Lead',
  'Product Engineer',
] as const;

export function AuthConsole({
  initialMode,
  nextPath,
  authRequiredNotice,
}: AuthConsoleProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  // Sign-in fields
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPass, setShowSignInPass] = useState(false);

  // Sign-up fields
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignUpPass, setShowSignUpPass] = useState(false);

  // Status & security telemetry
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitSnapshot>({
    limit: initialMode === 'signin' ? 5 : 3,
    remaining: initialMode === 'signin' ? 5 : 3,
    retryAfterSec: 0,
  });
  const [lockoutSec, setLockoutSec] = useState(0);

  useEffect(() => {
    if (lockoutSec <= 0) return;
    const timer = setInterval(() => {
      setLockoutSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSec]);

  const passwordChecks = useMemo(
    () => [
      { label: '8+ characters', ok: signUpPassword.length >= 8 },
      { label: 'Uppercase (A-Z)', ok: /[A-Z]/.test(signUpPassword) },
      { label: 'Lowercase (a-z)', ok: /[a-z]/.test(signUpPassword) },
      { label: 'Number (0-9)', ok: /[0-9]/.test(signUpPassword) },
      {
        label: 'Passwords match',
        ok: signUpPassword.length > 0 && signUpPassword === confirmPassword,
      },
    ],
    [signUpPassword, confirmPassword]
  );

  const allPasswordChecksPass = passwordChecks.every((c) => c.ok);

  function switchMode(nextMode: 'signin' | 'signup') {
    setMode(nextMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLockoutSec(0);
    setRateLimit({
      limit: nextMode === 'signin' ? 5 : 3,
      remaining: nextMode === 'signin' ? 5 : 3,
      retryAfterSec: 0,
    });
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    if (submitting || lockoutSec > 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signInEmail,
          password: signInPassword,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        rateLimit?: RateLimitSnapshot;
      };

      if (data.rateLimit) {
        setRateLimit(data.rateLimit);
        if (data.rateLimit.retryAfterSec > 0) {
          setLockoutSec(data.rateLimit.retryAfterSec);
        }
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Authentication failed.');
        setSubmitting(false);
        return;
      }

      router.push(nextPath || '/guardian');
      router.refresh();
    } catch {
      setErrorMsg('Network error reaching authentication service.');
      setSubmitting(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    if (submitting || lockoutSec > 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!allPasswordChecksPass) {
      setErrorMsg('Complete all password policy requirements before creating an operator account.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          organization,
          role,
          email: signUpEmail,
          password: signUpPassword,
          confirmPassword,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        requiresEmailConfirmation?: boolean;
        rateLimit?: RateLimitSnapshot;
      };

      if (data.rateLimit) {
        setRateLimit(data.rateLimit);
        if (data.rateLimit.retryAfterSec > 0) {
          setLockoutSec(data.rateLimit.retryAfterSec);
        }
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to register account.');
        setSubmitting(false);
        return;
      }

      if (data.requiresEmailConfirmation) {
        setSuccessMsg(
          'Account provisioned in Supabase Auth. Confirm your email address, then sign in.'
        );
        setMode('signin');
        setSignInEmail(signUpEmail);
        setSubmitting(false);
        return;
      }

      router.push(nextPath || '/guardian');
      router.refresh();
    } catch {
      setErrorMsg('Network error reaching Supabase registration service.');
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full grid-cols-12 bg-[#08090C] text-[#F0F1F4]">
      {/* Left Architecture & Trust Plane (7 cols on desktop 1920x1080) */}
      <div className="col-span-12 flex flex-col justify-between border-r border-[#1B1E26] bg-[#090B0E] px-12 py-10 lg:col-span-7 xl:px-16 xl:py-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="5" fill="#14171E" stroke="#282D38" />
              <rect x="6" y="7" width="20" height="4" rx="1" fill="#E05A2B" />
              <rect x="9" y="14" width="14" height="4" rx="1" fill="#F0F1F4" />
              <rect x="13" y="21" width="6" height="4" rx="1" fill="#10B981" />
            </svg>
            <div>
              <span className="block font-mono-tech text-xs font-semibold uppercase tracking-[0.18em] text-[#F0F1F4]">
                Funnel Guardian
              </span>
              <span className="block font-mono-tech text-[10px] tracking-wider text-[#6F7685]">
                REVENUE RELIABILITY CONTROL PLANE
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3 font-mono-tech text-[11px] text-[#8E95A5]">
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Supabase Auth Active
            </span>
            <Link
              href="/checkout"
              className="rounded border border-[#242934] bg-[#11141B] px-3 py-1 text-[#C5CBD7] hover:border-[#394052]"
            >
              View Sandbox Target
            </Link>
          </div>
        </div>

        <div className="my-10 max-w-2xl">
          <p className="font-mono-tech text-[11px] uppercase tracking-[0.2em] text-[#E05A2B]">
            Mandatory Operator Authentication
          </p>
          <h1 className="mt-4 font-editorial text-5xl leading-[1.06] tracking-tight text-[#F5F6F8] xl:text-6xl">
            Authenticated control over every revenue-critical funnel.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#9299A8] xl:text-base">
            Mission Control requires a verified Supabase Auth session before executing browser
            probes, inspecting incident fingerprints, or approving pull requests that modify Stripe
            checkout, OAuth authentication, or visible customer UX.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            <div className="rounded border border-[#1E222C] bg-[#0E1015] p-5">
              <p className="font-mono-tech text-[10px] uppercase tracking-widest text-[#E05A2B]">
                01 / Forced Session Guard
              </p>
              <p className="mt-2 text-sm font-semibold text-[#F0F1F4]">
                Server-Verified Supabase JWT
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#848B9A]">
                Edge middleware and every{' '}
                <code className="font-mono-tech text-[#C5CBD7]">/api/guardian/*</code> handler
                validate tokens via{' '}
                <code className="font-mono-tech text-[#C5CBD7]">supabase.auth.getUser()</code>{' '}
                before returning telemetry.
              </p>
            </div>

            <div className="rounded border border-[#1E222C] bg-[#0E1015] p-5">
              <p className="font-mono-tech text-[10px] uppercase tracking-widest text-[#E05A2B]">
                02 / Dual-Layer Rate Limit
              </p>
              <p className="mt-2 text-sm font-semibold text-[#F0F1F4]">
                Sliding-Window HTTP 429 Guard
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#848B9A]">
                Enforces 5 sign-in tries/min, 3 sign-ups/15 min per IP, and 30 probe API calls/min
                per operator on top of Supabase Auth limits.
              </p>
            </div>

            <div className="rounded border border-[#1E222C] bg-[#0E1015] p-5">
              <p className="font-mono-tech text-[10px] uppercase tracking-widest text-[#E05A2B]">
                03 / Zero-Mutation Prod
              </p>
              <p className="mt-2 text-sm font-semibold text-[#F0F1F4]">
                Read-Only Prod · Preview Patches
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#848B9A]">
                Probes never mutate production billing records. Repros and diffs run exclusively on
                ephemeral previews in Stripe Test Mode.
              </p>
            </div>

            <div className="rounded border border-[#1E222C] bg-[#0E1015] p-5">
              <p className="font-mono-tech text-[10px] uppercase tracking-widest text-[#E05A2B]">
                04 / Measured Economics
              </p>
              <p className="mt-2 text-sm font-semibold text-[#F0F1F4]">
                83.1% Spend Reduction vs Naive Bots
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#848B9A]">
                Triage Gate filters 3rd-party 500s, transient 504s, and 6h duplicates at $0.00
                before spawning Devin reproduction agents.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-[#1B1E26] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4 font-mono-tech text-[11px] text-[#757C8C]">
            <span>
              [01 Probe] -&gt; [02 Triage Gate] -&gt; [03 Dedupe] -&gt; [04 Staged Fan-Out] -&gt; [05
              Human Approval]
            </span>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-[#D5DAE5]">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-[#D5DAE5]">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Workbench (5 cols on desktop 1920x1080) */}
      <div className="col-span-12 flex flex-col justify-center bg-[#0F1116] px-10 py-10 lg:col-span-5 xl:px-16">
        <div className="mx-auto w-full max-w-[480px]">
          {authRequiredNotice && (
            <div className="mb-5 rounded border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              <span className="font-mono-tech font-semibold uppercase tracking-wider text-amber-300">
                Access Restricted:
              </span>{' '}
              Sign in or create an operator account to enter Mission Control (
              <code className="font-mono-tech text-amber-100">{nextPath}</code>).
            </div>
          )}

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 rounded border border-[#232834] bg-[#0A0C10] p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`rounded py-2 font-mono-tech text-xs font-semibold transition-colors ${
                mode === 'signin'
                  ? 'bg-[#1B1F29] text-[#F5F6F8]'
                  : 'text-[#848B9A] hover:text-[#D5DAE5]'
              }`}
            >
              Operator Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`rounded py-2 font-mono-tech text-xs font-semibold transition-colors ${
                mode === 'signup'
                  ? 'bg-[#1B1F29] text-[#F5F6F8]'
                  : 'text-[#848B9A] hover:text-[#D5DAE5]'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Live Rate Limit Telemetry Strip */}
          <div className="mt-4 flex items-center justify-between rounded border border-[#1E222C] bg-[#0B0D11] px-3.5 py-2 font-mono-tech text-[11px]">
            <span className="text-[#848B9A]">
              Rate Limit ({mode === 'signin' ? '60s window' : '15m window'})
            </span>
            {lockoutSec > 0 ? (
              <span className="font-semibold text-red-400">
                HTTP 429 Locked · Retry in {lockoutSec}s
              </span>
            ) : (
              <span
                className={
                  rateLimit.remaining <= 1 ? 'text-amber-300' : 'text-emerald-400'
                }
              >
                {rateLimit.remaining} / {rateLimit.limit} attempts left
              </span>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-200"
            >
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-200">
              {successMsg}
            </div>
          )}

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="mt-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#F5F6F8]">
                  Sign in to Mission Control
                </h2>
                <p className="mt-1 text-xs text-[#848B9A]">
                  Authenticate with your registered Supabase operator credentials.
                </p>
              </div>

              <div>
                <label
                  htmlFor="signin-email"
                  className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                >
                  Work Email
                </label>
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  placeholder="operator@company.com"
                  className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3.5 py-2.5 text-sm text-[#F0F1F4] placeholder-[#555C6C] focus:border-[#E05A2B] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="signin-password"
                    className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSignInPass((v) => !v)}
                    className="font-mono-tech text-[10px] text-[#848B9A] hover:text-[#D5DAE5]"
                  >
                    {showSignInPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="signin-password"
                  type={showSignInPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3.5 py-2.5 text-sm text-[#F0F1F4] placeholder-[#555C6C] focus:border-[#E05A2B] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || lockoutSec > 0}
                className="flex w-full items-center justify-center gap-2 rounded bg-[#E05A2B] px-4 py-2.5 font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#090A0D] hover:bg-[#CA4D21] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#090A0D]/30 border-t-[#090A0D]" />
                    <span>Verifying Supabase Session...</span>
                  </>
                ) : lockoutSec > 0 ? (
                  <span>Locked ({lockoutSec}s)</span>
                ) : (
                  <span>Sign In to Control Plane</span>
                )}
              </button>

              <p className="pt-2 text-center text-xs text-[#7E8594]">
                No operator account yet?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-medium text-[#E05A2B] hover:underline"
                >
                  Create an account
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="mt-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#F5F6F8]">
                  Provision Operator Account
                </h2>
                <p className="mt-1 text-xs text-[#848B9A]">
                  Registers a real user in Supabase Auth with immediate JWT issuance.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-name"
                    className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                  >
                    Full Name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3 py-2 text-sm text-[#F0F1F4] placeholder-[#555C6C] focus:border-[#E05A2B] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-org"
                    className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                  >
                    Organization
                  </label>
                  <input
                    id="signup-org"
                    type="text"
                    required
                    minLength={2}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Acme SaaS"
                    className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3 py-2 text-sm text-[#F0F1F4] placeholder-[#555C6C] focus:border-[#E05A2B] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-email"
                    className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                  >
                    Work Email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    placeholder="alex@acmesaas.io"
                    className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3 py-2 text-sm text-[#F0F1F4] placeholder-[#555C6C] focus:border-[#E05A2B] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-role"
                    className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                  >
                    Role
                  </label>
                  <select
                    id="signup-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3 py-2 text-sm text-[#F0F1F4] focus:border-[#E05A2B] focus:outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="signup-password"
                      className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSignUpPass((v) => !v)}
                      className="font-mono-tech text-[10px] text-[#848B9A] hover:text-[#D5DAE5]"
                    >
                      {showSignUpPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    id="signup-password"
                    type={showSignUpPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    placeholder="StrongP4ssword"
                    className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3 py-2 text-sm text-[#F0F1F4] placeholder-[#555C6C] focus:border-[#E05A2B] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-confirm"
                    className="block font-mono-tech text-[11px] uppercase tracking-wider text-[#9CA3B3]"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="signup-confirm"
                    type={showSignUpPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="mt-1.5 w-full rounded border border-[#262C39] bg-[#0A0C10] px-3 py-2 text-sm text-[#F0F1F4] placeholder-[#555C6C] focus:border-[#E05A2B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Password policy checklist */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded border border-[#1E222C] bg-[#0A0C10] px-3.5 py-2.5 font-mono-tech text-[11px]">
                {passwordChecks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        check.ok ? 'bg-emerald-400' : 'bg-[#3A404F]'
                      }`}
                    />
                    <span className={check.ok ? 'text-emerald-300' : 'text-[#737A8A]'}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={submitting || lockoutSec > 0 || !allPasswordChecksPass}
                className="flex w-full items-center justify-center gap-2 rounded bg-[#E05A2B] px-4 py-2.5 font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#090A0D] hover:bg-[#CA4D21] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#090A0D]/30 border-t-[#090A0D]" />
                    <span>Provisioning Supabase Account...</span>
                  </>
                ) : lockoutSec > 0 ? (
                  <span>Locked ({lockoutSec}s)</span>
                ) : (
                  <span>Create Account &amp; Enter Console</span>
                )}
              </button>

              <p className="text-center text-[11px] text-[#6F7685]">
                By creating an operator account you agree to our{' '}
                <Link href="/terms" className="text-[#AEB5C4] underline">
                  Terms
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-[#AEB5C4] underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
