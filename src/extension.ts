import * as vscode from "vscode";
import * as path from "path";
import { HistoryStore } from "./store";
import { parseJUnitXml, parseJsonReport, toRunRecord, looksLikeReport, ParsedCase } from "./parser";
import { detectFlaky } from "./flakiness";
import { showDashboard, toMarkdown } from "./report";
import { FlakyTreeProvider, StatsProvider } from "./providers";
import { TestHistory, RunRecord, FlakyTest } from "./types";

let store: HistoryStore;
let flakyProvider: FlakyTreeProvider;
let statsProvider: StatsProvider;

function cfg(): vscode.WorkspaceConfiguration { return vscode.workspace.getConfiguration("flakyTestHunter"); }

function testId(c: ParsedCase): string { return `${c.classname}::${c.name}`; }

async function ingestText(text: string, fileName: string, timestamp: number): Promise<{ records: Map<string, { history: TestHistory; run: RunRecord }>; cases: number }> {
  let parsed: ParsedCase[];
  try {
    parsed = fileName.toLowerCase().endsWith(".json") ? parseJsonReport(text) : parseJUnitXml(text);
  } catch {
    return { records: new Map(), cases: 0 };
  }
  const records = new Map<string, { history: TestHistory; run: RunRecord }>();
  for (const c of parsed) {
    const id = testId(c);
    records.set(`${id}@${timestamp}`, { history: { id, classname: c.classname, name: c.name, file: c.file, runs: [] }, run: toRunRecord(c, timestamp) });
  }
  return { records, cases: parsed.length };
}

async function collectFiles(): Promise<{ files: vscode.Uri[]; skipped: string[] }> {
  const glob = cfg().get<string>("reportGlob", "**/*.{xml,json}");
  const uris = await vscode.workspace.findFiles(glob, "**/node_modules/**");
  const ok = uris.filter(u => looksLikeReport(path.basename(u.fsPath)));
  return { files: ok, skipped: uris.filter(u => !ok.includes(u)).map(u => path.basename(u.fsPath)) };
}

async function analyzeAll(): Promise<{ tests: FlakyTest[]; totalRuns: number }> {
  const minRuns = cfg().get<number>("minRuns", 3);
  const threshold = cfg().get<number>("flakyThreshold", 25);
  const now = Date.now();
  const histories = await store.all();
  const tests: FlakyTest[] = [];
  let totalRuns = 0;
  for (const h of histories) {
    totalRuns += h.runs.length;
    const t = detectFlaky(h, minRuns, threshold, now, cfg().get<number>("windowDays", 30));
    if (t) tests.push(t);
  }
  return { tests, totalRuns };
}

async function refreshUI(): Promise<void> {
  const { tests, totalRuns } = await analyzeAll();
  flakyProvider.refresh(tests);
  statsProvider.refresh([
    `${tests.length} flaky test(s)`,
    `${totalRuns} total run records`,
    ...tests.slice(0, 5).map(t => `${t.score}/100 · ${t.name} → ${t.causes[0].cause}`),
  ]);
  if (tests.length) {
    vscode.window.showWarningMessage(`FlakyTest Hunter: ${tests.length} flaky test(s) detected — worst: "${tests[0].name}" (${tests[0].score}/100, ${tests[0].causes[0].cause}).`);
  }
}

async function scanFiles(uris: vscode.Uri[], sourceLabel: string): Promise<void> {
  if (!uris.length) { vscode.window.showInformationMessage("FlakyTest Hunter: no report files found."); return; }
  let totalCases = 0;
  // one timestamp per file keeps re-imports idempotent-ish; CI imports use the file's mtime when newer
  for (const uri of uris) {
    let text: string;
    try { text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"); }
    catch { continue; }
    let mtime = Date.now();
    try { mtime = (await vscode.workspace.fs.stat(uri)).mtime; } catch { /* keep now */ }
    const { records, cases } = await ingestText(text, uri.fsPath, mtime);
    if (cases > 0) { totalCases += cases; }
    totalRecords += await store.addRecords(records);
  }
  vscode.window.showInformationMessage(`FlakyTest Hunter: imported ${totalCases} test case(s) from ${uris.length} report file(s) (${sourceLabel}).`);
  await refreshUI();
}

export function activate(context: vscode.ExtensionContext): void {
  store = new HistoryStore(context.workspaceState, cfg().get<number>("historyLimit", 500));
  flakyProvider = new FlakyTreeProvider();
  statsProvider = new StatsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("fth.flaky", flakyProvider),
    vscode.window.registerTreeDataProvider("fth.stats", statsProvider),

    vscode.commands.registerCommand("flakytest.scanWorkspace", async () => {
      const { files } = await collectFiles();
      await scanFiles(files, "workspace scan");
    }),

    vscode.commands.registerCommand("flakytest.importArtifacts", async () => {
      const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Select CI artifacts folder (JUnit XML/JSON reports)" });
      if (!picked?.length) return;
      const folder = picked[0];
      const pattern = new vscode.RelativePattern(folder, "**/*.{xml,json}");
      const uris = (await vscode.workspace.findFiles(pattern)).filter(u => looksLikeReport(path.basename(u.fsPath)));
      await scanFiles(uris, folder.fsPath);
    }),

    vscode.commands.registerCommand("flakytest.showDashboard", async () => {
      const { tests, totalRuns } = await analyzeAll();
      showDashboard(tests, totalRuns);
    }),

    vscode.commands.registerCommand("flakytest.exportReport", async () => {
      const { tests } = await analyzeAll();
      if (!tests.length) { vscode.window.showInformationMessage("Nothing to export yet."); return; }
      const doc = await vscode.workspace.openTextDocument({ content: toMarkdown(tests), language: "markdown" });
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand("flakytest.clearHistory", async () => {
      const confirm = await vscode.window.showWarningMessage("Delete all collected test history?", { modal: true }, "Delete");
      if (confirm === "Delete") { await store.clear(); flakyProvider.refresh([]); statsProvider.refresh(["History cleared."]); }
    }),

    vscode.commands.registerCommand("fth.revealTest", async (t: FlakyTest) => {
      if (!t.file) { vscode.window.showInformationMessage(`No source file recorded for ${t.id}.`); return; }
      try {
        const doc = await vscode.workspace.openTextDocument(t.file);
        const editor = await vscode.window.showTextDocument(doc);
        const idx = doc.getText().indexOf(t.name);
        if (idx >= 0) {
          const pos = doc.positionAt(idx);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }
      } catch { vscode.window.showInformationMessage(`Could not open ${t.file}.`); }
    })
  );
}

export function deactivate(): void {}
