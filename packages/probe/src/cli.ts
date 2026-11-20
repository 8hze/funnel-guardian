import { isAbsolute, resolve } from 'node:path';
import {
  GitHubAdapter,
  LinearAdapter,
  runFunnelGuardianPipeline,
} from '@funnel-guardian/orchestrator';
import {
  DedupeEngine,
  DEFAULT_BUDGET_STATE,
  DEMO_RETRY_POLICY,
  FAULT_LIST,
  isValidFaultId,
  type FaultId,
} from '@funnel-guardian/triage-gate';
import { captureEvidencePack, runPlaywrightProbe } from './playwright-runner.ts';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const targetUrl = getArg('--target') || 'http://localhost:3000';
  const faultArg = getArg('--fault');
  const isBenchmark = hasFlag('--benchmark');
  const captureDir = getArg('--capture-evidence');

  if (captureDir) {
    const baseCwd = process.env.INIT_CWD || process.cwd();
    const resolvedDir = isAbsolute(captureDir) ? captureDir : resolve(baseCwd, captureDir);
    console.log(`[Funnel Guardian Probe] Capturing real Chromium Playwright evidence from ${targetUrl} -> ${resolvedDir}`);
    const files = await captureEvidencePack(targetUrl, resolvedDir);
    for (const f of files) {
      console.log(`  captured ${f}`);
    }
    return;
  }

  const parsedHost = new URL(targetUrl).host;
  const dedupe = new DedupeEngine();
  const linear = new LinearAdapter();
  const github = new GitHubAdapter();
  let budget = { ...DEFAULT_BUDGET_STATE };

  const scenarios: FaultId[] = isBenchmark
    ? FAULT_LIST.map((f) => f.id)
    : faultArg && isValidFaultId(faultArg)
      ? [faultArg]
      : ['checkout-mobile-overlap'];

  console.log(`\nFunnel Guardian CLI Probe (Real Chromium Playwright)`);
  console.log(`Target: ${targetUrl} | Scenarios: ${scenarios.join(', ')}\n`);

  let totalCost = 0;
  let totalNaive = 0;
  let noiseFiltered = 0;
  let revenueBugsCaught = 0;

  for (const faultId of scenarios) {
    const initial = await runPlaywrightProbe({ targetUrl, faultId, attempt: 1 });
    const { result, updatedBudget } = await runFunnelGuardianPipeline({
      faultId,
      targetUrl,
      firstPartyHost: parsedHost,
      budget,
      dedupe,
      linear,
      github,
      retryPolicy: DEMO_RETRY_POLICY,
      initialObservation: initial,
      reprobeFn: (attempt) => runPlaywrightProbe({ targetUrl, faultId, attempt }),
    });
    budget = updatedBudget;
    totalCost += result.totalCostUsd;
    totalNaive += result.naiveCostUsd;
    if (result.finalStatus === 'filtered_noise' || result.finalStatus === 'recovered_retry') {
      noiseFiltered += 1;
    }
    if (result.finalStatus === 'needs_human_approval') {
      revenueBugsCaught += 1;
    }

    console.log(`[${result.scenarioCode}] ${result.scenarioTitle}`);
    console.log(`  Probe:    ${result.probe.engineMode} | ${result.probe.viewport} | ${result.probe.errorType} (${result.probe.durationMs}ms)`);
    console.log(`  Triage:   ${result.triage.action} (hash=${result.triage.incidentHash})`);
    console.log(`  Outcome:  ${result.finalStatus} | Cost: $${result.totalCostUsd.toFixed(2)} (Naive: $${result.naiveCostUsd.toFixed(2)})`);
    if (result.pullRequest) {
      console.log(`  PR Ready: #${result.pullRequest.number} ${result.pullRequest.title} [Needs You: ${result.pullRequest.sensitiveArea}]`);
    }
    console.log('');
  }

  console.log(`--- Summary ---`);
  console.log(`Real Revenue Bugs Caught & Patched: ${revenueBugsCaught}`);
  console.log(`False Positives / Noise Blocked:    ${noiseFiltered}`);
  console.log(`Total Spend: $${totalCost.toFixed(2)} vs Naive Bot: $${totalNaive.toFixed(2)} (Saved: $${(totalNaive - totalCost).toFixed(2)})\n`);
}

main().catch((err) => {
  console.error('[Funnel Guardian Probe Error]', err);
  process.exit(1);
});
