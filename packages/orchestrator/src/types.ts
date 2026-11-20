import type {
  FaultId,
  ProbeObservation,
  SensitiveArea,
  TriageDecision,
} from '@funnel-guardian/triage-gate';

export interface LinearTicket {
  id: string;
  title: string;
  state: 'Triage' | 'In Progress' | 'In Review' | 'Done' | 'Canceled';
  hash: string;
  url: string;
  mode: 'live-api' | 'local-ledger';
  createdAt: string;
}

export interface AgentPhaseReport {
  agent: 'Devin-1 (Repro)' | 'Devin-2 (Patch)' | 'Devin-3 (Visual QA)';
  phase: 'A' | 'B';
  status: 'reproduced_fail' | 'not_reproduced' | 'passed' | 'skipped';
  mode: 'devin-api' | 'local-engine';
  sessionId: string;
  durationMs: number;
  costUsd: number;
  acu: number;
  summary: string;
  logs: string[];
  artifactName?: string;
  artifactContent?: string;
}

export interface PullRequestRecord {
  number: number;
  title: string;
  branch: string;
  url: string;
  mode: 'github-api' | 'local-ledger';
  status: 'needs_approval' | 'merged' | 'rejected';
  ciStatus: 'passing';
  previewUrl: string;
  sensitiveArea: SensitiveArea;
  requiresHumanApproval: boolean;
  rootCause: string;
  patchFile: string;
  patchDiff: string;
  reproTestFilename: string;
  reproTestCode: string;
  evidenceBefore: string;
  evidenceAfter: string;
  totalCostUsd: number;
  naiveCostUsd: number;
  linearTicketId: string;
  incidentHash: string;
  faultId: FaultId;
  createdAt: string;
  approvedAt?: string;
}

export interface SafetyPolicyStatus {
  readOnlyProd: true;
  ephemeralPreviewOnly: true;
  stripeTestModeOnly: true;
  humanGateOnSensitiveChanges: true;
}

export type PipelineFinalStatus =
  | 'healthy'
  | 'filtered_noise'
  | 'recovered_retry'
  | 'deduplicated'
  | 'budget_capped'
  | 'not_reproduced'
  | 'needs_human_approval'
  | 'approved_merged';

export interface PipelineRunResult {
  runId: string;
  timestamp: string;
  faultId?: FaultId;
  scenarioCode: string;
  scenarioTitle: string;
  targetUrl: string;
  safetyPolicy: SafetyPolicyStatus;
  probe: ProbeObservation;
  triage: TriageDecision;
  linearTicket?: LinearTicket;
  phaseA?: AgentPhaseReport;
  phaseB?: {
    devin2: AgentPhaseReport;
    devin3: AgentPhaseReport;
    ranInParallel: true;
  };
  pullRequest?: PullRequestRecord;
  totalCostUsd: number;
  naiveCostUsd: number;
  costSavedUsd: number;
  finalStatus: PipelineFinalStatus;
}
