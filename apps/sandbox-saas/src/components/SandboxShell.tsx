import Link from 'next/link';
import type { FaultId } from '@funnel-guardian/triage-gate';
import { FAULT_SCENARIOS } from '@funnel-guardian/triage-gate';

interface SandboxShellProps {
  children: React.ReactNode;
  activeFaults?: FaultId[];
  currentPath?: string;
}

export function SandboxShell({ children, activeFaults = [], currentPath }: SandboxShellProps) {
  const navItems = [
    { href: '/signup', label: 'Sign Up' },
    { href: '/login', label: 'OAuth Login' },
    { href: '/onboarding', label: 'Onboarding' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/checkout', label: 'Checkout' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F6F2] text-[#141518]">
      <div className="border-b border-[#242830] bg-[#0C0D0F] px-4 py-2 text-xs text-[#C6CAD3]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-mono-tech text-[11px] uppercase tracking-wider text-[#E05A2B]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E05A2B]" />
              Sandbox Target
            </span>
            <span className="text-[#8A909E]">Stripe Test Mode Only</span>
            {activeFaults.length > 0 ? (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono-tech text-[11px] text-amber-300">
                Active Faults: {activeFaults.map((f) => FAULT_SCENARIOS[f].code).join(', ')}
              </span>
            ) : (
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono-tech text-[11px] text-emerald-300">
                Clean State (0 Faults)
              </span>
            )}
          </div>
          <Link
            href="/guardian"
            className="font-mono-tech text-[11px] font-medium text-[#F0F1F4] underline decoration-[#E05A2B] underline-offset-4 hover:text-[#E05A2B]"
          >
            Open Funnel Guardian Console -&gt;
          </Link>
        </div>
      </div>

      <header className="border-b border-[#DCD9D0] bg-[#F7F6F2]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/pricing" className="flex items-baseline gap-2">
            <span className="font-editorial text-2xl tracking-tight text-[#141518]">
              LedgerFlow
            </span>
            <span className="font-mono-tech text-[10px] uppercase tracking-widest text-[#63666F]">
              SaaS Sandbox
            </span>
          </Link>

          <nav className="hidden items-center gap-5 text-sm md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  currentPath === item.href
                    ? 'font-medium text-[#141518] underline decoration-[#1B4332] underline-offset-8'
                    : 'text-[#5A5D66] hover:text-[#141518]'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#DCD9D0] bg-[#EFECE6] px-5 py-6 text-xs text-[#5A5D66]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <span>LedgerFlow Reference SaaS (Funnel Guardian Synthetic Target)</span>
          <div className="flex items-center gap-5">
            <Link href="/terms" className="hover:text-[#141518] hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-[#141518] hover:underline">
              Privacy Policy
            </Link>
            <Link href="/guardian" className="font-mono-tech text-[#141518] hover:underline">
              Mission Control
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
