# Funnel Guardian — Benchmarks & Cost Analysis

Measured against the 5 injectable synthetic faults in `apps/sandbox-saas` using real headless Chromium Playwright (`packages/probe`) + `packages/triage-gate` + `packages/orchestrator`.

## Scenario Benchmark Table

| Code | Fault Scenario | Category | Probe Detection | Triage Gate Decision | Agents Launched | Funnel Guardian Cost | Naive AI Bot Cost | Savings |
| :--- | :--- | :--- | :--- | :--- | :--- | ---: | ---: | ---: |
| `F-01` | Mobile checkout CTA obstructed (`z-index: 60`) | Revenue Bug | `dom_blocked` (390x844 hit-test) | Escalate (`fg_...`) | Devin 1 -> 2 + 3 | `$1.42` | `$4.85` | `70.7%` |
| `F-02` | Stripe Test silent 422 infinite loading | Revenue Bug | `silent_validation_hang` | Escalate (`fg_...`) | Devin 1 -> 2 + 3 | `$1.38` | `$4.85` | `71.5%` |
| `F-03` | OAuth callback invalid `state` redirect | Revenue Bug | `oauth_redirect_error` | Escalate (`fg_...`) | Devin 1 -> 2 + 3 | `$1.29` | `$4.85` | `73.4%` |
| `F-04` | 3rd-party analytics script HTTP 500 | Noise Trap | `third_party_noise` | **Dropped (Domain Filter)** | `0` | `$0.00` | `$4.85` | `100.0%` |
| `F-05` | Intermittent HTTP 504 on attempt #1 | Noise Trap | `transient_504` | **Recovered (Retry #2)** | `0` | `$0.00` | `$4.85` | `100.0%` |
| `F-01` (2x) | Repeated alert within 6h cooldown | Duplicate | `dom_blocked` | **Dropped (Dedupe SHA-256)** | `0` | `$0.00` | `$4.85` | `100.0%` |

## Aggregate Metrics (6-Event Benchmark)

- **Revenue Bug Recall**: `3 / 3` (`100%`)
- **False Positive / Noise Suppression**: `3 / 3` (`100%` — third-party 500, transient 504, duplicate)
- **Zero-Cost Noise Filtering**: `$0.00` spent on all non-actionable incidents
- **Total Spend (Funnel Guardian)**: `$4.09` across all 6 events
- **Total Spend (Naive Ungated 3-Agent Fan-Out)**: `$29.10` (`6 x $4.85`)
- **Net Cost Reduction**: **`85.9%` (`$25.01` saved per cycle)**

*Note: Naive Bot Cost models an ungated bot spawning 3 parallel coding/QA sessions blindly on every browser alert without domain filtering, staggered retry, deduplication, or Phase A verification.*
