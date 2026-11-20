# Funnel Guardian

**Autonomous revenue-funnel reliability and self-healing system for SaaS teams.**

Funnel Guardian monitors the exact user journeys that generate revenue — **signup, OAuth login, onboarding, and Stripe checkout** — filters false positives through a deterministic **Triage Gate**, reproduces confirmed regressions with Playwright, and delivers a **verified Pull Request with before/after visual evidence** gated by human approval.

---

## Core Architecture (5 Modules)

```text
[1. Browser Probe] ──▶ [2. Triage Gate] ──▶ [3. Deduplication] ──▶ [4. Staged Fan-Out] ──▶ [5. Human Approval]
 (Playwright 24/7)     (Noise filters)      (SHA-256 + Linear)     (Devin 1 -> 2 + 3)       (PR + Needs You)
```

1. **Browser Probe (`packages/probe`)**: Runs adversarial Playwright flows across desktop (`1280x800`) and narrow mobile (`390x844`) viewports, checking pointer hit-tests (`elementFromPoint`), console errors, HTTP status codes, and OAuth state redirects.
2. **Triage Gate (`packages/triage-gate`)**:
   - **Domain Filter**: Ignores third-party scripts (Google Analytics, Intercom, Meta Pixel, third-party beacons) unless they obstruct a first-party revenue CTA in the DOM.
   - **Staggered Retries**: Retries transient `504` / timeout failures (`1 min -> 3 min` in prod; accelerated in demo mode). Self-healing blips are logged silently at `$0.00`.
   - **Hard Nightly Budget Cap**: Enforces strict daily USD and nightly agent run limits.
3. **Deduplication (`packages/triage-gate`)**: Computes a deterministic SHA-256 hash (`flow | errorType | route | selectorOrEndpoint`), cross-checks open Linear tickets, and enforces a 6-hour cooldown.
4. **Staged Fan-Out (`packages/orchestrator`)**:
   - **Phase A (Verification)**: Launches **Devin-1** alone to write a deterministic Playwright repro spec. If the test passes (not reproducible), execution stops immediately.
   - **Phase B (Patch + Visual QA)**: Only after consistent FAIL, launches **Devin-2** (root cause + minimal patch + PR) and **Devin-3** (ephemeral Preview Deployment verification + before/after screenshots) in parallel.
5. **Human Approval Gate ("Needs You")**: Any PR touching Stripe, pricing, auth, or visible checkout UI requires explicit human approval with before/after visual evidence, unified diff, and run cost breakdown.

---

## Non-Negotiable Safety Invariant

- **Production is strictly read-only** (or isolated synthetic accounts).
- **Zero live charges**: Stripe Test Mode guard rejects `sk_live_` keys.
- **Ephemeral previews only**: Repros and patches run exclusively on isolated preview deployments.
- **Human merge gate**: Sensitive payment, OAuth, and UX PRs always require human sign-off.

---

## Monorepo Structure

```text
funnel-guardian/
├── apps/
│   └── sandbox-saas/          # Next.js App Router SaaS ("LedgerFlow") + Mission Control (/guardian)
│       ├── src/app/           # /guardian, /signup, /login, /onboarding, /pricing, /checkout
│       ├── src/faults/        # 5 injectable synthetic faults
│       └── public/evidence/   # Real Chromium Playwright before/after captures
├── packages/
│   ├── probe/                 # Real Playwright browser probe + CLI + serverless HTTP/DOM probe
│   ├── triage-gate/           # Domain filter, staggered retries, SHA-256 dedupe, budget cap + tests
│   └── orchestrator/          # Linear, Devin API, GitHub PR adapters & Staged Fan-Out engine
└── docs/
    ├── architecture.md        # Public system specification
    └── benchmarks.md          # Measured precision, noise suppression, and cost per PR
```

---

## Quickstart

```bash
npm install
npm test          # Run Triage Gate unit test suite
npm run dev       # Start LedgerFlow Sandbox + Mission Control on http://localhost:3000
```

Open:
- **Mission Control Console**: `http://localhost:3000/guardian`
- **Sandbox SaaS Checkout**: `http://localhost:3000/checkout`

### Run the Real Chromium Playwright CLI Probe

With `npm run dev` (or `npm run start`) running:

```bash
# Single scenario
npm run probe -- --target http://localhost:3000 --fault checkout-mobile-overlap

# Full 5-scenario benchmark suite (3 real revenue bugs + 2 noise traps)
npm run benchmark -- --target http://localhost:3000
```

---

## 5 Synthetic Fault Scenarios (`src/faults/`)

| Code | Fault ID | Class | Expected Gate Outcome |
| :--- | :--- | :--- | :--- |
| `F-01` | `checkout-mobile-overlap` | Revenue Bug | Escalate -> Phase A FAIL -> PR + Needs Approval (`Checkout UX`) |
| `F-02` | `stripe-silent-loading` | Revenue Bug | Escalate -> Phase A FAIL -> PR + Needs Approval (`Stripe / Payments`) |
| `F-03` | `oauth-broken-state` | Revenue Bug | Escalate -> Phase A FAIL -> PR + Needs Approval (`Auth / OAuth`) |
| `F-04` | `third-party-analytics-500` | Noise Trap | Dropped at Domain Filter -> **0 agents / $0.00** |
| `F-05` | `transient-504-retry` | Noise Trap | Recovered on Staggered Retry #2 -> **0 agents / $0.00** |

See [docs/architecture.md](docs/architecture.md) and [docs/benchmarks.md](docs/benchmarks.md) for full details.
