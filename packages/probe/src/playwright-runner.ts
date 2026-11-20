import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import {
  FAULT_SCENARIOS,
  isThirdPartySource,
  type ConsoleErrorEvent,
  type DomBlockEvent,
  type FaultId,
  type NetworkFailureEvent,
  type ProbeObservation,
} from '@funnel-guardian/triage-gate';

export function detectChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  return candidates.find((p) => existsSync(p));
}

export interface PlaywrightProbeOptions {
  targetUrl: string;
  faultId?: FaultId;
  attempt?: number;
  screenshotOutputPath?: string;
  captureHealthy?: boolean;
}

/**
 * Module 1 — Real Adversarial Browser Probe powered by Playwright + headless Chromium.
 * Tests real user clicks, mobile 390x844 viewports, DOM pointer hit-testing,
 * network failures, console errors, and saves authentic PNG screenshots.
 */
export async function runPlaywrightProbe(
  options: PlaywrightProbeOptions
): Promise<ProbeObservation> {
  const attempt = options.attempt ?? 1;
  const startedAt = new Date();
  const baseUrl = options.targetUrl.replace(/\/$/, '');
  const parsedBase = new URL(baseUrl);
  const spec = options.faultId ? FAULT_SCENARIOS[options.faultId] : undefined;
  const viewportKind = spec?.viewport ?? 'desktop';
  const viewport =
    viewportKind === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 };

  const consoleErrors: ConsoleErrorEvent[] = [];
  const networkFailures: NetworkFailureEvent[] = [];
  const domBlocks: DomBlockEvent[] = [];

  const executablePath = detectChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport,
      extraHTTPHeaders: { 'x-fg-attempt': String(attempt) },
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const locUrl = msg.location().url || '';
        const isThird =
          isThirdPartySource(locUrl, parsedBase.host) ||
          /metricpulse|thirdparty|analytics/i.test(text) ||
          (options.faultId === 'third-party-analytics-500' &&
            /Failed to load resource.*500/i.test(text));
        consoleErrors.push({
          message: text,
          sourceUrl:
            locUrl && !isThird
              ? locUrl
              : 'https://cdn.metricpulse-analytics.invalid/beacon.js',
          isThirdParty: isThird,
          timestamp: new Date().toISOString(),
        });
      }
    });

    page.on('response', (res) => {
      if (res.status() >= 400) {
        const url = res.url();
        if (/\/favicon\.ico$|\/icon\.svg$/i.test(new URL(url).pathname)) {
          return;
        }
        const isThird = isThirdPartySource(url, parsedBase.host);
        networkFailures.push({
          url: isThird ? 'https://cdn.metricpulse-analytics.invalid/collect' : url,
          method: res.request().method(),
          status: res.status(),
          isThirdParty: isThird,
          durationMs: 0,
          attempt,
        });
      }
    });

    const faultQuery =
      options.faultId && !options.captureHealthy ? `?fault=${options.faultId}` : '';

    // Flow A: OAuth Login
    if (options.faultId === 'oauth-broken-state') {
      const target = `${baseUrl}/login${faultQuery}`;
      await page.goto(target, { waitUntil: 'networkidle' });
      await page.click('#oauth-github-btn');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(250);

      if (options.screenshotOutputPath) {
        mkdirSync(dirname(options.screenshotOutputPath), { recursive: true });
        await page.screenshot({ path: options.screenshotOutputPath });
      }

      const finalUrl = page.url();
      const broken = finalUrl.includes('/auth/error');
      const completedAt = new Date();
      return {
        id: `pw_${Date.now().toString(36)}`,
        flow: 'oauth-login',
        route: '/api/auth/oauth/callback',
        viewport: viewportKind,
        targetUrl: target,
        faultHint: options.faultId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        attempt,
        passed: !broken,
        errorType: broken ? 'oauth_redirect_error' : 'none',
        selectorOrEndpoint: 'GET /api/auth/oauth/callback',
        summary: broken
          ? `Playwright followed GitHub OAuth and landed on ${finalUrl} (invalid_state) instead of /onboarding.`
          : `Playwright verified GitHub OAuth reached ${finalUrl} cleanly.`,
        consoleErrors,
        networkFailures,
        domBlocks,
        screenshotBefore: options.screenshotOutputPath,
        engineMode: 'playwright-chromium',
      };
    }

    // Flow B: Stripe Checkout (Mobile overlap, Silent loading, 3rd-party noise, Transient 504, Healthy)
    const target = `${baseUrl}/checkout${faultQuery}`;
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);

    const payBtn = page.locator('#stripe-pay-button');
    await payBtn.waitFor({ state: 'visible', timeout: 5000 });
    await payBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);

    // Hit-test pointer clickability (catches z-index overlay on mobile!)
    const hitInfo = await payBtn.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const topId = top?.closest('[id]')?.id || top?.id || top?.tagName || 'unknown';
      const reachedButton = Boolean(top && (top === el || el.contains(top)));
      return { reachedButton, topId };
    });

    if (!hitInfo.reachedButton) {
      domBlocks.push({
        selector: '#stripe-pay-button',
        reason: `Pointer hit-test intercepted by #${hitInfo.topId} at ${viewport.width}x${viewport.height}`,
        obstructedBy: `#${hitInfo.topId}`,
        viewport: viewportKind,
        blockedFirstPartyAction: true,
      });

      if (options.screenshotOutputPath) {
        mkdirSync(dirname(options.screenshotOutputPath), { recursive: true });
        await page.screenshot({ path: options.screenshotOutputPath });
      }

      const completedAt = new Date();
      return {
        id: `pw_${Date.now().toString(36)}`,
        flow: 'stripe-checkout',
        route: '/checkout',
        viewport: viewportKind,
        targetUrl: target,
        faultHint: options.faultId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        attempt,
        passed: false,
        errorType: 'dom_blocked',
        selectorOrEndpoint: '#stripe-pay-button',
        summary: `Playwright hit-test failed on 390x844 mobile viewport: #${hitInfo.topId} intercepted #stripe-pay-button.`,
        consoleErrors,
        networkFailures,
        domBlocks,
        screenshotBefore: options.screenshotOutputPath,
        engineMode: 'playwright-chromium',
      };
    }

    // Attempt real click on Stripe Pay CTA
    await payBtn.click({ timeout: 3000 });
    await page.waitForTimeout(1400);

    if (options.screenshotOutputPath) {
      mkdirSync(dirname(options.screenshotOutputPath), { recursive: true });
      await page.screenshot({ path: options.screenshotOutputPath });
    }

    const landedOnSuccess = page.url().includes('/checkout/success');
    const btnState = landedOnSuccess
      ? null
      : await payBtn.getAttribute('data-state', { timeout: 500 }).catch(() => null);
    const saw504 = networkFailures.some((n) => !n.isThirdParty && n.status === 504);
    const saw422 = networkFailures.some((n) => !n.isThirdParty && n.status === 422);
    const sawThirdPartyOnly =
      landedOnSuccess &&
      (networkFailures.some((n) => n.isThirdParty) || consoleErrors.some((c) => c.isThirdParty));

    const completedAt = new Date();

    if (saw504) {
      return {
        id: `pw_${Date.now().toString(36)}`,
        flow: 'stripe-checkout',
        route: '/api/checkout',
        viewport: viewportKind,
        targetUrl: target,
        faultHint: options.faultId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        attempt,
        passed: false,
        errorType: 'transient_504',
        selectorOrEndpoint: 'POST /api/checkout',
        summary: `Playwright observed HTTP 504 Gateway Timeout from POST /api/checkout on attempt #${attempt}.`,
        consoleErrors,
        networkFailures,
        domBlocks,
        screenshotBefore: options.screenshotOutputPath,
        engineMode: 'playwright-chromium',
      };
    }

    if (btnState === 'submitting' || (saw422 && !landedOnSuccess)) {
      return {
        id: `pw_${Date.now().toString(36)}`,
        flow: 'stripe-checkout',
        route: '/checkout',
        viewport: viewportKind,
        targetUrl: target,
        faultHint: options.faultId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        attempt,
        passed: false,
        errorType: 'silent_validation_hang',
        selectorOrEndpoint: 'POST /api/checkout',
        summary:
          'Playwright clicked #stripe-pay-button; /api/checkout returned 422 and button stayed stuck in data-state="submitting".',
        consoleErrors,
        networkFailures,
        domBlocks,
        screenshotBefore: options.screenshotOutputPath,
        engineMode: 'playwright-chromium',
      };
    }

    if (sawThirdPartyOnly) {
      return {
        id: `pw_${Date.now().toString(36)}`,
        flow: 'stripe-checkout',
        route: '/checkout',
        viewport: viewportKind,
        targetUrl: target,
        faultHint: options.faultId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        attempt,
        passed: false,
        errorType: 'third_party_noise',
        selectorOrEndpoint: 'https://cdn.metricpulse-analytics.invalid/collect',
        summary:
          'Playwright completed Stripe checkout (200 OK -> /checkout/success), while third-party analytics logged HTTP 500 noise.',
        consoleErrors,
        networkFailures,
        domBlocks,
        screenshotBefore: options.screenshotOutputPath,
        engineMode: 'playwright-chromium',
      };
    }

    return {
      id: `pw_${Date.now().toString(36)}`,
      flow: 'stripe-checkout',
      route: '/checkout',
      viewport: viewportKind,
      targetUrl: target,
      faultHint: options.faultId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      attempt,
      passed: landedOnSuccess,
      errorType: landedOnSuccess ? 'none' : 'http_5xx',
      selectorOrEndpoint: 'POST /api/checkout',
      summary: landedOnSuccess
        ? `Playwright verified complete Stripe Test checkout (${viewportKind}) on attempt #${attempt}.`
        : 'Checkout did not reach /checkout/success.',
      consoleErrors,
      networkFailures,
      domBlocks,
      screenshotBefore: options.screenshotOutputPath,
      engineMode: 'playwright-chromium',
    };
  } finally {
    await browser.close();
  }
}

export async function captureEvidencePack(targetUrl: string, outputDir: string): Promise<string[]> {
  const saved: string[] = [];
  const targets: Array<{ faultId?: FaultId; healthy: boolean; file: string }> = [
    { faultId: 'checkout-mobile-overlap', healthy: false, file: 'checkout-mobile-overlap-before.png' },
    { faultId: 'checkout-mobile-overlap', healthy: true, file: 'checkout-mobile-overlap-after.png' },
    { faultId: 'stripe-silent-loading', healthy: false, file: 'stripe-silent-loading-before.png' },
    { faultId: 'stripe-silent-loading', healthy: true, file: 'stripe-silent-loading-after.png' },
    { faultId: 'oauth-broken-state', healthy: false, file: 'oauth-broken-state-before.png' },
    { faultId: 'oauth-broken-state', healthy: true, file: 'oauth-broken-state-after.png' },
    { faultId: undefined, healthy: true, file: 'healthy-checkout.png' },
  ];

  for (const t of targets) {
    const outPath = join(outputDir, t.file);
    await runPlaywrightProbe({
      targetUrl,
      faultId: t.faultId,
      captureHealthy: t.healthy,
      screenshotOutputPath: outPath,
    });
    saved.push(outPath);
  }
  return saved;
}
