import { cacheHitRate } from "./aggregate.js";
import type { Totals } from "./aggregate.js";
import type { Finding } from "./recommend.js";
import { fmtMoney, USD } from "./money.js";
import type { Currency } from "./money.js";
import type { Billing } from "./billing.js";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

const useColor = process.stdout.isTTY;
function col(s: string, code: string): string {
  return useColor ? code + s + ANSI.reset : s;
}
const c = {
  bold: (s: string) => col(s, ANSI.bold),
  dim: (s: string) => col(s, ANSI.dim),
  cyan: (s: string) => col(s, ANSI.cyan),
  green: (s: string) => col(s, ANSI.green),
  yellow: (s: string) => col(s, ANSI.yellow),
  magenta: (s: string) => col(s, ANSI.magenta),
};
export function dim(s: string): string {
  return c.dim(s);
}

// ---- currency (set once per run) ----
let CUR: Currency = USD;
export function setCurrency(cur: Currency): void {
  CUR = cur;
}
function m(n: number): string {
  return fmtMoney(n, CUR);
}

// ---- display width (CJK / fullwidth chars take 2 terminal cells) ----
function dwidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xa000 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    w += wide ? 2 : 1;
  }
  return w;
}
function padR(s: string, w: number): string {
  const d = dwidth(s);
  return d >= w ? s : s + " ".repeat(w - d);
}
function alignR(s: string, w: number): string {
  const d = dwidth(s);
  return d >= w ? s : " ".repeat(w - d) + s;
}
function truncate(s: string, w: number): string {
  if (dwidth(s) <= w) return s;
  let out = "";
  let cur = 0;
  for (const ch of s) {
    const cw = dwidth(ch);
    if (cur + cw > w - 1) {
      out += "…";
      break;
    }
    out += ch;
    cur += cw;
  }
  return out;
}

// ---- formatters ----
export function tok(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}
export function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
function pct0(n: number): string {
  return Math.round(n * 100) + "%";
}
function hitColor(rate: number, s: string): string {
  if (rate >= 0.7) return col(s, ANSI.green);
  if (rate >= 0.4) return col(s, ANSI.yellow);
  return col(s, ANSI.red);
}
function rule(w: number): string {
  return "━".repeat(w);
}

const W = 60;

export interface Meta {
  files: number;
  sessions: number;
  from?: string;
  to?: string;
}

export function printReport(
  total: Totals,
  meta: Meta,
  mainCost: number,
  subCost: number,
  findings: Finding[],
  bill: Billing,
): void {
  const rate = cacheHitRate(total);
  const grade =
    rate >= 0.7
      ? c.green("● 优秀")
      : rate >= 0.4
        ? col("● 一般", ANSI.yellow)
        : col("● 偏低", ANSI.red);
  const winSaving = findings
    .filter((f) => f.kind === "win")
    .reduce((s, f) => s + f.estSaving, 0);

  console.log("");
  console.log(c.cyan(rule(W)));
  console.log("  " + c.bold(c.cyan("Claude Code 成本体检")) + c.dim("   ·   cc-checkup"));
  console.log(c.cyan(rule(W)));
  console.log("");
  if (bill.hasSub && bill.feeKnown) {
    console.log(
      "  " +
        padR("真实支出", 12) +
        c.bold(c.magenta(m(bill.realSpend))) +
        c.dim(`   订阅 ${m(bill.subFee)} + API实付 ${m(bill.apiSpend)}`),
    );
  } else if (bill.hasSub) {
    console.log(
      "  " +
        padR("API等价用量", 12) +
        c.bold(c.magenta(m(bill.subValue))) +
        c.dim("   订阅覆盖,非实付"),
    );
    console.log("  " + padR("API 实付", 12) + c.bold(m(bill.apiSpend)));
  } else {
    console.log("  " + padR("总花费", 12) + c.bold(c.magenta(m(bill.apiSpend))));
  }
  console.log("  " + padR("缓存命中率", 12) + hitColor(rate, pct0(rate)) + "  " + grade);
  console.log(
    "  " +
      padR("覆盖", 12) +
      c.dim(
        `${meta.sessions} 会话 · ${total.messages} 消息 · ${(meta.from ?? "").slice(0, 10)} → ${(meta.to ?? "").slice(5, 10)}`,
      ),
  );
  console.log(
    "  " + padR("主 / 子", 12) + c.dim(`${m(mainCost)} 主会话 · ${m(subCost)} 子智能体`),
  );

  if (bill.hasSub && bill.feeKnown) {
    console.log("");
    console.log(
      "  " +
        c.bold("▶ 订阅薅到价值") +
        "   " +
        c.bold(c.green(`约 ${m(bill.subValue)} · 回本 ${bill.roi.toFixed(1)}x`)),
    );
  } else if (winSaving >= 0.5) {
    console.log("");
    console.log(
      "  " + c.bold("▶ 识别到可优化空间") + "   " + c.bold(c.green("约 " + m(winSaving))),
    );
  }

  if (findings.length) {
    console.log("");
    console.log("  " + c.bold("建议"));
    for (const f of findings) {
      const marker = f.kind === "win" ? c.yellow("▸") : c.green("✓");
      const tag =
        f.kind === "win"
          ? "  " + c.green(`[可省 ~${m(f.estSaving)}]`)
          : f.estSaving >= 1
            ? "  " + c.cyan(`[已省 ~${m(f.estSaving)}]`)
            : "";
      console.log("    " + marker + " " + c.bold(f.title) + tag);
      console.log("       " + c.dim(f.detail));
    }
    if (bill.hasSub) {
      console.log(
        "       " +
          c.dim("注:订阅下 Anthropic 的「可省」是省额度/配额,非真金白银;API 模型才是实付。"),
      );
    }
  }

  console.log("");
  console.log(
    "  " +
      padR("Token", 12) +
      c.dim(
        `新鲜 ${tok(total.input)} · 缓存读 ${tok(total.cacheRead)} · 缓存写 ${tok(total.cacheCreate)} · 输出 ${tok(total.output)}`,
      ),
  );
  console.log(c.cyan(rule(W)));
}

export interface Row {
  label: string;
  t: Totals;
}

export function printTable(
  title: string,
  rows: Row[],
  grandCost: number,
  limit = 15,
): void {
  const sorted = rows
    .slice()
    .sort((a, b) => b.t.cost - a.t.cost)
    .slice(0, limit);
  if (sorted.length === 0) return;

  console.log("");
  console.log("  " + c.bold(title));
  console.log(
    c.dim(
      "  " +
        padR("名称", 32) +
        alignR("花费", 11) +
        alignR("占比", 8) +
        alignR("命中", 9) +
        alignR("消息", 8),
    ),
  );
  for (const row of sorted) {
    const rate = cacheHitRate(row.t);
    const share = grandCost > 0 ? row.t.cost / grandCost : 0;
    const hitPlain = pct(rate);
    const hitCell =
      " ".repeat(Math.max(0, 9 - hitPlain.length)) + hitColor(rate, hitPlain);
    console.log(
      "  " +
        padR(truncate(row.label, 32), 32) +
        alignR(m(row.t.cost), 11) +
        alignR(pct(share), 8) +
        hitCell +
        alignR(String(row.t.messages), 8),
    );
  }
}

export function printFooter(): void {
  console.log("");
  if (CUR.symbol === "¥") {
    console.log(c.dim(`  金额按 ¥/$ = ${CUR.rate} 估算 · 模型原始计价为美元`));
  }
  console.log(c.dim("  本地运行 · 不上传任何数据 · github.com/victor8613/cc-checkup"));
  console.log(c.dim("  价格表见 src/pricing.ts(DeepSeek / Fable 为占位价,请核对)"));
  console.log("");
}
