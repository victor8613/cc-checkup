export interface Currency {
  symbol: string;
  rate: number; // multiply a USD amount by this to display
}

export const USD: Currency = { symbol: "$", rate: 1 };

export function cny(rate = 7.2): Currency {
  return { symbol: "¥", rate };
}

export function fmtMoney(n: number, cur: Currency): string {
  const v = n * cur.rate;
  if (cur.symbol === "¥") {
    if (v >= 100) return "¥" + Math.round(v).toLocaleString("en-US");
    if (v >= 1) return "¥" + v.toFixed(1);
    return "¥" + v.toFixed(2);
  }
  if (v >= 100) return "$" + v.toFixed(0);
  if (v >= 1) return "$" + v.toFixed(2);
  return "$" + v.toFixed(4);
}
