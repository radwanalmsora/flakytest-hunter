import * as vscode from "vscode";
import { FlakyTest } from "./types";
import { sortBySeverity } from "./flakiness";

export class FlakyTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private tests: FlakyTest[] = [];

  refresh(tests: FlakyTest[]): void { this.tests = tests; this.emitter.fire(undefined); }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      return sortBySeverity(this.tests).map(t => this.getTreeItem(t));
    }
    
    // إذا كان العنصر هو FlakyTest (أو TreeItem رئيسي)، نعيد الأسباب الفرعية كـ TreeItem
    if (element instanceof FlakyTestItem) {
      return element.causes.map(c => {
        const it = new vscode.TreeItem(`${c.cause} — ${c.confidence}%`, vscode.TreeItemCollapsibleState.None);
        it.description = c.evidence.join(", ").slice(0, 80);
        it.tooltip = c.suggestion;
        return it;
      });
    }
    
    return [];
  }

  getTreeItem(t: FlakyTest): vscode.TreeItem {
    return new FlakyTestItem(t);
  }
}

// كلاس مساعد يمثل عنصر الاختبار في الشجرة ليتوافق تماماً مع TreeItem
class FlakyTestItem extends vscode.TreeItem {
  constructor(public readonly flakyTest: FlakyTest) {
    super(
      `${flakyTest.score >= 60 ? "$(flame)" : flakyTest.score >= 40 ? "$(warning)" : "$(debug-step-over)"} ${flakyTest.name}`,
      vscode.TreeItemCollapsibleState.Collapsed
    );
    this.description = `${flakyTest.score}/100 · ${flakyTest.causes[0].cause}`;
    this.tooltip = `${flakyTest.classname} :: ${flakyTest.name}\n${flakyTest.runs} runs, ${flakyTest.fails} fails, ${flakyTest.passRate}% pass\nTop cause: ${flakyTest.causes[0].cause} (${flakyTest.causes[0].confidence}%)\n\n${flakyTest.causes[0].suggestion}`;
    this.contextValue = "flakyTest";
  }

  get causes() {
    return this.flakyTest.causes;
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
