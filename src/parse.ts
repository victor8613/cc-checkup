import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// One assistant message with token accounting, flattened from a transcript line.
export interface UsageRecord {
  project: string; // top-level dir name under projects/ (encodes the cwd)
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  model?: string;
  timestamp?: string;
  isSidechain: boolean; // true => produced by a subagent
  input: number; // fresh (uncached) input tokens — most expensive
  cacheRead: number; // served from prompt cache — 1/10 price
  cacheCreate5m: number; // written to 5-minute cache — 1.25x
  cacheCreate1h: number; // written to 1-hour cache — 2x
  output: number;
  webSearch: number;
  webFetch: number;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

export function findTranscripts(projectsDir: string): string[] {
  return walk(projectsDir);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function parseFile(file: string, projectsDir: string): UsageRecord[] {
  const records: UsageRecord[] = [];
  const rel = file.slice(projectsDir.length).replace(/^[\\/]+/, "");
  const project = rel.split(/[\\/]/)[0] ?? "unknown";

  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return records;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue; // defensive: tolerate partial / non-JSON lines
    }
    const usage = obj?.message?.usage;
    if (!usage) continue; // only assistant messages carry usage

    const cc = usage.cache_creation ?? {};
    // Prefer the 5m/1h breakdown; fall back to the flat field as 5m so we
    // never double-count (the flat field is the sum of the two).
    const create5m = num(cc.ephemeral_5m_input_tokens, num(usage.cache_creation_input_tokens));
    const create1h = num(cc.ephemeral_1h_input_tokens);

    records.push({
      project,
      cwd: obj.cwd,
      gitBranch: obj.gitBranch,
      sessionId: obj.sessionId,
      model: obj.message?.model,
      timestamp: obj.timestamp,
      isSidechain: !!obj.isSidechain,
      input: num(usage.input_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      cacheCreate5m: create5m,
      cacheCreate1h: create1h,
      output: num(usage.output_tokens),
      webSearch: num(usage.server_tool_use?.web_search_requests),
      webFetch: num(usage.server_tool_use?.web_fetch_requests),
    });
  }
  return records;
}
