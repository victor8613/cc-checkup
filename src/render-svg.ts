import { cacheHitRate } from "./aggregate.js";
import type { Totals } from "./aggregate.js";
import type { Finding } from "./recommend.js";
import { fmtMoney } from "./money.js";
import type { Currency } from "./money.js";
import type { Theme } from "./themes.js";
import type { Billing } from "./billing.js";

export interface ModelSlice {
  name: string;
  cost: number;
}

export interface SvgView {
  total: Totals;
  sessions: number;
  from?: string;
  to?: string;
  findings: Finding[];
  models: ModelSlice[];
  cur: Currency;
  theme: Theme;
  billing: Billing;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function clip(s: string, n: number): string {
  const a = [...s];
  return a.length <= n ? s : a.slice(0, n - 1).join("") + "…";
}

function pct0(n: number): string {
  return Math.round(n * 100) + "%";
}

interface TextOpts {
  size: number;
  fill: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
}
function text(x: number, y: number, s: string, o: TextOpts): string {
  const a = o.anchor ? ` text-anchor="${o.anchor}"` : "";
  const w = o.weight ? ` font-weight="${o.weight}"` : "";
  return `<text x="${x}" y="${y}" font-size="${o.size}"${w} fill="${o.fill}"${a}>${esc(s)}</text>`;
}

const FONTS =
  "'Segoe UI','Microsoft YaHei','PingFang SC','Hiragino Sans GB','Noto Sans CJK SC',sans-serif";

function shortModel(name: string): string {
  return name.replace(/^claude-/, "").replace(/^anthropic\./, "");
}
function modelColor(name: string, th: Theme, idx: number): string {
  if (/opus/i.test(name)) return th.accent;
  if (/sonnet/i.test(name)) return th.info;
  if (/haiku/i.test(name)) return th.good;
  if (/deepseek/i.test(name)) return th.warn;
  const extra = ["#8b949e", "#bc8cff", "#ff9e64", "#56d4dd"];
  return extra[idx % extra.length];
}

export function buildSvg(v: SvgView): string {
  const th = v.theme;
  const Wd = 920;
  const PAD = 48;
  const findings = v.findings.slice(0, 3);
  const findStartY = 432;
  const findH = 66;
  const H = findStartY + findings.length * findH + 78;

  const rate = cacheHitRate(v.total);
  const gradeColor = rate >= 0.7 ? th.good : rate >= 0.4 ? th.warn : th.bad;
  const winSaving = findings
    .filter((f) => f.kind === "win")
    .reduce((s, f) => s + f.estSaving, 0);
  const m = (n: number) => fmtMoney(n, v.cur);
  const period = `${(v.from ?? "").slice(0, 10)} → ${(v.to ?? "").slice(5, 10)}`;

  const p: string[] = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}" font-family="${FONTS}">`,
  );
  p.push(
    `<defs><clipPath id="barclip"><rect x="${PAD}" y="302" width="${Wd - 2 * PAD}" height="18" rx="9"/></clipPath></defs>`,
  );
  p.push(`<rect x="0" y="0" width="${Wd}" height="${H}" rx="20" fill="${th.bg}"/>`);
  p.push(
    `<rect x="1" y="1" width="${Wd - 2}" height="${H - 2}" rx="19" fill="none" stroke="${th.border}"/>`,
  );

  // header
  p.push(text(PAD, 74, "Claude Code 账单体检", { size: 32, weight: 700, fill: th.text }));
  p.push(text(Wd - PAD, 74, "cc-checkup", { size: 18, fill: th.dim, anchor: "end" }));
  p.push(`<line x1="${PAD}" y1="100" x2="${Wd - PAD}" y2="100" stroke="${th.divider}"/>`);

  // total (left) — billing-aware
  const bill = v.billing;
  const bigLabel = bill.hasSub ? (bill.feeKnown ? "真实支出" : "API 等价用量") : "总花费";
  const bigVal = bill.hasSub ? (bill.feeKnown ? bill.realSpend : bill.subValue) : bill.apiSpend;
  p.push(text(PAD, 152, bigLabel, { size: 18, fill: th.dim }));
  p.push(text(PAD, 212, m(bigVal), { size: 60, weight: 800, fill: th.accent }));
  p.push(
    text(PAD, 246, `${v.sessions} 会话 · ${v.total.messages} 消息 · ${period}`, {
      size: 15,
      fill: th.dim,
    }),
  );
  if (bill.hasSub && bill.feeKnown) {
    p.push(text(PAD, 270, `订阅 ${m(bill.subFee)} + API实付 ${m(bill.apiSpend)}`, { size: 15, fill: th.dim }));
  } else if (bill.hasSub) {
    p.push(text(PAD, 270, `其中 API 实付 ${m(bill.apiSpend)} · 其余订阅覆盖`, { size: 15, fill: th.dim }));
  }

  // cache badge (right)
  const badgeW = 220;
  const bx = Wd - PAD - badgeW;
  p.push(`<rect x="${bx}" y="128" width="${badgeW}" height="92" rx="14" fill="${th.card}" stroke="${th.border}"/>`);
  p.push(text(bx + badgeW / 2, 162, "缓存命中率", { size: 15, fill: th.dim, anchor: "middle" }));
  p.push(text(bx + badgeW / 2, 202, pct0(rate), { size: 36, weight: 800, fill: gradeColor, anchor: "middle" }));

  // model mini-bar
  p.push(text(PAD, 288, "成本构成(按模型)", { size: 15, fill: th.dim }));
  const models = v.models.filter((md) => md.cost > 0);
  const barW = Wd - 2 * PAD;
  const sumCost = models.reduce((s, md) => s + md.cost, 0) || 1;
  p.push(`<g clip-path="url(#barclip)">`);
  let cx = PAD;
  models.forEach((md, i) => {
    const w = (md.cost / sumCost) * barW;
    p.push(`<rect x="${cx.toFixed(1)}" y="302" width="${Math.ceil(w + 0.5)}" height="18" fill="${modelColor(md.name, th, i)}"/>`);
    cx += w;
  });
  p.push(`</g>`);
  // legend (top 4, evenly spaced columns)
  const legendModels = models.slice(0, 4);
  const colW = barW / Math.max(1, legendModels.length);
  legendModels.forEach((md, i) => {
    const lx = PAD + i * colW;
    p.push(`<circle cx="${lx + 5}" cy="346" r="5" fill="${modelColor(md.name, th, i)}"/>`);
    p.push(
      text(lx + 18, 351, `${clip(shortModel(md.name), 16)}  ${pct0(md.cost / sumCost)}`, {
        size: 14,
        fill: th.dim,
      }),
    );
  });

  // headline — billing-aware
  if (bill.hasSub && bill.feeKnown) {
    p.push(text(PAD, 400, `▶ 订阅薅到价值  约 ${m(bill.subValue)} · 回本 ${bill.roi.toFixed(1)}x`, { size: 21, weight: 700, fill: th.good }));
  } else if (winSaving >= 0.5) {
    p.push(text(PAD, 400, `▶ 识别可优化空间   约 ${m(winSaving)}`, { size: 21, weight: 700, fill: th.good }));
  } else {
    p.push(text(PAD, 400, "▶ 已基本优化到位", { size: 21, weight: 700, fill: th.good }));
  }

  // findings
  findings.forEach((f, i) => {
    const y = findStartY + i * findH;
    const dot = f.kind === "win" ? th.warn : th.good;
    p.push(`<circle cx="${PAD + 7}" cy="${y - 6}" r="6" fill="${dot}"/>`);
    p.push(text(PAD + 28, y, f.title, { size: 19, weight: 600, fill: th.text }));
    const tag =
      f.kind === "win"
        ? `可省 ~${m(f.estSaving)}`
        : f.estSaving >= 1
          ? `已省 ~${m(f.estSaving)}`
          : "已达标";
    const tagColor = f.kind === "win" ? th.good : th.info;
    p.push(text(Wd - PAD, y, tag, { size: 18, weight: 700, fill: tagColor, anchor: "end" }));
    p.push(text(PAD + 28, y + 25, clip(f.detail, 46), { size: 14.5, fill: th.dim }));
  });

  // footer
  const fy = H - 30;
  p.push(`<line x1="${PAD}" y1="${H - 58}" x2="${Wd - PAD}" y2="${H - 58}" stroke="${th.divider}"/>`);
  p.push(text(PAD, fy, "本地运行 · 不上传任何数据", { size: 14, fill: th.dim }));
  p.push(text(Wd - PAD, fy, "github.com/<you>/cc-checkup", { size: 14, fill: th.dim, anchor: "end" }));

  p.push(`</svg>`);
  return p.join("\n");
}
