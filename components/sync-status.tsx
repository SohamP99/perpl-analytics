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
      <span>
        Last synced{" "}
        {updated
          ? new Date(updated).toLocaleString("en-GB", {
              timeZone: "UTC",
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }) + " UTC"
          : "—"}
      </span>
      <small data-testid="sync-countdown">
        {status === "Syncing"
          ? "Syncing…"
          : `Next sync in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
      </small>
    </div>
  );
});
