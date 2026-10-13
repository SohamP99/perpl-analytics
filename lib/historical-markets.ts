import type { Raw } from "./perpl";
// SOL v1 traded before being replaced by market 31. Verified against ContractAdded
// and getPerpetualInfo(30); omitted from the current-market API but candles remain public.
export function historicalMarkets(ctx: Raw): Raw[] {
  return ctx.markets.some((m: Raw) => m.id === 30)
    ? ctx.markets
    : [
        ...ctx.markets,
        {
          id: 30,
          instance_id: 1,
          symbol: "SOL (retired)",
          config: { price_decimals: 2, size_decimals: 3 },
          state: {},
        },
      ];
}
