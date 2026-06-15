import { cacheHitRate } from "./aggregate.js";
import type { Totals } from "./aggregate.js";
import { priceFor, CACHE_READ_MULT } from "./pricing.js";

export interface Finding {
  kind: "win" | "praise";
  title: string;
  detail: string;
  estSaving: number; // USD — potential (win) or already realized (praise)
}

const TARGET_HIT = 0.85;
const OPUS_SHIFT = 0.3;

// Counterfactual cost of the SAME tokens at a different price.
// Uses a blended 1.25x for cache writes (Totals lacks the 5m/1h split); this is
// an estimate for what-if levers, not the exact bill (which uses recordCost).
function costOf(t: Totals, p: { input: number; output: number }): number {
  return (
    (t.input / 1e6) * p.input +
    (t.cacheRead / 1e6) * p.input * CACHE_READ_MULT +
    (t.cacheCreate / 1e6) * p.input * 1.25 +
    (t.output / 1e6) * p.output
  );
}

function pct0(n: number): string {
  return Math.round(n * 100) + "%";
}

export function recommend(total: Totals, byModel: Map<string, Totals>): Finding[] {
  const out: Finding[] = [];
  const rate = cacheHitRate(total);

  // R1 — cache headroom, priced per model so the estimate uses correct rates.
  let cacheSaving = 0;
  for (const [model, t] of byModel) {
    const prompt = t.input + t.cacheRead + t.cacheCreate;
    if (prompt === 0) continue;
    const hit = t.cacheRead / prompt;
    if (hit >= TARGET_HIT) continue;
    const reducible = (TARGET_HIT - hit) * prompt;
    cacheSaving +=
      (reducible / 1e6) * priceFor(model).input * (1 - CACHE_READ_MULT);
  }
  if (cacheSaving >= 0.5) {
    out.push({
      kind: "win",
      title: `缓存命中率 ${pct0(rate)} 偏低`,
      detail: `稳定内容放到 prompt 前缀、减少上下文抖动;命中率提到 ${pct0(TARGET_HIT)} 的估算空间。`,
      estSaving: cacheSaving,
    });
  } else {
    out.push({
      kind: "praise",
      title: `缓存命中率 ${pct0(rate)} 已很好`,
      detail: `缓存几乎吃满,这块没什么可省的。`,
      estSaving: 0,
    });
  }

  // R2 — Opus right-sizing what-if (move a slice of Opus work to Sonnet).
  let opusExact = 0;
  let opusDiff = 0;
  const sonnet = priceFor("sonnet");
  for (const [model, t] of byModel) {
    if (!/opus/i.test(model)) continue;
    opusExact += t.cost;
    opusDiff += costOf(t, priceFor(model)) - costOf(t, sonnet);
  }
  const opusShare = total.cost > 0 ? opusExact / total.cost : 0;
  const opusSaving = Math.max(0, opusDiff) * OPUS_SHIFT;
  if (opusShare > 0.4 && opusSaving >= 0.5) {
    out.push({
      kind: "win",
      title: `Opus 占了 ${pct0(opusShare)} 花费`,
      detail: `把约 ${pct0(OPUS_SHIFT)} 适合的任务降到 Sonnet(需自行判断质量是否够用)。`,
      estSaving: opusSaving,
    });
  }

  // R3 — already saved by cheaper models (praise + a shareable number).
  const opus = priceFor("opus");
  let saved = 0;
  for (const [model, t] of byModel) {
    if (/opus/i.test(model) || model === "<synthetic>") continue;
    saved += Math.max(0, costOf(t, opus) - costOf(t, priceFor(model)));
  }
  if (saved >= 1) {
    out.push({
      kind: "praise",
      title: `模型分层已省`,
      detail: `非 Opus 模型承担的那部分,相比"全用 Opus"已经省下的钱。`,
      estSaving: saved,
    });
  }

  // wins first (by saving desc), then praise (by saving desc).
  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "win" ? -1 : 1;
    return b.estSaving - a.estSaving;
  });
}
