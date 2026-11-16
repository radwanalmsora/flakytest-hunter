import { TestHistory, FlakyTest, RootCause, Cause } from "./types";

interface CauseRule {
  cause: Cause;
  keywords: RegExp;
  suggestion: string;
}

const CAUSE_RULES: CauseRule[] = [
  {
    cause: "timing",
    keywords: /timeout|timed out|exceeded|deadline|race condition|async|await|sleep|settimeout|slow|flaky timer|jest\.settimeout|mocha timeout/i,
    suggestion: "Timing flake: replace real timers with fake/mocked timers (jest.useFakeTimers, sinon fake timers), avoid fixed sleeps, and assert on awaited state instead of wall-clock delays. Quarantine only as a last resort.",
  },
  {
    cause: "network",
    keywords: /econnrefused|enotfound|etimedout|econnreset|socket hang up|fetch failed|network|5\d\d\b|status code 5|request failed|unreachable|dial tcp/i,
    suggestion: "Network flake: mock the HTTP layer (MSW, nock) in unit tests; in e2e, wait for readiness endpoints and retry idempotent calls with backoff. Never depend on external services in CI.",
  },
  {
    cause: "shared-data",
    keywords: /already exists|duplicate key|unique constraint|eaddrinuse|locked|lock conflict|resource busy|leftover|stale|conflict|409\b|file exists|database is locked/i,
    suggestion: "Shared-state flake: give each test its own database schema / temp dir / port (per-worker isolation), and reset state in beforeEach instead of relying on global cleanup. Check for unawaited async teardown.",
  },
  {
    cause: "order",
    keywords: /after all|beforeeach|state|leak|pollut|depends on|order|previous test|residue|not cleaned|cross-test/i,
    suggestion: "Order-dependent flake: make tests self-contained — rebuild fixtures per test, avoid module-level mutable state, and run the suite in random order locally until failures reproduce.",
  },
];

const SUGGESTIONS: Record<Cause, string> = {
  timing: CAUSE_RULES[0].suggestion,
  network: CAUSE_RULES[1].suggestion,
  "shared-data": CAUSE_RULES[2].suggestion,
  order: CAUSE_RULES[3].suggestion,
  unknown: "No dominant signal matched. Enable verbose failure output in CI and rerun with --runInBand / -p no:xdist to test ordering hypotheses.",
};

function classify(message: string): RootCause[] {
  const found: RootCause[] = [];
  for (const rule of CAUSE_RULES) {
    const hits = [...new Set((message.match(new RegExp(rule.keywords.source, "gi")) ?? []))];
    if (hits.length) {
      found.push({ cause: rule.cause, confidence: Math.min(95, 40 + hits.length * 20), evidence: hits.slice(0, 5), suggestion: rule.suggestion });
    }
  }
  return found.sort((a, b) => b.confidence - a.confidence);
}

function stats(runs: TestHistory["runs"]): { mean: number; cv: number } {
  const durs = runs.map(r => r.durationMs).filter(d => d > 0);
  if (durs.length < 2) return { mean: 0, cv: 0 };
  const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
  const variance = durs.reduce((a, b) => a + (b - mean) ** 2, 0) / durs.length;
  return { mean, cv: mean ? Math.sqrt(variance) / mean : 0 };
}

/** 0..100: 0 = always pass/fail, 100 = perfectly 50/50 with many samples. */
export function instabilityScore(pass: number, fail: number): number {
  const total = pass + fail;
  if (total === 0) return 0;
  const p = pass / total, f = fail / total;
  const balanced = 2 * p * f;             // 0..0.5
  const confidence = Math.min(1, total / 10); // need ~10 samples for full confidence
  return Math.round(balanced * 2 * 100 * confidence);
}

export function detectFlaky(history: TestHistory, minRuns: number, threshold: number, now: number, windowDays: number): FlakyTest | null {
  const cutoff = now - windowDays * 24 * 3600 * 1000;
  const windowRuns = history.runs.filter(r => r.timestamp >= cutoff);
  if (windowRuns.length < minRuns) return null;
  const fails = windowRuns.filter(r => r.outcome === "failed").length;
  const passes = windowRuns.filter(r => r.outcome === "passed").length;
  if (fails === 0 || passes === 0) return null; // stable, one way or the other
  const score = instabilityScore(passes, fails);
  if (score < threshold) return null;

  const failureMessages = windowRuns.filter(r => r.message).map(r => r.message as string);
  const combined = failureMessages.join("\n");
  let causes = classify(combined);

  // duration variance is an independent timing signal
  const { cv } = stats(windowRuns);
  if (cv > 0.8) {
    const timing = causes.find(c => c.cause === "timing");
    if (timing) { timing.confidence = Math.min(95, timing.confidence + 15); timing.evidence.push(`duration CV ${cv.toFixed(2)}`); }
    else causes.push({ cause: "timing", confidence: 55, evidence: [`duration CV ${cv.toFixed(2)}`], suggestion: SUGGESTIONS.timing });
  }
  if (!causes.length) causes = [{ cause: "unknown", confidence: 20, evidence: ["no keyword signal"], suggestion: SUGGESTIONS.unknown }];
  causes.sort((a, b) => b.confidence - a.confidence);

  return {
    id: history.id, classname: history.classname, name: history.name, file: history.file,
    runs: windowRuns.length, fails, passRate: Math.round((passes / (passes + fails)) * 100),
    score, causes, recentFailure: failureMessages[0],
  };
}

export function sortBySeverity(tests: FlakyTest[]): FlakyTest[] {
  return [...tests].sort((a, b) => b.score - a.score || b.fails - a.fails);
}
