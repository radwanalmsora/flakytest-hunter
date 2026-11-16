# 🎯 FlakyTest Hunter

**Hunt down flaky tests before they hunt your CI.** Test runners execute tests — nobody analyzes which tests are unstable, why, and how to fix them. FlakyTest Hunter closes that gap.

![banner](media/banner.png)

## What it actually does

| Feature | Description |
|---|---|
| **CI history ingestion** | Parses JUnit XML reports (GitHub Actions, GitLab, Jenkins, pytest, surefire, jest-junit) and jest/vitest JSON results. Scan the workspace or import a folder of CI artifacts. |
| **Flakiness detection** | Rolling per-test history with dedupe; a test is flagged when it both passes and fails enough — scored 0–100 via balanced pass/fail ratio weighted by sample count. |
| **Root-cause classification** | Analyzes failure messages and duration variance to attribute flakiness: **timing** (timeouts, races, CV > 0.8), **network** (ECONNREFUSED, 5xx), **shared data** (duplicate key, locks), **order** (state leaks) — each with confidence and evidence. |
| **Fix suggestions** | Concrete remediation per cause: fake timers, HTTP mocking (MSW/nock), per-worker isolation, random-order runs. |
| **Dashboard & export** | Webview leaderboard + cause cards; one-click Markdown report for tickets/PRs. |

## Commands

| Command | Description |
|---|---|
| `FlakyTest Hunter: Scan Workspace for Test Reports` | Find and ingest reports by glob |
| `FlakyTest Hunter: Import CI Artifacts (Folder of JUnit XML)` | Import a downloaded CI artifacts folder |
| `FlakyTest Hunter: Open Flakiness Dashboard` | Leaderboard + causes view |
| `FlakyTest Hunter: Export Flakiness Report (Markdown)` | Markdown report in a new editor |
| `FlakyTest Hunter: Clear Collected History` | Reset stored history |

## Configuration

- `flakyTestHunter.reportGlob` — report file pattern (default `**/{junit,TEST-*,*junit*,*results*}.{xml,json}`)
- `flakyTestHunter.minRuns` (default 3) — runs needed before flagging
- `flakyTestHunter.flakyThreshold` (default 25) — score at/above which a test is flagged
- `flakyTestHunter.historyLimit` (default 500) — records kept per test
- `flakyTestHunter.windowDays` (default 30) — analysis window

## Try it instantly

The repo includes `samples/junit-run-1..4.xml` — four simulated CI runs containing two genuinely flaky tests. Open the folder in VS Code, run **Scan Workspace for Test Reports**, and open the dashboard.

## Build the VSIX

```bash
npm install       # no lockfile committed; npm ci would fail
npm run compile
npm run package   # produces flakytest-hunter.vsix
```

## Publishing via GitHub Actions

Every push builds and uploads the VSIX as an artifact. Push a `v*` tag to auto-create a GitHub Release and publish to the Visual Studio Marketplace (requires a `VSCE_PAT` secret).

## License
MIT
