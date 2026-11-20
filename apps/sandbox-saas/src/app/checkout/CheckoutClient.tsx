'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { FaultId } from '@funnel-guardian/triage-gate';
import { FaultBanner } from '@/faults/FaultBanner';
import { ThirdPartyScript } from '@/faults/ThirdPartyScript';

interface CheckoutClientProps {
  planId: 'growth' | 'scale';
  activeFaults: FaultId[];
  queryFaultString: string;
}

export function CheckoutClient({ planId, activeFaults, queryFaultString }: CheckoutClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState('founder@acme-saas.dev');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  const mobileOverlapActive = activeFaults.includes('checkout-mobile-overlap');
  const silentLoadingActive = activeFaults.includes('stripe-silent-loading');
  const thirdPartyNoiseActive = activeFaults.includes('third-party-analytics-500');
  const transient504Active = activeFaults.includes('transient-504-retry');

  const plan =
    planId === 'scale'
      ? { id: 'scale', name: 'LedgerFlow Scale', price: '$149.00', period: 'per month' }
      : { id: 'growth', name: 'LedgerFlow Growth', price: '$49.00', period: 'per month' };

  async function handleCheckoutSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorMessage(null);
    setSubmitting(true);
    const nextAttempt = attemptCount + 1;
    setAttemptCount(nextAttempt);

    try {
      const url = queryFaultString
        ? `/api/checkout?fault=${encodeURIComponent(queryFaultString)}`
        : '/api/checkout';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: plan.id,
          email,
          // Fault F-02 intentionally omits required currency field so Stripe validation returns 422
          currency: silentLoadingActive ? undefined : 'usd',
          testCardLast4: cardNumber.replace(/\s+/g, '').slice(-4),
        }),
      });

      if (!res.ok) {
        // Fault F-02: Swallows the 422 response and leaves button trapped in infinite loading!
        if (silentLoadingActive) {
          return;
        }
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(payload.error || `Checkout request failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }

      const data = (await res.json()) as { redirectUrl?: string };
      router.push(data.redirectUrl || `/checkout/success?plan=${plan.id}&mode=test`);
    } catch {
      if (!silentLoadingActive) {
        setErrorMessage('Network error communicating with Stripe Test Mode endpoint.');
        setSubmitting(false);
      }
    }
  }

  return (
    <>
      <ThirdPartyScript active={thirdPartyNoiseActive} />

      <div className="mx-auto max-w-3xl px-5 py-8 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono-tech text-[11px] uppercase tracking-widest text-[#1B4332]">
              Funnel Step 05 / Stripe Test Mode Checkout
            </p>
            <h1 className="mt-1 font-editorial text-4xl tracking-tight text-[#141518]">
              Complete your subscription
            </h1>
          </div>
          <span className="rounded border border-[#1B4332]/30 bg-[#E6EFE9] px-2.5 py-1 font-mono-tech text-[11px] text-[#1B4332]">
            TEST MODE (NO LIVE CHARGES)
          </span>
        </div>

        {(silentLoadingActive || thirdPartyNoiseActive || transient504Active || mobileOverlapActive) && (
          <div className="mt-4 rounded border border-amber-700/30 bg-amber-50 px-4 py-2.5 font-mono-tech text-xs text-amber-950">
            Injected sandbox fault(s): {activeFaults.join(', ')}
          </div>
        )}

        <div className="mt-7 grid gap-6 md:grid-cols-12">
          <div className="rounded-md border border-[#DCD9D0] bg-[#EFECE6]/70 p-5 md:col-span-5">
            <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[#63666F]">
              Order Summary
            </p>
            <p className="mt-3 text-base font-semibold text-[#141518]">{plan.name}</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-editorial text-4xl text-[#141518]">{plan.price}</span>
              <span className="text-xs text-[#5A5D66]">{plan.period}</span>
            </div>
            <div className="mt-6 space-y-2 border-t border-[#DCD9D0] pt-4 text-xs text-[#4E5159]">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono-tech">{plan.price}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (Sandbox)</span>
                <span className="font-mono-tech">$0.00</span>
              </div>
              <div className="flex justify-between border-t border-[#DCD9D0] pt-2 font-semibold text-[#141518]">
                <span>Total due today</span>
                <span className="font-mono-tech">{plan.price}</span>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleCheckoutSubmit}
            className="space-y-4 rounded-md border border-[#DCD9D0] bg-[#FDFCFA] p-6 md:col-span-7"
          >
            <div>
              <label htmlFor="billing-email" className="block text-xs font-medium text-[#3C3F47]">
                Billing email
              </label>
              <input
                id="billing-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded border border-[#CFCBC0] bg-[#F7F6F2] px-3 py-2 text-sm text-[#141518] focus:border-[#1B4332] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="stripe-card" className="block text-xs font-medium text-[#3C3F47]">
                Stripe Test Card Number
              </label>
              <input
                id="stripe-card"
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="mt-1.5 w-full rounded border border-[#CFCBC0] bg-[#F7F6F2] px-3 py-2 font-mono-tech text-sm text-[#141518] focus:border-[#1B4332] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="card-exp" className="block text-xs font-medium text-[#3C3F47]">
                  Expiry
                </label>
                <input
                  id="card-exp"
                  type="text"
                  defaultValue="12 / 29"
                  className="mt-1.5 w-full rounded border border-[#CFCBC0] bg-[#F7F6F2] px-3 py-2 font-mono-tech text-sm text-[#141518]"
                />
              </div>
              <div>
                <label htmlFor="card-cvc" className="block text-xs font-medium text-[#3C3F47]">
                  CVC
                </label>
                <input
                  id="card-cvc"
                  type="text"
                  defaultValue="424"
                  className="mt-1.5 w-full rounded border border-[#CFCBC0] bg-[#F7F6F2] px-3 py-2 font-mono-tech text-sm text-[#141518]"
                />
              </div>
            </div>

            {errorMessage && (
              <div
                id="checkout-error-alert"
                role="alert"
                className="rounded border border-red-800/30 bg-red-50 px-3.5 py-2.5 text-xs text-red-900"
              >
                {errorMessage}
              </div>
            )}

            <button
              id="stripe-pay-button"
              type="submit"
              data-state={submitting ? 'submitting' : 'idle'}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-[#1B4332] px-5 py-3 text-sm font-medium text-[#F7F6F2] hover:bg-[#143326] disabled:opacity-90"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F7F6F2]/40 border-t-[#F7F6F2]" />
                  <span>Processing Stripe Test payment...</span>
                </>
              ) : (
                <span>Pay {plan.price} (Test Mode)</span>
              )}
            </button>
          </form>
        </div>
      </div>

      <FaultBanner active={mobileOverlapActive} />
    </>
  );
}
