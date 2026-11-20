'use client';

/**
 * Fault F-01: Mobile Checkout CTA Obstructed by Promo/Cookie Banner.
 * When active on narrow mobile viewports (<= 767px), mounts a fixed bottom z-[60]
 * overlay right over #stripe-pay-button so pointer hit-tests fail silently while
 * desktop layout and unit tests stay green.
 */
export function FaultBanner({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <aside
      id="promo-consent-banner"
      data-fault-id="checkout-mobile-overlap"
      data-obstructs-mobile-cta="true"
      className="sticky top-0 z-20 border-b border-stone-300 bg-stone-100 px-4 py-2.5 text-xs text-stone-700"
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-amber-400">
            Promo & Cookie Notice (Fault F-01)
          </span>
          <span className="font-mono text-[10px] text-stone-400">z-index: 60</span>
        </div>
        <p className="mt-2 text-sm leading-snug text-stone-200">
          Annual billing saves 20% for Series A teams. By continuing you agree to analytics cookies.
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-stone-400">
        <span className="inline-block border border-stone-700 px-2.5 py-1 font-mono text-[11px] text-stone-300">
          Fixed overlay covering #stripe-pay-button
        </span>
      </div>
    </aside>
  );
}
