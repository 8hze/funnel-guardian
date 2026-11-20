import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeIncidentHash,
  DedupeEngine,
  DEFAULT_BUDGET_STATE,
  evaluateTriageGate,
  type ProbeObservation,
} from './index.ts';

function makeObs(overrides: Partial<ProbeObservation>): ProbeObservation {
  const now = new Date().toISOString();
  return {
    id: 'obs-1',
    flow: 'stripe-checkout',
    route: '/checkout',
    viewport: 'mobile',
    targetUrl: 'http://localhost:3000/checkout',
    startedAt: now,
    completedAt: now,
    durationMs: 420,
    attempt: 1,
    passed: false,
    errorType: 'dom_blocked',
    selectorOrEndpoint: '#stripe-pay-button',
    summary: 'Checkout button intercepted by fixed promo banner',
    consoleErrors: [],
    networkFailures: [],
    domBlocks: [],
    engineMode: 'playwright-chromium',
    ...overrides,
  };
}

test('drops third-party analytics 500 errors when first-party checkout works', async () => {
  const dedupe = new DedupeEngine();
  const obs = makeObs({
    viewport: 'desktop',
    passed: false,
    errorType: 'third_party_noise',
    selectorOrEndpoint: 'https://cdn.metricpulse-analytics.invalid/collect',
    networkFailures: [
      {
        url: 'https://cdn.metricpulse-analytics.invalid/collect',
        method: 'POST',
        status: 500,
        isThirdParty: true,
        durationMs: 85,
        attempt: 1,
      },
    ],
    consoleErrors: [
      {
        message: 'Failed to load resource: 500 (metricpulse-analytics)',
        sourceUrl: 'https://cdn.metricpulse-analytics.invalid/beacon.js',
        isThirdParty: true,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const { decision } = await evaluateTriageGate(obs, {
    firstPartyHost: 'localhost:3000',
    budget: { ...DEFAULT_BUDGET_STATE },
    dedupe,
    retryPolicy: { delaysMs: [1, 1], scheduleLabel: 'test' },
    reprobeFn: async () => obs,
  });

  assert.equal(decision.action, 'drop_third_party_noise');
  assert.equal(decision.shouldTriggerAgents, false);
  assert.ok(decision.estimatedCostSavedUsd > 0);
});

test('escalates third-party script IF it blocks a first-party checkout button in the DOM', async () => {
  const dedupe = new DedupeEngine();
  const obs = makeObs({
    errorType: 'dom_blocked',
    domBlocks: [
      {
        selector: '#stripe-pay-button',
        reason: 'Element intercepted by third-party Intercom overlay',
        obstructedBy: '#intercom-container',
        viewport: 'mobile',
        blockedFirstPartyAction: true,
      },
    ],
    consoleErrors: [
      {
        message: 'Intercom widget warning',
        sourceUrl: 'https://widget.intercom.io/widget.js',
        isThirdParty: true,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const { decision } = await evaluateTriageGate(obs, {
    firstPartyHost: 'localhost:3000',
    budget: { ...DEFAULT_BUDGET_STATE },
    dedupe,
    retryPolicy: { delaysMs: [1, 1], scheduleLabel: 'test' },
    reprobeFn: async () => obs,
  });

  assert.equal(decision.action, 'escalate');
  assert.equal(decision.shouldTriggerAgents, true);
});

test('recovers silently on transient 504 after staggered retry without launching agents', async () => {
  const dedupe = new DedupeEngine();
  const initial = makeObs({
    errorType: 'transient_504',
    selectorOrEndpoint: 'POST /api/checkout',
    networkFailures: [
      {
        url: 'http://localhost:3000/api/checkout',
        method: 'POST',
        status: 504,
        isThirdParty: false,
        durationMs: 1200,
        attempt: 1,
      },
    ],
  });

  const { decision } = await evaluateTriageGate(initial, {
    firstPartyHost: 'localhost:3000',
    budget: { ...DEFAULT_BUDGET_STATE },
    dedupe,
    retryPolicy: { delaysMs: [5, 5], scheduleLabel: 'test' },
    reprobeFn: async (attempt) =>
      makeObs({
        attempt,
        passed: true,
        errorType: 'none',
        summary: 'Checkout recovered with 200 OK on retry',
      }),
  });

  assert.equal(decision.action, 'recovered_on_retry');
  assert.equal(decision.shouldTriggerAgents, false);
  assert.equal(decision.retriesExecuted, 1);
});

test('deduplicates repeated deterministic incidents within 6h cooldown window', async () => {
  const dedupe = new DedupeEngine();
  const obs = makeObs({
    domBlocks: [
      {
        selector: '#stripe-pay-button',
        reason: 'Obstructed by #promo-consent-banner',
        obstructedBy: '#promo-consent-banner',
        viewport: 'mobile',
        blockedFirstPartyAction: true,
      },
    ],
  });

  const first = await evaluateTriageGate(obs, {
    firstPartyHost: 'localhost:3000',
    budget: { ...DEFAULT_BUDGET_STATE },
    dedupe,
    retryPolicy: { delaysMs: [1, 1], scheduleLabel: 'test' },
    reprobeFn: async () => obs,
  });
  assert.equal(first.decision.action, 'escalate');

  dedupe.recordIncident(obs, 'FG-101');

  const second = await evaluateTriageGate(obs, {
    firstPartyHost: 'localhost:3000',
    budget: { ...DEFAULT_BUDGET_STATE },
    dedupe,
    retryPolicy: { delaysMs: [1, 1], scheduleLabel: 'test' },
    reprobeFn: async () => obs,
  });
  assert.equal(second.decision.action, 'drop_duplicate');
  assert.equal(second.decision.shouldTriggerAgents, false);
  assert.equal(second.decision.existingLinearTicketId, 'FG-101');
  assert.equal(second.decision.incidentHash, computeIncidentHash(obs));
});

test('blocks agent launch when hard daily budget cap is reached', async () => {
  const dedupe = new DedupeEngine();
  const obs = makeObs({
    errorType: 'oauth_redirect_error',
    flow: 'oauth-login',
    route: '/api/auth/oauth/callback',
    selectorOrEndpoint: 'GET /api/auth/oauth/callback',
  });

  const { decision } = await evaluateTriageGate(obs, {
    firstPartyHost: 'localhost:3000',
    budget: {
      dailyCapUsd: 2.0,
      maxRunsPerNight: 6,
      spentUsd: 1.5,
      runsUsed: 1,
      estimatedRunCostUsd: 1.4,
    },
    dedupe,
    retryPolicy: { delaysMs: [1, 1], scheduleLabel: 'test' },
    reprobeFn: async () => obs,
  });

  assert.equal(decision.action, 'blocked_budget_cap');
  assert.equal(decision.shouldTriggerAgents, false);
});
