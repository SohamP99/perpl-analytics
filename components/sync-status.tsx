import { useEffect, useState, memo } from "react";
export default memo(function SyncStatus({
  updated,
  nextSync,
  status,
  live,
}: {
  updated: number;
  nextSync: number;
  status: string;
  live: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.ceil((nextSync - now) / 1000));
  return (
    <div className="sync-status">
      <span className={live ? "green" : "muted"}>
        ● {live ? "Live prices" : "Delayed prices"}
      </span>
      <span
        title={updated ? new Date(updated).toISOString() : "Awaiting snapshot"}
      >
        Aggregates every 5 min
      </span>
      <small data-testid="sync-countdown">
        {status === "Syncing"
          ? "Syncing…"
          : `Next ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}{" "}
        ·{" "}
        {updated
          ? "synced " +
            new Date(updated).toLocaleTimeString("en-GB", {
              timeZone: "UTC",
              hour: "2-digit",
              minute: "2-digit",
            }) +
            " UTC"
          : "Connecting"}
      </small>
    </div>
  );
});
