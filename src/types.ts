export type Outcome = "passed" | "failed" | "skipped";
export type Cause = "timing" | "order" | "network" | "shared-data" | "unknown";

export interface RunRecord {
  outcome: Outcome;
  durationMs: number;
  timestamp: number;   // epoch ms of the CI run / import
  message?: string;    // failure message, if failed
  file?: string;       // source file, when known
}

export interface TestHistory {
  id: string;          // classname::name
  classname: string;
  name: string;
  file?: string;
  runs: RunRecord[];
}

export interface RootCause {
  cause: Cause;
  confidence: number;  // 0..100 how strongly evidence points here
  evidence: string[];  // matched signals
  suggestion: string;
}

export interface FlakyTest {
  id: string;
  classname: string;
  name: string;
  file?: string;
  runs: number;
  fails: number;
  passRate: number;
  score: number;        // 0..100 instability
  causes: RootCause[];  // sorted by confidence
  recentFailure?: string;
}

export interface ScanSummary {
  files: number;
  suites: number;
  cases: number;
  recordsAdded: number;
  skippedFiles: string[];
}
