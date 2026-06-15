import type { Totals } from "./aggregate.js";

// Monthly subscription fee (USD) by plan. `api` = pure pay-per-token, no subscription.
const PLAN_FEE: Record<string, number> = { pro: 20, max: 100, max20: 200, api: 0 };

export function planFee(plan?: string): number {
  if (!plan) return 0;
  return PLAN_FEE[plan] ?? 0;
}

// Is this model billed per-token via API (real money) or covered by a Claude
// subscription (flat monthly fee)? On `--plan api` everything is real API cost.
export function isApiBilled(model: string, plan?: string): boolean {
  const anthropic = /opus|sonnet|haiku|fable|claude/i.test(model);
  if (plan === "api") return true;
  return !anthropic;
}

export interface Billing {
  apiSpend: number; // real money — API-billed models (USD)
  subValue: number; // API-equivalent value of subscription-covered models (USD)
  monthlyFee: number; // subscription monthly fee (USD)
  subFee: number; // subscription fee prorated to the analysed period (USD)
  periodDays: number;
  realSpend: number; // subFee + apiSpend — what you actually pay
  roi: number; // subValue / subFee
  hasSub: boolean; // any subscription-covered usage present
  feeKnown: boolean; // a paid plan fee is known (so ROI / real-spend is meaningful)
}

export function computeBilling(
  perModel: Map<string, Totals>,
  plan: string | undefined,
  monthlyFeeOverride: number | undefined,
  periodDays: number,
): Billing {
  let apiSpend = 0;
  let subValue = 0;
  let hasSub = false;
  for (const [model, t] of perModel) {
    if (model === "<synthetic>") continue;
    if (isApiBilled(model, plan)) {
      apiSpend += t.cost;
    } else {
      subValue += t.cost;
      hasSub = true;
    }
  }
  const monthlyFee = monthlyFeeOverride ?? planFee(plan);
  const days = Math.max(1, periodDays);
  const subFee = monthlyFee * (days / 30);
  const feeKnown = monthlyFee > 0 && hasSub;
  return {
    apiSpend,
    subValue,
    monthlyFee,
    subFee,
    periodDays: days,
    realSpend: subFee + apiSpend,
    roi: subFee > 0 ? subValue / subFee : 0,
    hasSub,
    feeKnown,
  };
}
