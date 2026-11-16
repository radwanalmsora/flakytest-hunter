import { Outcome, RunRecord } from "./types";

export interface ParsedCase {
  classname: string;
  name: string;
  time: number;         // seconds as reported
  outcome: Outcome;
  message?: string;
  file?: string;
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
  // attributes are always preceded by whitespace; the boundary also stops
  // "name" from matching inside "classname"
  const re = new RegExp("(?:^|\\s)" + name + '="([^"]*)"', "i");
  const m = tag.match(re);
  return m ? decodeXml(m[1]) : undefined;
}

/** Parse a JUnit XML report (testsuite/testcase schema used by GitHub Actions, pytest, surefire, jest-junit). */
export function parseJUnitXml(xml: string): ParsedCase[] {
  const cases: ParsedCase[] = [];
  // split on testcase open tags (JUnit never nests testcases)
  const parts = xml.split(/<testcase\b/i).slice(1);
  for (const part of parts) {
    const openEnd = part.indexOf(">");
    if (openEnd < 0) continue;
    const openTag = part.slice(0, openEnd + 1);
    // body until </testcase> or self-closing
    const closeIdx = part.indexOf("</testcase>");
    const body = openTag.endsWith("/>") ? "" : part.slice(openEnd + 1, closeIdx >= 0 ? closeIdx : undefined);

    const name = attr(openTag, "name") ?? "unnamed";
    const classname = attr(openTag, "classname") ?? "default";
    const time = parseFloat(attr(openTag, "time") ?? "0") || 0;
    const file = attr(openTag, "file");

    let outcome: Outcome = "passed";
    let message: string | undefined;
    if (/<failure\b/i.test(body)) {
      outcome = "failed";
      const m = body.match(/<failure\b[^>]*message="([^"]*)"/i) || body.match(/<failure\b[^>]*>([\s\S]*?)<\/failure>/i);
      if (m) message = decodeXml(m[1].replace(/<[^>]+>/g, " ").trim()).slice(0, 600);
    } else if (/<skipped\b/i.test(body) || /<error\b[^>]*\/>/.test(body) && false) {
      outcome = "skipped";
    } else if (/<error\b/i.test(body)) {
      outcome = "failed";
      const m = body.match(/<error\b[^>]*message="([^"]*)"/i);
      if (m) message = decodeXml(m[1]).slice(0, 600);
    }
    cases.push({ classname, name, time, outcome, message, file });
  }
  return cases;
}

/** Parse a minimal JSON report: either jest/vitest-style {testResults:[{assertionResults:[{fullName,status}]}]} or a flat array of {classname,name,status,time}. */
export function parseJsonReport(text: string): ParsedCase[] {
  const data = JSON.parse(text);
  const cases: ParsedCase[] = [];
  const push = (classname: string, name: string, status: string, time = 0, message?: string, file?: string) => {
    const outcome: Outcome = status === "passed" || status === "pass" ? "passed" : status === "skipped" || status === "pending" ? "skipped" : "failed";
    cases.push({ classname, name, time, outcome, message, file });
  };
  if (Array.isArray(data)) {
    for (const c of data) push(c.classname ?? "default", c.name ?? c.fullName ?? "unnamed", c.status ?? c.outcome ?? "failed", c.time ?? 0, c.message, c.file);
    return cases;
  }
  if (data.testResults) { // jest / vitest
    for (const tr of data.testResults) {
      for (const ar of tr.assertionResults ?? []) {
        push(tr.name ?? "default", ar.fullName ?? ar.title ?? "unnamed", ar.status, 0, ar.failureMessages?.join(" "), tr.name);
      }
    }
    return cases;
  }
  return cases;
}

export function toRunRecord(c: ParsedCase, timestamp: number): RunRecord {
  return { outcome: c.outcome, durationMs: Math.round(c.time * 1000), timestamp, message: c.message, file: c.file };
}

export function looksLikeReport(fileName: string): boolean {
  return /\.(xml)$/i.test(fileName) || /\.(json)$/i.test(fileName);
}
