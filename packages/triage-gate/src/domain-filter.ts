import type { ProbeObservation, TriageFilterStage } from './types.ts';

export const THIRD_PARTY_PATTERNS: RegExp[] = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /intercom\.io/i,
  /widget\.intercom\.io/i,
  /connect\.facebook\.net/i,
  /meta-pixel/i,
  /segment\.io/i,
  /hotjar\.com/i,
  /mixpanel\.com/i,
  /amplitude\.com/i,
  /metricpulse-analytics/i,
  /\/api\/thirdparty\//i,
];

export function isThirdPartySource(url: string, firstPartyHost?: string): boolean {
  if (!url) return false;
  if (THIRD_PARTY_PATTERNS.some((pattern) => pattern.test(url))) {
    return true;
  }
  if (!firstPartyHost) return false;
  try {
    const parsed = new URL(url);
    return parsed.host !== firstPartyHost;
  } catch {
    return false;
  }
}

export interface DomainFilterResult {
  passedToNextStage: boolean;
  isThirdPartyNoiseOnly: boolean;
  stage: TriageFilterStage;
}

/**
 * Filter 1: Domain Filter.
 * Ignores third-party script/network failures (GA, Intercom, Meta Pixel, etc.)
 * UNLESS a first-party revenue action was blocked in the DOM or failed first-party HTTP.
 */
export function evaluateDomainFilter(
  observation: ProbeObservation,
  firstPartyHost?: string
): DomainFilterResult {
  const start = Date.now();

  const hasFirstPartyDomBlock = observation.domBlocks.some(
    (block) => block.blockedFirstPartyAction
  );

  const firstPartyNetworkFailures = observation.networkFailures.filter(
    (f) => !f.isThirdParty && !isThirdPartySource(f.url, firstPartyHost)
  );
  const thirdPartyNetworkFailures = observation.networkFailures.filter(
    (f) => f.isThirdParty || isThirdPartySource(f.url, firstPartyHost)
  );

  const firstPartyConsoleErrors = observation.consoleErrors.filter(
    (e) => !e.isThirdParty && !isThirdPartySource(e.sourceUrl, firstPartyHost)
  );
  const thirdPartyConsoleErrors = observation.consoleErrors.filter(
    (e) => e.isThirdParty || isThirdPartySource(e.sourceUrl, firstPartyHost)
  );

  const hasFirstPartyFailure =
    hasFirstPartyDomBlock ||
    firstPartyNetworkFailures.length > 0 ||
    firstPartyConsoleErrors.length > 0 ||
    observation.errorType === 'dom_blocked' ||
    observation.errorType === 'silent_validation_hang' ||
    observation.errorType === 'oauth_redirect_error' ||
    observation.errorType === 'transient_504' ||
    observation.errorType === 'http_5xx';

  const hasThirdPartySignals =
    thirdPartyNetworkFailures.length > 0 ||
    thirdPartyConsoleErrors.length > 0 ||
    observation.errorType === 'third_party_noise';

  if (!hasFirstPartyFailure && hasThirdPartySignals) {
    return {
      passedToNextStage: false,
      isThirdPartyNoiseOnly: true,
      stage: {
        stage: 'domain_filter',
        outcome: 'dropped',
        durationMs: Math.max(4, Date.now() - start),
        reason: `Ignored ${thirdPartyNetworkFailures.length} third-party HTTP error(s) and ${thirdPartyConsoleErrors.length} third-party console error(s): first-party revenue CTA remained clickable and healthy.`,
        details: {
          thirdPartyNetworkErrors: thirdPartyNetworkFailures.length,
          thirdPartyConsoleErrors: thirdPartyConsoleErrors.length,
          blockedFirstPartyAction: false,
        },
      },
    };
  }

  if (hasFirstPartyDomBlock && hasThirdPartySignals) {
    return {
      passedToNextStage: true,
      isThirdPartyNoiseOnly: false,
      stage: {
        stage: 'domain_filter',
        outcome: 'passed',
        durationMs: Math.max(4, Date.now() - start),
        reason:
          'Third-party asset blocked a first-party checkout action in the DOM. Override rule triggered: escalating as P0 first-party revenue incident.',
        details: {
          blockedFirstPartyAction: true,
          overrideRuleApplied: true,
        },
      },
    };
  }

  return {
    passedToNextStage: true,
    isThirdPartyNoiseOnly: false,
    stage: {
      stage: 'domain_filter',
      outcome: 'passed',
      durationMs: Math.max(3, Date.now() - start),
      reason: `Confirmed first-party impact on ${observation.route} (${observation.selectorOrEndpoint}).`,
      details: {
        firstPartyNetworkErrors: firstPartyNetworkFailures.length,
        firstPartyDomBlocks: observation.domBlocks.length,
        blockedFirstPartyAction: hasFirstPartyDomBlock,
      },
    },
  };
}
