import { useEffect, useState } from "react";
import { Raw, money, pct, price, positionSize, short } from "@/lib/perpl";
import { Metric } from "./pulse-ui";
import { localRead } from "./local-data";
export function walletValues(current: Raw, markets: Raw[]) {
  const positions = current.positions.map((p: Raw) => {
    const mark = markets.find((m) => m.id === p.market)?.price ?? p.mark;
    const unrealized =
      p.unrealized != null && p.mark != null && mark != null
        ? p.unrealized + (p.side === "Long" ? 1 : -1) * p.size * (mark - p.mark)
        : p.unrealized;
    return {
      ...p,
      mark,
      unrealized,
      notional: mark != null ? p.size * mark : null,
      distance:
        mark > 0 && p.liquidation != null
          ? (Math.abs(mark - p.liquidation) / mark) * 100
          : null,
    };
  });
  const complete =
      !current.errors?.length &&
      positions.every((p: Raw) => p.unrealized != null && p.notional != null),
    collateral = positions.reduce((s: number, p: Raw) => s + p.collateral, 0),
    upnl = complete
      ? positions.reduce((s: number, p: Raw) => s + p.unrealized, 0)
      : null,
    equity = upnl != null ? current.balance + collateral + upnl : null,
    notional = complete
      ? positions.reduce((s: number, p: Raw) => s + p.notional, 0)
      : null;
  return { positions, collateral, upnl, equity, notional };
}
export default function WalletProfile({
  address,
  markets,
  watch,
  toggleWatch,
  compare,
  setCompare,
  openWallet,
  search,
}: {
  address: string;
  markets: Raw[];
  watch: string[];
  toggleWatch: (a: string) => void;
  compare: string[];
  setCompare: (a: string[]) => void;
  openWallet: (a: string) => void;
  search: () => void;
}) {
  const [data, setData] = useState<Record<string, Raw>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [other, setOther] = useState(""),
    [reload, setReload] = useState(0);
  const addresses = [address, ...compare]
    .filter((a, i, aAll) => a && aAll.indexOf(a) === i)
    .slice(0, 3);
  useEffect(() => {
    let stop = false,
      running = false;
    const load = async () => {
      if (running || document.hidden || !addresses.length) return;
      running = true;
      setBusy(true);
      const results = await Promise.allSettled(
        addresses.map(
          async (a) => [a, await localRead("wallet/" + a)] as const,
        ),
      );
      if (!stop) {
        let failed = false;
        setData((old) => {
          const next = { ...old };
          for (const r of results)
            if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
            else failed = true;
          return next;
        });
        setError(
          failed
            ? "Some wallet snapshots could not refresh. Saved values retained."
            : "",
        );
        setBusy(false);
      }
      running = false;
    };
    load();
    window.addEventListener("perpl-sync", load);
    return () => {
      stop = true;
      window.removeEventListener("perpl-sync", load);
    };
  }, [addresses.join(","), reload]);
  const current = data[address],
    v = current ? walletValues(current, markets) : null;
  const share = () =>
    navigator.clipboard
      .writeText(location.href)
      .then(() => setNotice("Link copied"))
      .catch(() => setNotice("Copy unavailable"));
  return (
    <>
      <section className="panel wallet-toolbar">
        <div className="inline">
          <h2>{address ? short(address) : "Wallet explorer"}</h2>
          {address && (
            <>
              <button
                className="secondary"
                aria-pressed={watch.includes(address)}
                onClick={() => toggleWatch(address)}
              >
                {watch.includes(address) ? "★ Watching" : "☆ Watch"}
              </button>
              <button
                className="secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(address)
                    .then(() => setNotice("Address copied"))
                }
              >
                Copy
              </button>
              <button className="secondary" onClick={share}>
                Share
              </button>
              <a
                href={"https://monadscan.com/address/" + address}
                target="_blank"
                rel="noreferrer"
              >
                MonadScan ↗
              </a>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setReload(reload + 1)}
              >
                Refresh wallet
              </button>
            </>
          )}
        </div>
        <div className="inline">
          <input
            aria-label="Compare wallet address"
            placeholder="Add wallet to compare"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
          <button
            className="secondary"
            disabled={
              !/^0x[a-fA-F0-9]{40}$/.test(other) ||
              addresses.length >= 3 ||
              addresses.includes(other.toLowerCase())
            }
            onClick={() => {
              setCompare([...compare, other.toLowerCase()]);
              setOther("");
            }}
          >
            Compare
          </button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && <p className="alert">{error}</p>}
      </section>
      {watch.length > 0 && (
        <div className="watchlist">
          <span>Watching</span>
          {watch.map((a) => (
            <button key={a} className="secondary" onClick={() => openWallet(a)}>
              {short(a)}
            </button>
          ))}
        </div>
      )}
      {!address ? (
        <section className="panel chart-empty">
          <h2>An address is all you need</h2>
          <p>Explore current positions and public leaderboard performance.</p>
          <button className="primary" onClick={search}>
            Search wallets
          </button>
        </section>
      ) : !current ? (
        <div className="skeleton chart-skeleton" aria-label="Loading wallet" />
      ) : (
        <>
          {current.account === "0" && (
            <p className="alert">No Perpl account found for this wallet.</p>
          )}
          {current.liveError && <p className="alert">{current.liveError}</p>}
          <div className="metric-grid">
            <Metric
              title="Estimated equity"
              value={money(v!.equity)}
              definition="Balance plus position collateral and mark-adjusted unrealized PnL. Based on the last contract snapshot."
              note="Mark-adjusted estimate · positions every 5 min"
            />
            <Metric
              title="Available balance"
              value={money(current.available)}
              note={money(current.locked) + " locked in orders"}
            />
            <Metric
              title="Collateral / equity"
              value={
                v!.equity && v!.equity > 0
                  ? ((v!.collateral / v!.equity) * 100).toFixed(1) + "%"
                  : "—"
              }
              note="Allocated collateral · not maintenance margin"
            />
            <Metric
              title="Account leverage"
              value={
                v!.equity && v!.equity > 0 && v!.notional != null
                  ? (v!.notional / v!.equity).toFixed(2) + "×"
                  : "—"
              }
              note="Current notional / estimated equity"
            />
          </div>
          <div className="metric-grid">
            {[
              ["pnl", "All-time PnL"],
              ["volume", "All-time volume"],
              ["roi", "All-time ROI"],
              ["volumeRank", "Volume rank"],
            ].map(([key, label]) => (
              <Metric
                key={key}
                title={label}
                value={
                  !current.leaderboard?.found
                    ? "—"
                    : key === "roi"
                      ? pct(current.leaderboard[key])
                      : key === "volumeRank"
                        ? String(current.leaderboard[key])
                        : money(current.leaderboard[key])
                }
                note="Perpl public leaderboard"
              />
            ))}
          </div>
          <section className="panel">
            <h2>Open positions</h2>
            <p className="chart-note">
              Contract snapshot{" "}
              {new Date(current.blockTime || current.at).toLocaleString(
                "en-GB",
                { timeZone: "UTC" },
              )}{" "}
              UTC · mark-adjusted estimates can lag new trades · liquidation
              prices estimated.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Market / side",
                      "Size",
                      "Entry",
                      "Mark",
                      "Notional",
                      "Collateral",
                      "uPnL",
                      "uPnL / collateral",
                      "Funding accrued",
                      "Est. liquidation",
                      "Distance",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v!.positions.map((p: Raw) => (
                    <tr key={p.market}>
                      <td>
                        {p.symbol}{" "}
                        <span className={p.side === "Long" ? "green" : "red"}>
                          {p.side}
                        </span>
                      </td>
                      <td>{positionSize(p)}</td>
                      <td>{price(p.entry)}</td>
                      <td>{price(p.mark)}</td>
                      <td>{money(p.notional)}</td>
                      <td>{money(p.collateral, false)}</td>
                      <td className={p.unrealized < 0 ? "red" : "green"}>
                        {money(p.unrealized, false)}
                      </td>
                      <td>
                        {p.collateral > 0 && p.unrealized != null
                          ? pct((p.unrealized / p.collateral) * 100)
                          : "—"}
                      </td>
                      <td>{money(p.funding, false)}</td>
                      <td>{price(p.liquidation)}</td>
                      <td
                        className={
                          p.distance != null && p.distance < 5
                            ? "red"
                            : p.distance != null && p.distance < 15
                              ? "amber"
                              : "green"
                        }
                      >
                        {p.distance?.toFixed(2) ?? "—"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!v!.positions.length && (
                <p className="chart-empty">No open positions.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <h2>Historical coverage</h2>
            <p>
              Public leaderboard totals are available. Individual trades,
              realised-PnL curves, win rate, hold time and equity drawdown are
              not available from the imported protocol summaries.
            </p>
            <p className="chart-note">
              No API key or wallet connection is required. Unavailable
              performance metrics are intentionally omitted.
            </p>
          </section>
          {addresses.length > 1 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Wallet comparison</h2>
                <button className="secondary" onClick={() => setCompare([])}>
                  Clear comparison
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      {addresses.map((a) => (
                        <th key={a}>{short(a)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      "Equity",
                      "All-time PnL",
                      "Volume",
                      "ROI",
                      "Current notional",
                    ].map((label) => (
                      <tr key={label}>
                        <th>{label}</th>
                        {addresses.map((a) => {
                          const d = data[a],
                            x = d ? walletValues(d, markets) : null,
                            n =
                              label === "Equity"
                                ? x?.equity
                                : label === "Current notional"
                                  ? x?.notional
                                  : d?.leaderboard?.found
                                    ? d.leaderboard[
                                        label === "All-time PnL"
                                          ? "pnl"
                                          : label === "Volume"
                                            ? "volume"
                                            : "roi"
                                      ]
                                    : null;
                          return (
                            <td key={a}>
                              {label === "ROI" ? pct(n) : money(n)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="chart-note">
                Current values and all-time leaderboard performance. Historical
                trade-level comparisons unavailable.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
