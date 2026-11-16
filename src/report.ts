import * as vscode from "vscode";
import { FlakyTest } from "./types";
import { sortBySeverity } from "./flakiness";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CAUSE_COLORS: Record<string, string> = { timing: "#eab308", network: "#60a5fa", "shared-data": "#f97316", order: "#c084fc", unknown: "#9ca3af" };

export function showDashboard(tests: FlakyTest[], totalRuns: number): void {
  if (!tests.length) {
    vscode.window.showInformationMessage("FlakyTest Hunter: no flaky tests detected yet. Scan reports or import CI artifacts first.");
    return;
  }
  const panel = vscode.window.createWebviewPanel("fth.dashboard", "FlakyTest Hunter — Dashboard", vscode.ViewColumn.Beside, {});
  const sorted = sortBySeverity(tests);
  const worst = sorted[0];
  const avgScore = Math.round(tests.reduce((a, t) => a + t.score, 0) / tests.length);

  const bars = sorted.map(t => {
    const w = Math.min(100, t.score);
    const col = t.score >= 60 ? "#ef4444" : t.score >= 40 ? "#f97316" : "#eab308";
    return `<div class="bar-row"><div class="bar-label" title="${esc(t.id)}">${esc(t.classname)} › ${esc(t.name)}</div>
      <div class="bar-track"><div class="bar" style="width:${w}%;background:${col}"></div></div>
      <div class="bar-num">${t.score}</div></div>`;
  }).join("");

  const cards = sorted.slice(0, 50).map(t => `<div class="card">
      <h3>${esc(t.name)} <span class="badge">${t.score}/100</span></h3>
      <div class="meta">${t.runs} runs · ${t.fails} fails · ${t.passRate}% pass rate</div>
      ${t.recentFailure ? `<div class="msg">${esc(t.recentFailure)}</div>` : ""}
      <div class="causes">${t.causes.map(c => `<span class="pill" style="border-color:${CAUSE_COLORS[c.cause]}">${c.cause} ${c.confidence}%</span>`).join("")}</div>
      <div class="sug">💡 ${esc(t.causes[0].suggestion)}</div>
    </div>`).join("");

  panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground);padding:24px}
    h1{font-size:20px}.kpis{display:flex;gap:24px;margin:16px 0}
    .kpi{border:1px solid #444;border-radius:8px;padding:12px 20px}.kpi b{font-size:26px;display:block}
    .bar-row{display:flex;align-items:center;gap:10px;margin:4px 0;font-size:12px}
    .bar-label{width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bar-track{flex:1;height:14px;background:#333;border-radius:7px;overflow:hidden}.bar{height:100%}
    .bar-num{width:36px;text-align:right}.card{border:1px solid #444;border-radius:8px;padding:14px;margin:12px 0}
    .card h3{margin:0 0 6px;font-size:14px}.badge{background:#ef4444;border-radius:10px;padding:2px 10px;font-size:12px}
    .meta{opacity:.7;font-size:12px;margin-bottom:8px}.msg{font-family:monospace;font-size:11px;background:#00000040;padding:8px;border-radius:6px;margin-bottom:8px;white-space:pre-wrap}
    .pill{display:inline-block;border:1px solid;border-radius:10px;padding:1px 8px;font-size:11px;margin-right:6px}
    .sug{font-size:12px;color:#eab308}
  </style></head><body>
    <h1>🎯 FlakyTest Hunter — Report</h1>
    <div class="kpis">
      <div class="kpi"><b>${tests.length}</b>flaky tests</div>
      <div class="kpi"><b>${avgScore}</b>avg instability</div>
      <div class="kpi"><b style="color:#ef4444">${worst.score}</b>worst: ${esc(worst.name)}</div>
      <div class="kpi"><b>${totalRuns}</b>runs tracked</div>
    </div>
    <h2>Instability leaderboard</h2>${bars}
    <h2>Root causes & fixes</h2>${cards}
  </body></html>`;
}

export function toMarkdown(tests: FlakyTest[]): string {
  const lines = ["# FlakyTest Hunter Report", "", `| Test | Runs | Fails | Pass rate | Score | Top cause |`,
    "|---|---|---|---|---|---|"];
  for (const t of sortBySeverity(tests)) {
    lines.push(`| ${t.classname} › ${t.name} | ${t.runs} | ${t.fails} | ${t.passRate}% | ${t.score} | ${t.causes[0].cause} (${t.causes[0].confidence}%) |`);
  }
  lines.push("", "## Suggested fixes", "");
  for (const t of sortBySeverity(tests)) {
    lines.push(`### ${t.name} — ${t.causes[0].cause}`);
    lines.push(`- Evidence: ${t.causes[0].evidence.join(", ")}`);
    lines.push(`- Fix: ${t.causes[0].suggestion}`);
    if (t.recentFailure) lines.push("- Latest failure:", "  ```", `  ${t.recentFailure}`, "  ```");
    lines.push("");
  }
  return lines.join("\n");
}
