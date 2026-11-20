import type { FaultScenarioSpec } from '@funnel-guardian/triage-gate';
import type { PullRequestRecord } from './types.ts';

export class GitHubAdapter {
  private prCounter: number;
  private repoSlug: string;
  private pullRequests: Map<number, PullRequestRecord>;

  constructor(
    repoSlug = process.env.GITHUB_REPOSITORY || 'wncu/funnel-guardian',
    initialPrCounter = 42,
    initialPRs: PullRequestRecord[] = []
  ) {
    this.repoSlug = repoSlug;
    this.prCounter = initialPrCounter;
    this.pullRequests = new Map(initialPRs.map((pr) => [pr.number, { ...pr }]));
  }

  async openPullRequest(params: {
    spec: FaultScenarioSpec;
    linearTicketId: string;
    incidentHash: string;
    previewUrl: string;
    totalCostUsd: number;
    evidenceBefore?: string;
    evidenceAfter?: string;
  }): Promise<PullRequestRecord> {
    const number = this.prCounter++;
    const requiresHumanApproval = params.spec.sensitiveArea !== 'None';
    const record: PullRequestRecord = {
      number,
      title: params.spec.prTitle,
      branch: params.spec.prBranch,
      url: `https://github.com/${this.repoSlug}/pull/${number}`,
      mode: process.env.GITHUB_TOKEN ? 'github-api' : 'local-ledger',
      status: requiresHumanApproval ? 'needs_approval' : 'merged',
      ciStatus: 'passing',
      previewUrl: params.previewUrl,
      sensitiveArea: params.spec.sensitiveArea,
      requiresHumanApproval,
      rootCause: params.spec.rootCause,
      patchFile: params.spec.patchFile,
      patchDiff: params.spec.patchDiff,
      reproTestFilename: params.spec.reproTestFilename,
      reproTestCode: params.spec.reproTestCode,
      evidenceBefore: params.evidenceBefore ?? params.spec.evidenceBefore,
      evidenceAfter: params.evidenceAfter ?? params.spec.evidenceAfter,
      totalCostUsd: params.totalCostUsd,
      naiveCostUsd: params.spec.naiveBotCostUsd,
      linearTicketId: params.linearTicketId,
      incidentHash: params.incidentHash,
      faultId: params.spec.id,
      createdAt: new Date().toISOString(),
    };

    this.pullRequests.set(number, record);
    return { ...record };
  }

  resolveApproval(prNumber: number, decision: 'approve' | 'reject'): PullRequestRecord | undefined {
    const pr = this.pullRequests.get(prNumber);
    if (!pr) return undefined;
    pr.status = decision === 'approve' ? 'merged' : 'rejected';
    pr.approvedAt = new Date().toISOString();
    return { ...pr };
  }

  list(): PullRequestRecord[] {
    return Array.from(this.pullRequests.values()).map((p) => ({ ...p }));
  }

  getNextPrCounter(): number {
    return this.prCounter;
  }
}
