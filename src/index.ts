#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { findTranscripts, parseFile } from "./parse.js";
import type { UsageRecord } from "./parse.js";
import { emptyTotals, add, groupBy, recordCost } from "./aggregate.js";
import type { Totals } from "./aggregate.js";
import { recommend } from "./recommend.js";
import { printReport, printTable, printFooter, setCurrency } from "./report.js";
import { buildSvg } from "./render-svg.js";
import { svgToPng } from "./render-png.js";
import { USD, cny } from "./money.js";
import type { Currency } from "./money.js";
import { getTheme } from "./themes.js";
import { computeBilling } from "./billing.js";

interface Args {
  dir?: string;
  sinceDays?: number;
  json?: boolean;
  cny?: boolean;
  rate?: number;
  svg?: string;
  png?: string;
  theme?: string;
  plan?: string;
  fee?: number;
}

function isVal(s?: string): boolean {
  return !!s && !s.startsWith("-");
}

function parseArgs(argv: string[]): Args {
  const a: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--dir") a.dir = argv[++i];
    else if (x === "--since") a.sinceDays = Number(argv[++i]);
    else if (x === "--json") a.json = true;
    else if (x === "--cny") {
      a.cny = true;
      if (isVal(argv[i + 1]) && !Number.isNaN(Number(argv[i + 1]))) {
        a.rate = Number(argv[++i]);
      }
    } else if (x === "--rate") {
      a.rate = Number(argv[++i]);
      a.cny = true;
    } else if (x === "--svg") {
      a.svg = isVal(argv[i + 1]) ? argv[++i] : "cc-checkup.svg";
    } else if (x === "--png") {
      a.png = isVal(argv[i + 1]) ? argv[++i] : "cc-checkup.png";
    } else if (x === "--theme") {
      a.theme = argv[++i];
    } else if (x === "--plan") {
      a.plan = argv[++i];
    } else if (x === "--fee") {
      a.fee = Number(argv[++i]);
    } else if (x === "-h" || x === "--help") {
      help();
      process.exit(0);
    }
  }
  return a;
}

function help(): void {
  console.log(`cc-checkup — Claude Code 成本体检

用法:
  cc-checkup [选项]

  --dir <path>     指定 projects 目录(默认 ~/.claude/projects)
  --since <天数>   只统计最近 N 天
  --cny [汇率]     用人民币显示(默认汇率 7.2,如 --cny 7.3)
  --png [路径]     生成账单截图 PNG(默认 cc-checkup.png)
  --svg [路径]     生成账单卡片 SVG(默认 cc-checkup.svg)
  --theme <名称>   卡片配色:dark(默认)/ midnight / light
  --plan <名称>    计费场景:pro/max/max20(Claude 订阅)或 api(纯按量)
                   订阅下 Anthropic 按订阅计、其余按 API 实付;不传则只区分用量
  --fee <美元/月>  自定义订阅月费(覆盖 --plan 的默认值)
  --json           输出原始 JSON`);
}

function mapToObj(map: Map<string, Totals>): Record<string, Totals> {
  const o: Record<string, Totals> = {};
  for (const [k, v] of map) o[k] = v;
  return o;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cur: Currency = args.cny ? cny(args.rate ?? 7.2) : USD;
  setCurrency(cur);

  const projectsDir = args.dir ?? join(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) {
    console.error(
      `找不到目录: ${projectsDir}\n用 --dir 指定 Claude Code 的 projects 目录。`,
    );
    process.exit(1);
  }

  const files = findTranscripts(projectsDir);
  let records: UsageRecord[] = [];
  for (const f of files) records.push(...parseFile(f, projectsDir));

  if (args.sinceDays && Number.isFinite(args.sinceDays)) {
    const cutoff = Date.now() - args.sinceDays * 86_400_000;
    records = records.filter(
      (r) => r.timestamp && Date.parse(r.timestamp) >= cutoff,
    );
  }

  if (records.length === 0) {
    console.error(
      "没有解析到任何带 usage 的消息。换个 --dir 或确认 Claude Code 用过。",
    );
    process.exit(0);
  }

  const total = emptyTotals();
  for (const r of records) add(total, r);

  let mainCost = 0;
  let subCost = 0;
  for (const r of records) {
    const cst = recordCost(r);
    if (r.isSidechain) subCost += cst;
    else mainCost += cst;
  }

  const times = (records
    .map((r) => r.timestamp)
    .filter(Boolean) as string[]).sort();
  const byModel = groupBy(records, (r) => r.model ?? "unknown");
  const findings = recommend(total, byModel);
  const meta = {
    files: files.length,
    sessions: new Set(records.map((r) => r.sessionId)).size,
    from: times[0],
    to: times[times.length - 1],
  };
  const fromT = Date.parse(meta.from ?? "");
  const toT = Date.parse(meta.to ?? "");
  const periodDays =
    Number.isFinite(fromT) && Number.isFinite(toT)
      ? Math.max(1, Math.round((toT - fromT) / 86_400_000))
      : 1;
  const billing = computeBilling(byModel, args.plan, args.fee, periodDays);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          total,
          mainCost,
          subCost,
          billing,
          findings,
          byProject: mapToObj(groupBy(records, (r) => r.project)),
          byModel: mapToObj(byModel),
          byBranch: mapToObj(groupBy(records, (r) => r.gitBranch ?? "(none)")),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.svg || args.png) {
    const models = [...byModel]
      .map(([name, t]) => ({ name, cost: t.cost }))
      .filter((md) => md.name !== "<synthetic>" && md.cost > 0)
      .sort((a, b) => b.cost - a.cost);
    const svg = buildSvg({
      total,
      sessions: meta.sessions,
      from: meta.from,
      to: meta.to,
      findings,
      models,
      cur,
      theme: getTheme(args.theme),
      billing,
    });
    if (args.svg) {
      writeFileSync(args.svg, svg, "utf8");
      console.log(`✓ 已生成 ${args.svg}`);
    }
    if (args.png) {
      try {
        await svgToPng(svg, args.png);
        console.log(`✓ 已生成 ${args.png}`);
      } catch (e) {
        console.error(
          `PNG 生成失败(--svg 仍可用)。确认已安装 @resvg/resvg-js。\n  ${(e as Error).message}`,
        );
      }
    }
  }

  printReport(total, meta, mainCost, subCost, findings, billing);
  printTable(
    "按项目",
    [...groupBy(records, (r) => r.project)].map(([label, t]) => ({ label, t })),
    total.cost,
  );
  printTable(
    "按模型",
    [...byModel].map(([label, t]) => ({ label, t })),
    total.cost,
  );
  printTable(
    "按 git 分支",
    [...groupBy(records, (r) => r.gitBranch ?? "(none)")].map(([label, t]) => ({
      label,
      t,
    })),
    total.cost,
  );
  printFooter();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
