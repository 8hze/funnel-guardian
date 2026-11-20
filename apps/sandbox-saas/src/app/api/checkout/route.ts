import { NextRequest, NextResponse } from 'next/server';
import { FAULT_COOKIE_NAME, mergeFaultSources } from '@/faults/state';

const transientAttemptCounter = new Map<string, number>();

export async function POST(request: NextRequest) {
  // Security Invariant: NEVER permit live Stripe keys in Funnel Guardian sandbox
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (stripeKey.startsWith('sk_live_')) {
    return NextResponse.json(
      { error: 'Policy violation: live Stripe keys are strictly forbidden in Funnel Guardian.' },
      { status: 403 }
    );
  }

  const activeFaults = mergeFaultSources(
    request.nextUrl.searchParams.get('fault'),
    request.cookies.get(FAULT_COOKIE_NAME)?.value,
    request.nextUrl.searchParams.get('healed')
  );

  const body = (await request.json().catch(() => ({}))) as {
    planId?: string;
    email?: string;
    currency?: string;
    testCardLast4?: string;
  };

  // Fault F-05: Transient 504 on attempt #1 that succeeds cleanly on attempt #2
  if (activeFaults.includes('transient-504-retry')) {
    const attemptHeader = Number(request.headers.get('x-fg-attempt') || '0');
    let attempt = attemptHeader;
    if (!attempt) {
      const key = request.headers.get('x-forwarded-for') || 'local';
      attempt = (transientAttemptCounter.get(key) ?? 0) + 1;
      transientAttemptCounter.set(key, attempt >= 2 ? 0 : attempt);
    }

    if (attempt === 1) {
      return NextResponse.json(
        {
          error: 'Upstream payment gateway timeout (simulated transient 504 on attempt #1)',
          code: 'gateway_timeout',
          attempt,
        },
        { status: 504 }
      );
    }
  }

  // Fault F-02: Stripe Test validation requires currency + valid planId
  if (!body.currency || !body.planId) {
    return NextResponse.json(
      {
        error: 'Stripe Test Mode validation failed: missing required field "currency".',
        code: 'parameter_missing',
        param: 'currency',
        stripeMode: 'test',
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId: `cs_test_fg_${Date.now().toString(36)}`,
    stripeMode: 'test',
    planId: body.planId,
    currency: body.currency,
    amountCents: body.planId === 'scale' ? 14900 : 4900,
    testCardLast4: body.testCardLast4 || '4242',
    redirectUrl: `/checkout/success?plan=${encodeURIComponent(body.planId)}&mode=test`,
  });
}
