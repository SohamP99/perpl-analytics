import { useEffect, useState } from "react";
import { Raw, api, money } from "@/lib/perpl";
import { Modal, Metric } from "./pulse-ui";
import { ChartCard } from "./chart-card";
import { localRead } from "./local-data";
export default function MarketDrawer({
  id,
  markets,
  analytics,
  close,
  openWallet,
}: {
  id: string;
  markets: Raw[];
  analytics: Raw | null;
  close: () => void;
  openWallet: (a: string) => void;
}) {
  const m = markets.find((m) => String(m.id) === id),
    [rows, setRows] = useState<Raw[]>([]),
    [liqs, setLiqs] = useState<Raw[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let stop = false;
    const to = Math.floor(Date.now() / 300000) * 300000;
    Promise.all([
      api(`/v1/market-data/${id}/candles/3600/${to - 7 * 86400000}-${to}`),
      localRead("liquidations"),
    ])
      .then(([c, l]) => {
        if (!stop) {
          setRows(c.d || []);
          setLiqs(
            (l.rows || []).filter((r: Raw) => r.market === id).slice(0, 5),
          );
        }
      })
      .catch(
        () =>
          !stop &&
          setError("Detail data unavailable. Close and reopen to retry."),
      );
    return () => {
      stop = true;
    };
  }, [id]);
  const history = (analytics?.snapshots || [])
    .filter((r: Raw) => r.market === id)
    .map((r: Raw) => ({
      t: r.t,
      oi:
        r.state?.oi != null && r.state?.mrk != null
          ? ((r.state.oi / (m?.sizeScale || 1)) * r.state.mrk) /
            (m?.priceScale || 1)
          : null,
    }));
  return (
    <Modal
      title={(m?.symbol || "Market " + id) + " · Market detail"}
      close={close}
    >
      <div className="metric-grid three">
        <Metric title="Mark" value={money(m?.price, false)} />
        <Metric title="Open interest" value={money(m?.oi)} />
        <Metric title="24h volume" value={money(m?.volume)} />
      </div>
      <ChartCard
        title="Price · last 7 days"
        data={rows.map((r) => ({
          t: r.t,
          v: r.c != null ? r.c / (m?.priceScale || 1) : null,
        }))}
        series={[{ key: "v", label: "Close", aggregation: "last" }]}
        kind="line"
        allowCumulative={false}
        source="Perpl hourly candles"
        note={error}
      />
      {history.length > 1 && history.at(-1).t - history[0].t >= 86400000 ? (
        <ChartCard
          title="Recorded open interest"
          data={history}
          series={[{ key: "oi", label: "OI", aggregation: "last" }]}
          kind="line"
          allowCumulative={false}
          note="Forward-only hourly samples · 90-day retention"
        />
      ) : (
        <p className="chart-note">
          OI trend becomes available after 24 hours of recorded snapshots.
        </p>
      )}
      <h3>Latest available detailed liquidations</h3>
      <p className="chart-note">
        Partial historical coverage · dates shown per record.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time UTC</th>
              <th>Wallet / account</th>
              <th>Transaction</th>
            </tr>
          </thead>
          <tbody>
            {liqs.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.time).toISOString().slice(0, 16)}</td>
                <td>
                  {r.address ? (
                    <button
                      className="wallet-link"
                      onClick={() => openWallet(r.address)}
                    >
                      {r.address.slice(0, 8) + "…"}
                    </button>
                  ) : (
                    "#" + r.account
                  )}
                </td>
                <td>
                  <a
                    href={"https://monadscan.com/tx/" + r.tx}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liqs.length && <p>No detailed records available for this market.</p>}
      </div>
    </Modal>
  );
}
