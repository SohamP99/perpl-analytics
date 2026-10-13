"use client";
import { createContext, useContext } from "react";
import { Raw } from "@/lib/perpl";
export const AnalyticsContext = createContext({
  range: "All",
  end: Date.now(),
  market: "all",
  markets: [] as Raw[],
  openMarket: (_id: string) => {},
});
export const useAnalytics = () => useContext(AnalyticsContext);
export type TabProps = {
  protocol: Raw | null;
  markets: Raw[];
  volumeDaily: Raw[];
  chartMarkets: Raw[];
  loading: boolean;
  chartError: string;
  analytics: Raw | null;
  leaderboard: Raw | null;
  openWallet: (a: string) => void;
  openMarket: (id: string) => void;
  watch: string[];
  toggleWatch: (a: string) => void;
};
