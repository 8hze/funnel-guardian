'use client';

import { useEffect } from 'react';

/**
 * Fault F-04: Non-blocking third-party analytics script returning HTTP 500.
 * Demonstrates that Funnel Guardian's Triage Gate Domain Filter ignores
 * 3rd-party telemetry noise as long as first-party checkout stays functional.
 */
export function ThirdPartyScript({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function fireBeacon() {
      try {
        const res = await fetch('/api/thirdparty/analytics?fault=third-party-analytics-500', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor: 'metricpulse-analytics',
            event: 'checkout_viewed',
          }),
        });
        if (!res.ok && !cancelled) {
          console.error(
            `[metricpulse-analytics] Beacon collector returned HTTP ${res.status} (https://cdn.metricpulse-analytics.invalid/collect)`
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[metricpulse-analytics] Collector network error', err);
        }
      }
    }

    fireBeacon();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return null;
}
