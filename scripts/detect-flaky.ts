/** @file scripts/detect-flaky.ts — re-runs the suites to surface non-deterministic tests. */
//
// A test is "flaky" when it passes on some runs and fails on others with no code
// change. This runs each workspace's vitest suite N times with retries DISABLED
// (so a flake isn't auto-healed the way CI does) and reports:
//   - flaky tests   — an assertion whose pass/fail outcome varies across runs;
//   - flaky suites  — a package that passes on some runs and fails on others
//                     (catches non-assertion failures: import/collection errors,
//                     top-level throws, crashes — which produce no assertions);
//   - broken suites — a package that fails on every run (persistent red).
// Wired to a nightly, non-blocking workflow (.github/workflows/flaky.yml). Pass
// --strict to exit non-zero when a flake is found.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runsArg = process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1];
const rawRuns = process.env.FLAKY_RUNS ?? runsArg;
const RUNS = rawRuns === undefined || rawRuns === '' ? 3 : Number(rawRuns);
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error(
    `Invalid --runs / FLAKY_RUNS: ${JSON.stringify(rawRuns)} (must be a positive integer).`,
  );
  process.exit(2);
}
const strict = process.argv.includes('--strict');

// Workspaces with a vitest suite. A package with no tests simply yields an empty
// report and is skipped.
const PACKAGES = ['@edna/api', '@edna/csms', '@edna/worker', '@edna/mobile', '@edna/db'];

type Tally = { passed: number; failed: number };
const testOutcomes = new Map<string, Tally>();
const suiteOutcomes = new Map<string, Tally>();

function tally(map: Map<string, Tally>, key: string, passed: boolean): void {
  const t = map.get(key) ?? { passed: 0, failed: 0 };
  if (passed) t.passed += 1;
  else t.failed += 1;
  map.set(key, t);
}

function runSuiteOnce(pkg: string): void {
  const out = join(mkdtempSync(join(tmpdir(), 'flaky-')), 'report.json');
  let suiteOk = true;
  try {
    execFileSync(
      'pnpm',
      ['-F', pkg, 'exec', 'vitest', 'run', '--reporter=json', `--outputFile=${out}`],
      // Force retries off (unset CI) so a real flake shows through instead of
      // being masked by the CI auto-retry.
      { stdio: 'ignore', env: { ...process.env, CI: '' } },
    );
  } catch {
    // Non-zero exit = the suite failed this run (assertion OR collection/crash).
    suiteOk = false;
  }
  let report: {
    testResults?: {
      name?: string;
      status?: string;
      assertionResults?: { fullName?: string; title?: string; status?: string }[];
    }[];
  };
  try {
    report = JSON.parse(readFileSync(out, 'utf8'));
  } catch {
    // No report at all (e.g. a package with no test script). If the run also
    // errored, still record the suite-level failure so it isn't invisible.
    if (!suiteOk) tally(suiteOutcomes, pkg, false);
    return;
  }
  tally(suiteOutcomes, pkg, suiteOk);
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (t.status !== 'passed' && t.status !== 'failed') continue; // skip skipped/todo
      tally(
        testOutcomes,
        `${pkg} :: ${t.fullName || t.title || '(unnamed)'}`,
        t.status === 'passed',
      );
    }
  }
}

console.log(`Flaky scan: ${RUNS} run(s) across ${PACKAGES.length} package(s), retries disabled.`);
for (let run = 1; run <= RUNS; run++) {
  console.log(`— run ${run}/${RUNS}`);
  for (const pkg of PACKAGES) runSuiteOnce(pkg);
}

const flakyTests = [...testOutcomes.entries()].filter(([, o]) => o.passed > 0 && o.failed > 0);
const flakySuites = [...suiteOutcomes.entries()].filter(([, o]) => o.passed > 0 && o.failed > 0);
const brokenSuites = [...suiteOutcomes.entries()].filter(([, o]) => o.passed === 0 && o.failed > 0);

if (flakyTests.length === 0 && flakySuites.length === 0 && brokenSuites.length === 0) {
  console.log(`No flaky or failing suites detected over ${RUNS} run(s).`);
  process.exit(0);
}

if (flakyTests.length > 0) {
  console.log(`\nFlaky test(s) — assertion outcome varied across runs:`);
  for (const [key, o] of flakyTests)
    console.log(`  - ${key}  (passed ${o.passed}, failed ${o.failed} of ${RUNS})`);
}
if (flakySuites.length > 0) {
  console.log(
    `\nFlaky suite(s) — the package passed on some runs and failed on others (e.g. an intermittent collection/import error):`,
  );
  for (const [key, o] of flakySuites)
    console.log(`  - ${key}  (passed ${o.passed}, failed ${o.failed} of ${RUNS})`);
}
if (brokenSuites.length > 0) {
  console.log(`\nSuite(s) failing on EVERY run (persistent red, not flaky — fix directly):`);
  for (const [key, o] of brokenSuites) console.log(`  - ${key}  (failed ${o.failed} of ${RUNS})`);
}
console.log(
  '\nQuarantine a flake as *.flaky.test.ts and open a tracking issue — see docs/TESTING.md.',
);

// --strict fails only on flakiness (non-determinism); a persistently-broken suite
// is a normal red that the regular test gate already catches.
process.exit(strict && (flakyTests.length > 0 || flakySuites.length > 0) ? 1 : 0);
