export type FaultId =
  | 'checkout-mobile-overlap'
  | 'stripe-silent-loading'
  | 'oauth-broken-state'
  | 'third-party-analytics-500'
  | 'transient-504-retry';

export type FlowName =
  | 'signup'
  | 'oauth-login'
  | 'onboarding'
  | 'stripe-checkout';

export type ViewportKind = 'desktop' | 'mobile';

export type SensitiveArea =
  | 'Stripe / Payments'
  | 'Auth / OAuth'
  | 'Checkout UX'
  | 'None';

export type ErrorType =
  | 'none'
  | 'dom_blocked'
  | 'silent_validation_hang'
  | 'oauth_redirect_error'
  | 'third_party_noise'
  | 'transient_504'
  | 'http_5xx'
  | 'console_error';

export interface ConsoleErrorEvent {
  message: string;
  sourceUrl: string;
  isThirdParty: boolean;
  timestamp: string;
}

export interface NetworkFailureEvent {
  url: string;
  method: string;
  status: number;
  isThirdParty: boolean;
  durationMs: number;
  attempt: number;
}

export interface DomBlockEvent {
  selector: string;
  reason: string;
  obstructedBy?: string;
  viewport: ViewportKind;
  blockedFirstPartyAction: boolean;
}

export interface ProbeObservation {
  id: string;
  flow: FlowName;
  route: string;
  viewport: ViewportKind;
  targetUrl: string;
  faultHint?: FaultId;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  attempt: number;
  passed: boolean;
  errorType: ErrorType;
  selectorOrEndpoint: string;
  summary: string;
  consoleErrors: ConsoleErrorEvent[];
  networkFailures: NetworkFailureEvent[];
  domBlocks: DomBlockEvent[];
  screenshotBefore?: string;
  tracePath?: string;
  engineMode: 'playwright-chromium' | 'live-http-dom';
}

export interface TriageFilterStage {
  stage: 'domain_filter' | 'staggered_retry' | 'budget_cap' | 'deduplication';
  outcome: 'passed' | 'dropped' | 'recovered' | 'blocked';
  reason: string;
  durationMs: number;
  details?: Record<string, string | number | boolean>;
}

export type TriageAction =
  | 'escalate'
  | 'drop_third_party_noise'
  | 'recovered_on_retry'
  | 'drop_duplicate'
  | 'blocked_budget_cap'
  | 'healthy';

export interface TriageDecision {
  incidentHash: string;
  action: TriageAction;
  shouldTriggerAgents: boolean;
  reason: string;
  stages: TriageFilterStage[];
  retriesExecuted: number;
  estimatedCostSavedUsd: number;
  existingLinearTicketId?: string;
}

export interface BudgetState {
  dailyCapUsd: number;
  maxRunsPerNight: number;
  spentUsd: number;
  runsUsed: number;
  estimatedRunCostUsd: number;
}

export interface DedupeRecord {
  hash: string;
  linearTicketId: string;
  faultId?: FaultId;
  flow: FlowName;
  route: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  cooldownUntil: string;
  status: 'open' | 'resolved';
}

export interface FaultScenarioSpec {
  id: FaultId;
  code: string;
  title: string;
  shortTitle: string;
  category: 'revenue-bug' | 'noise-trap';
  flow: FlowName;
  route: string;
  viewport: ViewportKind;
  sensitiveArea: SensitiveArea;
  expectedTriageAction: TriageAction;
  description: string;
  revenueImpact: string;
  selectorOrEndpoint: string;
  evidenceBefore: string;
  evidenceAfter: string;
  reproTestFilename: string;
  reproTestCode: string;
  rootCause: string;
  patchFile: string;
  patchDiff: string;
  prTitle: string;
  prBranch: string;
  estimatedAgentCostUsd: number;
  naiveBotCostUsd: number;
}
