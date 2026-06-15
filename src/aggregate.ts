import {
  priceFor,
  CACHE_READ_MULT,
  CACHE_WRITE_5M_MULT,
  CACHE_WRITE_1H_MULT,
} from "./pricing.js";
import type { UsageRecord } from "./parse.js";

export interface Totals {
  cost: number;
  input: number;
  cacheRead: number;
  cacheCreate: number; // 5m + 1h combined
  output: number;
  messages: number;
  webSearch: number;
  webFetch: number;
}

export function recordCost(r: UsageRecord): number {
  const p = priceFor(r.model);
  return (
    (r.input / 1e6) * p.input +
    (r.cacheRead / 1e6) * p.input * CACHE_READ_MULT +
    (r.cacheCreate5m / 1e6) * p.input * CACHE_WRITE_5M_MULT +
    (r.cacheCreate1h / 1e6) * p.input * CACHE_WRITE_1H_MULT +
    (r.output / 1e6) * p.output
  );
}

export function emptyTotals(): Totals {
  return {
    cost: 0,
    input: 0,
    cacheRead: 0,
    cacheCreate: 0,
    output: 0,
    messages: 0,
    webSearch: 0,
    webFetch: 0,
  };
}

export function add(t: Totals, r: UsageRecord): void {
  t.cost += recordCost(r);
  t.input += r.input;
  t.cacheRead += r.cacheRead;
  t.cacheCreate += r.cacheCreate5m + r.cacheCreate1h;
  t.output += r.output;
  t.messages += 1;
  t.webSearch += r.webSearch;
  t.webFetch += r.webFetch;
}

// Of all prompt tokens, the share that was served from cache (cheap).
export function cacheHitRate(t: Totals): number {
  const prompt = t.input + t.cacheRead + t.cacheCreate;
  return prompt === 0 ? 0 : t.cacheRead / prompt;
}

export function groupBy(
  records: UsageRecord[],
  key: (r: UsageRecord) => string,
): Map<string, Totals> {
  const m = new Map<string, Totals>();
  for (const r of records) {
    const k = key(r) || "unknown";
    let t = m.get(k);
    if (!t) {
      t = emptyTotals();
      m.set(k, t);
    }
    add(t, r);
  }
  return m;
}
