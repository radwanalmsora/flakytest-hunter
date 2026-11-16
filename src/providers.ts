import * as vscode from "vscode";
import { FlakyTest } from "./types";
import { sortBySeverity } from "./flakiness";

export class FlakyTreeProvider implements vscode.TreeDataProvider<FlakyTest> {
  private emitter = new vscode.EventEmitter<FlakyTest | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private tests: FlakyTest[] = [];

  refresh(tests: FlakyTest[]): void { this.tests = tests; this.emitter.fire(undefined); }

  getChildren(element?: FlakyTest): vscode.ProviderResult<FlakyTest[] | vscode.TreeItem[]> {
    if (!element) return sortBySeverity(this.tests);
    return element.causes.map(c => {
      const it = new vscode.TreeItem(`${c.cause} — ${c.confidence}%`, vscode.TreeItemCollapsibleState.None);
      it.description = c.evidence.join(", ").slice(0, 80);
      it.tooltip = c.suggestion;
      return it;
    });
  }

  getTreeItem(t: FlakyTest): vscode.TreeItem {
    const icon = t.score >= 60 ? "$(flame)" : t.score >= 40 ? "$(warning)" : "$(debug-step-over)";
    const item = new vscode.TreeItem(`${icon} ${t.name}`, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = `${t.score}/100 · ${t.causes[0].cause}`;
    item.tooltip = `${t.classname} :: ${t.name}\n${t.runs} runs, ${t.fails} fails, ${t.passRate}% pass\nTop cause: ${t.causes[0].cause} (${t.causes[0].confidence}%)\n\n${t.causes[0].suggestion}`;
    item.contextValue = "flakyTest";
    return item;
  }
}

export class StatsProvider implements vscode.TreeDataProvider<string> {
  private emitter = new vscode.EventEmitter<string | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private lines: string[] = ["Import or scan test reports to begin."];

  refresh(lines: string[]): void { this.lines = lines; this.emitter.fire(undefined); }
  getChildren(): string[] { return this.lines; }
  getTreeItem(s: string): vscode.TreeItem { return new vscode.TreeItem(s, vscode.TreeItemCollapsibleState.None); }
}
