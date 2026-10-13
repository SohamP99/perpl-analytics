"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { Moon, Sun, Search } from "lucide-react";
import { Raw, normalize } from "@/lib/perpl";
import { historicalMarkets } from "@/lib/historical-markets";
import { RANGES } from "@/lib/analytics";
import { usePerpl, useCandles } from "@/hooks/use-perpl";
import { useLiveMarkets } from "@/hooks/use-live-markets";
import { useNavigation, useWatchlist, TABS } from "@/hooks/use-navigation";
import { useProtocolSummary } from "./summary-protocol";
import { localRead } from "./local-data";
import { AnalyticsContext, TabProps } from "./analytics-context";
import SyncStatus from "./sync-status";
const Overview = lazy(() => import("./tabs/overview")),
  Markets = lazy(() => import("./tabs/markets")),
  Fees = lazy(() => import("./tabs/fees")),
  Flows = lazy(() => import("./tabs/flows")),
  Growth = lazy(() => import("./tabs/growth")),
  Risk = lazy(() => import("./tabs/risk")),
  Traders = lazy(() => import("./tabs/traders")),
  Liquidations = lazy(() => import("./liquidations")),
  WalletProfile = lazy(() => import("./wallet-profile")),
  MarketDrawer = lazy(() => import("./market-drawer")),
  Palette = lazy(() => import("./command-palette")),
  Methodology = lazy(() => import("./methodology"));
function useFeed(path: string) {
  const [value, setValue] = useState<Raw | null>(null);
  useEffect(() => {
    let stop = false,
      running = false;
    const load = async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const d = await localRead(path);
        if (!stop) setValue(d);
      } catch {
      } finally {
        running = false;
      }
    };
    load();
    window.addEventListener("perpl-sync", load);
    return () => {
      stop = true;
      window.removeEventListener("perpl-sync", load);
    };
  }, [path]);
  return value;
}
export default function Dashboard() {
  const { nav, update } = useNavigation(),
    { watch, toggleWatch } = useWatchlist(),
    { data: protocol, error: protocolError } = useProtocolSummary(),
    { ctx, error, status, updated, nextSync } = usePerpl(),
    { markets, connected } = useLiveMarkets(ctx),
    {
      daily: volumeDaily,
      loading,
      error: chartError,
    } = useCandles(ctx, "1D", "all"),
    leaderboard = useFeed("leaderboard"),
    analytics = useFeed("analytics"),
    [theme, setTheme] = useState("dark"),
    [palette, setPalette] = useState(false),
    [mobileFilters, setMobileFilters] = useState(false);
  const chartMarkets = ctx
    ? historicalMarkets(ctx).map((m) => normalize(m, ctx))
    : [];
  useEffect(() => {
    try {
      setTheme(
        localStorage.getItem("perpl-theme") === "light" ? "light" : "dark",
      );
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("perpl-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const openWallet = (a: string) => {
    update({
      view: "wallet",
      address: a.toLowerCase(),
      compare: [],
      drawer: "",
    });
    try {
      const old = JSON.parse(localStorage.getItem("perpl-recent") || "[]");
      localStorage.setItem(
        "perpl-recent",
        JSON.stringify([a, ...old.filter((v: string) => v !== a)].slice(0, 8)),
      );
    } catch {}
  };
  const openMarket = (id: string) => update({ view: "protocol", drawer: id }),
    props: TabProps = {
      protocol,
      markets,
      volumeDaily,
      chartMarkets,
      loading,
      chartError,
      analytics,
      leaderboard,
      openWallet,
      openMarket,
      watch,
      toggleWatch,
    };
  const tabs: Record<string, React.ComponentType<TabProps>> = {
    Overview,
    Markets,
    Fees,
    "Capital flows": Flows,
    "Users & activity": Growth,
    "Risk & funding": Risk,
    Traders,
  };
  const Tab = tabs[nav.tab];
  return (
    <AnalyticsContext.Provider
      value={{
        range: nav.range,
        end: protocol?.coverage?.throughTime || updated || Date.now(),
        market: nav.market,
        markets,
        openMarket,
      }}
    >
      <div className="app-shell">
        <header className="header">
          <a href="/" className="brand" aria-label="Perpl Analytics home">
            <img className="brand-logo" src="/perpl-logo.svg" alt="" />
            <b>
              Perpl<span className="brand-light">Analytics</span>
            </b>
          </a>
          <nav className="main-nav" aria-label="Primary">
            <button
              className={nav.view === "protocol" ? "active" : ""}
              onClick={() => update({ view: "protocol" })}
            >
              Protocol
            </button>
            <button
              className={
                nav.view === "wallet" ? "wallet-nav active" : "wallet-nav"
              }
              onClick={() => update({ view: "wallet", drawer: "" })}
            >
              Wallets
            </button>
          </nav>
          <div className="header-right">
            <button
              className="search-trigger secondary"
              onClick={() => setPalette(true)}
              aria-label="Search wallets markets and tabs"
            >
              <Search size={16} />
              <span>Search</span>
              <kbd>
                {typeof navigator !== "undefined" &&
                /Mac/.test(navigator.platform)
                  ? "⌘"
                  : "Ctrl "}
                K
              </kbd>
            </button>
            <button
              className="theme-toggle icon-btn"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="network">
              <img className="chain-logo" src="/monad-logo.svg" alt="" />
              Monad
            </span>
          </div>
        </header>
        <main>
          <div className="compact-heading">
            <div>
              <span className="eyebrow">
                {nav.view === "protocol"
                  ? "Protocol / " + nav.tab
                  : nav.view === "wallet"
                    ? "Wallet intelligence"
                    : "Data & methodology"}
              </span>
              <h1>
                {nav.view === "protocol"
                  ? nav.tab
                  : nav.view === "wallet"
                    ? "Wallet explorer"
                    : "Methodology"}
              </h1>
            </div>
            <SyncStatus
              updated={updated}
              nextSync={nextSync}
              status={status}
              live={connected}
            />
          </div>
          {error && <div className="alert">{error}</div>}
          {nav.view === "protocol" && (
            <>
              <nav className="sub-nav" aria-label="Protocol sections">
                {TABS.map((t) => (
                  <button
                    className={nav.tab === t ? "active" : ""}
                    key={t}
                    onClick={() => update({ tab: t })}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              <div
                className={
                  "global-filters " + (mobileFilters ? "expanded" : "")
                }
              >
                <button
                  className="mobile-filter-trigger secondary"
                  onClick={() => setMobileFilters(!mobileFilters)}
                >
                  Filters · {nav.range} {mobileFilters ? "×" : ""}
                </button>
                <div className="filter-content">
                  <div className="period-picker" aria-label="Date range">
                    {RANGES.map((r) => (
                      <button
                        key={r}
                        aria-pressed={nav.range === r}
                        className={r === nav.range ? "active" : ""}
                        onClick={() => update({ range: r })}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <label>
                    Market{" "}
                    <select
                      aria-label="Global market filter"
                      value={nav.market}
                      onChange={(e) => update({ market: e.target.value })}
                    >
                      <option value="all">All markets</option>
                      {chartMarkets.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.symbol}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="muted">UTC · AUSD ≈ USD</span>
                </div>
              </div>
              {nav.market !== "all" && (
                <p className="chart-note">
                  Market filter applies to market-level charts and liquidation
                  details. Protocol fees, flows and account activity remain
                  all-market totals.
                </p>
              )}
              {protocolError && (
                <div className="alert">
                  Historical summaries could not refresh.{" "}
                  <button
                    onClick={() =>
                      window.dispatchEvent(new Event("perpl-sync"))
                    }
                  >
                    Retry
                  </button>
                </div>
              )}
              <Suspense
                fallback={
                  <div
                    className="skeleton chart-skeleton"
                    aria-label="Loading view"
                  />
                }
              >
                {nav.tab === "Liquidations" ? (
                  <Liquidations
                    markets={markets}
                    protocol={protocol}
                    openWallet={openWallet}
                  />
                ) : (
                  Tab && <Tab {...props} />
                )}
              </Suspense>
            </>
          )}
          <Suspense fallback={<div className="skeleton chart-skeleton" />}>
            {nav.view === "wallet" && (
              <WalletProfile
                address={nav.address}
                compare={nav.compare}
                setCompare={(compare) => update({ compare })}
                markets={markets}
                watch={watch}
                toggleWatch={toggleWatch}
                openWallet={openWallet}
                search={() => setPalette(true)}
              />
            )}{" "}
            {nav.view === "methodology" && <Methodology protocol={protocol} />}
          </Suspense>
          <footer>
            <span>
              <img className="footer-brand-logo" src="/perpl-logo.svg" alt="" />
              Perpl Analytics
            </span>
            <div>
              <a
                href="/methodology"
                onClick={(e) => {
                  e.preventDefault();
                  update({ view: "methodology", drawer: "" });
                }}
              >
                Data & methodology
              </a>
              <a
                href="https://docs.perpl.xyz/resources/for-developers/api"
                target="_blank"
                rel="noreferrer"
              >
                API docs ↗
              </a>
            </div>
          </footer>
        </main>
        <Suspense fallback={null}>
          {nav.drawer && nav.view === "protocol" && (
            <MarketDrawer
              id={nav.drawer}
              markets={chartMarkets.map(
                (m) => markets.find((x: Raw) => x.id === m.id) || m,
              )}
              analytics={analytics}
              close={() => update({ drawer: "" })}
              openWallet={openWallet}
            />
          )}{" "}
          {palette && (
            <Palette
              close={() => setPalette(false)}
              openWallet={openWallet}
              openMarket={openMarket}
              openTab={(tab) => update({ view: "protocol", tab, drawer: "" })}
              markets={markets}
              watch={watch}
              leaderboard={leaderboard}
            />
          )}
        </Suspense>
      </div>
    </AnalyticsContext.Provider>
  );
}
