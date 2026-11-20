import type { FaultId, FaultScenarioSpec } from './types.ts';

export const FAULT_SCENARIOS: Record<FaultId, FaultScenarioSpec> = {
  'checkout-mobile-overlap': {
    id: 'checkout-mobile-overlap',
    code: 'F-01',
    title: 'Mobile Checkout CTA Obstructed by Promo Banner',
    shortTitle: 'Mobile z-index overlap',
    category: 'revenue-bug',
    flow: 'stripe-checkout',
    route: '/checkout',
    viewport: 'mobile',
    sensitiveArea: 'Checkout UX',
    expectedTriageAction: 'escalate',
    description:
      'A fixed mobile cookie/promo banner mounts at z-index 60 directly over #stripe-pay-button on 390x844 viewports, intercepting all pointer events while unit tests remain green.',
    revenueImpact: '100% mobile checkout drop-off (~42% of SaaS self-serve conversions)',
    selectorOrEndpoint: '#stripe-pay-button',
    evidenceBefore: '/evidence/checkout-mobile-overlap-before.png',
    evidenceAfter: '/evidence/checkout-mobile-overlap-after.png',
    reproTestFilename: 'tests/repro-fg-mobile-checkout-overlap.spec.ts',
    reproTestCode: `import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('FG-101: mobile checkout pay CTA must not be intercepted by fixed banner', async ({ page }) => {
  await page.goto('/checkout?plan=growth&fault=checkout-mobile-overlap');
  const payBtn = page.locator('#stripe-pay-button');
  await expect(payBtn).toBeVisible();

  // Verify pointer hit-test reaches #stripe-pay-button rather than #promo-consent-banner
  const hitTarget = await payBtn.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const topEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return topEl?.closest('button')?.id ?? topEl?.id ?? topEl?.tagName ?? 'none';
  });

  expect(hitTarget).toBe('stripe-pay-button');
  await payBtn.click({ timeout: 3000 });
});`,
    rootCause:
      'apps/sandbox-saas/src/faults/FaultBanner.tsx renders a fixed bottom banner with z-60 and height covering the mobile action bar without adding bottom clearance to the checkout form or dismissing on /checkout.',
    patchFile: 'apps/sandbox-saas/src/faults/FaultBanner.tsx',
    patchDiff: `--- a/apps/sandbox-saas/src/faults/FaultBanner.tsx
+++ b/apps/sandbox-saas/src/faults/FaultBanner.tsx
@@ -18,9 +18,10 @@ export function FaultBanner({ active }: { active: boolean }) {
   if (!active) return null;
 
   return (
-    <aside
-      id="promo-consent-banner"
-      className="fixed inset-x-0 bottom-0 z-[60] h-[168px] border-t border-stone-800 bg-stone-950/95 px-5 py-6 text-stone-100 md:hidden"
-    >
+    <aside
+      id="promo-consent-banner"
+      role="region"
+      aria-label="Privacy notice"
+      className="sticky top-0 z-20 border-b border-stone-200 bg-stone-100 px-4 py-2.5 text-xs text-stone-700"
+    >`,
    prTitle: 'fix(checkout): prevent mobile promo banner from intercepting Stripe Pay CTA',
    prBranch: 'fix/fg-101-checkout-mobile-overlap',
    estimatedAgentCostUsd: 1.42,
    naiveBotCostUsd: 4.85,
  },

  'stripe-silent-loading': {
    id: 'stripe-silent-loading',
    code: 'F-02',
    title: 'Silent Stripe Test Validation Hang (Infinite Spinner)',
    shortTitle: 'Stripe silent hang',
    category: 'revenue-bug',
    flow: 'stripe-checkout',
    route: '/checkout',
    viewport: 'desktop',
    sensitiveArea: 'Stripe / Payments',
    expectedTriageAction: 'escalate',
    description:
      'Clicking Pay posts an incomplete Stripe Test Mode payload missing currency; /api/checkout returns HTTP 422, but the client swallows the error and leaves the CTA locked in infinite loading.',
    revenueImpact: 'Silent payment abandonment with zero user-facing error or Sentry exception',
    selectorOrEndpoint: 'POST /api/checkout',
    evidenceBefore: '/evidence/stripe-silent-loading-before.png',
    evidenceAfter: '/evidence/stripe-silent-loading-after.png',
    reproTestFilename: 'tests/repro-fg-stripe-silent-loading.spec.ts',
    reproTestCode: `import { test, expect } from '@playwright/test';

test('FG-102: Stripe test checkout must resolve or surface validation error within 4s', async ({ page }) => {
  await page.goto('/checkout?plan=growth&fault=stripe-silent-loading');
  const payBtn = page.locator('#stripe-pay-button');
  await payBtn.click();

  // Regression guard: button must not remain permanently locked in submitting state
  await expect(payBtn).not.toHaveAttribute('data-state', 'submitting', { timeout: 4500 });
  await expect(page).toHaveURL(/\\/checkout\\/success/);
});`,
    rootCause:
      'apps/sandbox-saas/src/app/checkout/page.tsx omits currency when stripe-silent-loading is active and returns early on !res.ok without calling setSubmitting(false) or displaying the Stripe validation payload.',
    patchFile: 'apps/sandbox-saas/src/app/checkout/page.tsx',
    patchDiff: `--- a/apps/sandbox-saas/src/app/checkout/page.tsx
+++ b/apps/sandbox-saas/src/app/checkout/page.tsx
@@ -84,12 +84,14 @@ async function handleCheckoutSubmit(e: FormEvent) {
       body: JSON.stringify({
         planId: selectedPlan.id,
         email,
-        currency: faultActive ? undefined : 'usd',
+        currency: 'usd',
         testCardLast4: cardNumber.replace(/\\s+/g, '').slice(-4),
       }),
     });
     if (!res.ok) {
-      if (faultActive) return; // Silent hang: never clears submitting state
+      const payload = await res.json().catch(() => ({ error: 'Checkout validation failed' }));
+      setErrorMessage(payload.error ?? 'Unable to initialize Stripe Test session');
+      setSubmitting(false);
       return;
     }`,
    prTitle: 'fix(stripe): send required currency and clear loading state on 422 validation error',
    prBranch: 'fix/fg-102-stripe-silent-loading',
    estimatedAgentCostUsd: 1.38,
    naiveBotCostUsd: 4.85,
  },

  'oauth-broken-state': {
    id: 'oauth-broken-state',
    code: 'F-03',
    title: 'Broken OAuth Redirect on Stale State Parameter',
    shortTitle: 'OAuth broken state',
    category: 'revenue-bug',
    flow: 'oauth-login',
    route: '/api/auth/oauth/callback',
    viewport: 'desktop',
    sensitiveArea: 'Auth / OAuth',
    expectedTriageAction: 'escalate',
    description:
      'OAuth callback rejects the state nonce issued by /api/auth/oauth/start due to a mismatched cookie key, redirecting users to /auth/error?reason=invalid_state instead of /onboarding.',
    revenueImpact: 'Blocks 100% of GitHub/Google OAuth signups before onboarding',
    selectorOrEndpoint: 'GET /api/auth/oauth/callback',
    evidenceBefore: '/evidence/oauth-broken-state-before.png',
    evidenceAfter: '/evidence/oauth-broken-state-after.png',
    reproTestFilename: 'tests/repro-fg-oauth-broken-state.spec.ts',
    reproTestCode: `import { test, expect } from '@playwright/test';

test('FG-103: GitHub OAuth sign-in must validate state nonce and reach /onboarding', async ({ page }) => {
  await page.goto('/login?fault=oauth-broken-state');
  await page.locator('#oauth-github-btn').click();
  await page.waitForLoadState('networkidle');

  expect(page.url()).not.toContain('/auth/error');
  await expect(page).toHaveURL(/\\/onboarding/);
});`,
    rootCause:
      'apps/sandbox-saas/src/app/api/auth/oauth/start/route.ts mutates the state query parameter without matching the signed oauth_state cookie checked in /api/auth/oauth/callback.',
    patchFile: 'apps/sandbox-saas/src/app/api/auth/oauth/start/route.ts',
    patchDiff: `--- a/apps/sandbox-saas/src/app/api/auth/oauth/start/route.ts
+++ b/apps/sandbox-saas/src/app/api/auth/oauth/start/route.ts
@@ -16,7 +16,7 @@ export async function GET(request: NextRequest) {
   const nonce = crypto.randomUUID();
-  const callbackState = faultBrokenState ? \`expired_\${nonce.slice(0, 8)}\` : nonce;
+  const callbackState = nonce;
 
   const callbackUrl = new URL('/api/auth/oauth/callback', request.url);
   callbackUrl.searchParams.set('provider', provider);
   callbackUrl.searchParams.set('state', callbackState);`,
    prTitle: 'fix(auth): keep OAuth callback state nonce aligned with signed session cookie',
    prBranch: 'fix/fg-103-oauth-state-mismatch',
    estimatedAgentCostUsd: 1.29,
    naiveBotCostUsd: 4.85,
  },

  'third-party-analytics-500': {
    id: 'third-party-analytics-500',
    code: 'F-04',
    title: 'Third-Party Analytics Script Returning HTTP 500',
    shortTitle: '3rd-party analytics 500',
    category: 'noise-trap',
    flow: 'stripe-checkout',
    route: '/checkout',
    viewport: 'desktop',
    sensitiveArea: 'None',
    expectedTriageAction: 'drop_third_party_noise',
    description:
      'A simulated third-party analytics beacon (metricpulse-cdn / Google Analytics class) throws HTTP 500 and console errors, while the first-party Stripe checkout button works normally.',
    revenueImpact: '$0 impact — classic false positive that drains naive AI SRE budgets',
    selectorOrEndpoint: 'https://cdn.metricpulse-analytics.invalid/collect',
    evidenceBefore: '/evidence/healthy-checkout.png',
    evidenceAfter: '/evidence/healthy-checkout.png',
    reproTestFilename: 'none (filtered before Phase A)',
    reproTestCode: '// Filtered by Triage Gate (Domain Filter). No Devin agent launched.',
    rootCause:
      'Non-blocking third-party telemetry endpoint returned 500. First-party checkout funnel completed with 200 OK.',
    patchFile: 'none',
    patchDiff: '// No PR created — third-party noise discarded cleanly at Triage Gate.',
    prTitle: 'N/A — Filtered at Triage Gate',
    prBranch: 'none',
    estimatedAgentCostUsd: 0,
    naiveBotCostUsd: 4.85,
  },

  'transient-504-retry': {
    id: 'transient-504-retry',
    code: 'F-05',
    title: 'Intermittent HTTP 504 on Attempt #1 (Self-Heals on Retry)',
    shortTitle: 'Transient 504 blip',
    category: 'noise-trap',
    flow: 'stripe-checkout',
    route: '/api/checkout',
    viewport: 'desktop',
    sensitiveArea: 'None',
    expectedTriageAction: 'recovered_on_retry',
    description:
      '/api/checkout returns a transient 504 Gateway Timeout on the first probe attempt, then recovers cleanly (200 OK) on the staggered retry.',
    revenueImpact: '$0 sustained impact — transient upstream cold-start blip',
    selectorOrEndpoint: 'POST /api/checkout',
    evidenceBefore: '/evidence/healthy-checkout.png',
    evidenceAfter: '/evidence/healthy-checkout.png',
    reproTestFilename: 'none (recovered during staggered retry)',
    reproTestCode: '// Recovered on staggered retry #1. Logged silently; zero agents launched.',
    rootCause:
      'Transient 504 on attempt #1 recovered automatically on retry #2 without code changes.',
    patchFile: 'none',
    patchDiff: '// No PR created — recovered automatically during staggered retry window.',
    prTitle: 'N/A — Auto-recovered on retry',
    prBranch: 'none',
    estimatedAgentCostUsd: 0,
    naiveBotCostUsd: 4.85,
  },
};

export const FAULT_LIST: FaultScenarioSpec[] = Object.values(FAULT_SCENARIOS);

export function isValidFaultId(value: string): value is FaultId {
  return value in FAULT_SCENARIOS;
}
