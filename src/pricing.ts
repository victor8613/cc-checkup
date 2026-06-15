// Model prices in USD per 1M tokens. Matched by substring against the model id
// (e.g. "claude-opus-4-8" -> opus). EDIT THESE to match current Anthropic pricing.
//
// Cache multipliers (Anthropic standard, stable):
//   cache READ        = input price x 0.10
//   cache WRITE (5m)  = input price x 1.25
//   cache WRITE (1h)  = input price x 2.00

export interface ModelPrice {
  input: number;
  output: number;
}

const TABLE: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /opus/i, price: { input: 15, output: 75 } },
  { match: /sonnet/i, price: { input: 3, output: 15 } },
  { match: /haiku/i, price: { input: 0.8, output: 4 } },
  { match: /fable/i, price: { input: 15, output: 75 } }, // placeholder — verify
  { match: /deepseek/i, price: { input: 0.5, output: 1.5 } }, // placeholder — verify per tier (flash != pro)
];

// Used when the model id matches nothing above.
const DEFAULT_PRICE: ModelPrice = { input: 3, output: 15 };

export const CACHE_READ_MULT = 0.1;
export const CACHE_WRITE_5M_MULT = 1.25;
export const CACHE_WRITE_1H_MULT = 2.0;

export function priceFor(model: string | undefined): ModelPrice {
  if (!model) return DEFAULT_PRICE;
  for (const row of TABLE) {
    if (row.match.test(model)) return row.price;
  }
  return DEFAULT_PRICE;
}
