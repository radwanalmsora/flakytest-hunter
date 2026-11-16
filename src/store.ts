import * as vscode from "vscode";
import { TestHistory, RunRecord } from "./types";

const KEY = "flakytest-hunter.history.v1";

export class HistoryStore {
  private memento: vscode.Memento;
  private limit: number;

  constructor(memento: vscode.Memento, limit: number) {
    this.memento = memento;
    this.limit = limit;
  }

  async all(): Promise<TestHistory[]> {
    return (await this.memento.get<TestHistory[]>(KEY)) ?? [];
  }

  async clear(): Promise<void> {
    await this.memento.update(KEY, []);
  }

  /** Merge new run records into per-test history, trimming to the configured rolling window. */
  async addRecords(records: Map<string, { history: TestHistory; run: RunRecord }>): Promise<number> {
    const existing = new Map((await this.all()).map(h => [h.id, h]));
    let added = 0;
    for (const [id, entry] of records) {
      const h = existing.get(id) ?? { id, classname: entry.history.classname, name: entry.history.name, file: entry.history.file, runs: [] };
      h.file = h.file ?? entry.history.file;
      // dedupe: same timestamp + outcome from re-importing the same report
      const dup = h.runs.some(r => r.timestamp === entry.run.timestamp && r.outcome === entry.run.outcome);
      if (!dup) {
        h.runs.push(entry.run);
        added++;
      }
      h.runs.sort((a, b) => a.timestamp - b.timestamp);
      if (h.runs.length > this.limit) h.runs = h.runs.slice(-this.limit);
      existing.set(id, h);
    }
    await this.memento.update(KEY, [...existing.values()]);
    return added;
  }
}
