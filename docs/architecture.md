# Funnel Guardian — Architecture Specification

## 1. Design Philosophy

Traditional synthetic monitors (Checkly, Pingdom) and error trackers (Sentry) optimize for **alert volume**. For Seed and Series A SaaS teams without dedicated QA/SRE engineers, alerts pile up while silent revenue regressions (mobile CSS z-index overlaps, swallowed Stripe validation failures, broken OAuth state callbacks) bleed MRR unnoticed.

Naively attaching autonomous coding agents directly to raw browser alerts creates the opposite failure mode: burning hundreds of dollars overnight chasing third-party analytics 500s, transient upstream 504s, and duplicate alerts.

Funnel Guardian solves both problems with a **5-module gated pipeline** anchored on a deterministic **Triage Gate**.

---

## 2. Pipeline Dataflow

```text
[1. Browser Probe] ──▶ [2. Triage Gate] ──▶ [3. Deduplication] ──▶ [4. Staged Fan-Out] ──▶ [5. Human Approval]
```

### Module 1: Browser Probe (`packages/probe`)
- Executes adversarial user journeys against signup, OAuth login, onboarding, and Stripe checkout.
- Tests both desktop (`1280x800`) and narrow mobile (`390x844`) viewports.
- Evaluates real DOM pointer hit-testing via `document.elementFromPoint()` to detect overlapping elements invisible to DOM-only unit tests.
- Classifies every captured console error and HTTP failure as first-party vs. third-party.

### Module 2: Triage Gate (`packages/triage-gate`)
Every failed probe observation must pass three deterministic filters before any AI agent is invoked:
1. **Domain Filter**: Discards third-party errors (`google-analytics.com`, `intercom.io`, `connect.facebook.net`, `metricpulse-analytics`, `/api/thirdparty/*`) **unless** `blockedFirstPartyAction === true` (e.g., a third-party widget physically intercepts clicks on `#stripe-pay-button`).
2. **Staggered Retries**: Transient `502/503/504` or network timeout errors trigger staggered re-probes (`1 min -> 3 min` in production; accelerated in demo mode). If the funnel recovers, the blip is logged silently at `$0.00`.
3. **Hard Nightly Budget Cap**: Rejects new escalations if projected spend exceeds `dailyCapUsd` or `runsUsed >= maxRunsPerNight`.

### Module 3: Deduplication & Cooldown (`packages/triage-gate` + `packages/orchestrator`)
- Computes a deterministic fingerprint:
  ```text
  sha256(flow | errorType | route | selectorOrEndpoint).slice(0, 12)
  ```
- Checks the Linear queue (`LINEAR_API_KEY` GraphQL adapter or local ledger) and active 6-hour cooldown window.
- Repeated occurrences increment the occurrence counter and drop silently at `$0.00`.

### Module 4: Staged Fan-Out (`packages/orchestrator`)
- **Phase A (Devin-1 — Verification Only)**: Writes a minimal deterministic Playwright repro spec against the repository and runs it twice (`--repeat-each=2`). If the test passes (bug not reproduced), the pipeline halts and Phase B is never launched.
- **Phase B (Parallel Devin-2 + Devin-3)**:
  - **Devin-2 (Patch)**: Isolates root cause, applies the smallest clean fix on branch `fix/fg-...`, runs typecheck/tests, and opens a Pull Request.
  - **Devin-3 (Visual QA)**: Runs the Playwright repro and captures before/after screenshots on the isolated Vercel Preview Deployment URL.

### Module 5: Human Approval Gate ("Needs You")
- Pull Requests modifying Stripe checkout, pricing, OAuth authentication, or visible customer UI cannot auto-merge.
- Mission Control surfaces the root cause summary, unified git diff, real Chromium before/after visual captures, run cost vs. naive bot cost, and one-click **Approve & Merge** / **Reject** controls.

---

## 3. Non-Negotiable Security & Safety Rules

1. **Read-Only Production**: Production probes never mutate customer state or create real invoices.
2. **Stripe Test Mode Guard**: `/api/checkout` explicitly aborts with HTTP `403` if `STRIPE_SECRET_KEY` starts with `sk_live_`.
3. **Ephemeral Preview Isolation**: All code modifications and write-path verifications run solely in ephemeral preview deployments.
4. **Adapter Pluggability**: External credentials (`DEVIN_API_KEY`, `LINEAR_API_KEY`, `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`) upgrade each module to live external API calls automatically; when absent, the local deterministic engine executes the exact same state machine cleanly.
