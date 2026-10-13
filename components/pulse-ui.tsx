"use client";
import { useEffect, useRef } from "react";
import { X, LockKeyhole } from "lucide-react";

import { Raw, money } from "@/lib/perpl";
export const COLORS = Array.from(
  { length: 8 },
  (_, i) => "var(--cat-" + (i + 1) + ")",
);
export const stamp = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Tag({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"tag " + tone}>{children}</span>;
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <LockKeyhole size={20} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function Metric({
  title,
  value,
  note,
  definition,
  change,
  trend,
  loading = false,
}: {
  title: string;
  value: string;
  note?: React.ReactNode;
  definition?: string;
  change?: number | null;
  trend?: number[];
  loading?: boolean;
}) {
  const valid = trend?.filter(Number.isFinite) || [],
    lo = Math.min(...valid),
    hi = Math.max(...valid);
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{title}</span>
        <span
          title={definition || String(note || title)}
          aria-label={"About " + title}
          tabIndex={0}
        >
          ⓘ
        </span>
      </div>
      {loading ? (
        <div className="skeleton metric-skeleton" />
      ) : (
        <strong
          title={
            value === "—"
              ? "Not available for this source or coverage"
              : undefined
          }
        >
          {value}
        </strong>
      )}
      {change != null && (
        <div className={change < 0 ? "red" : "green"}>
          {change < 0 ? "▼" : "▲"} {Math.abs(change).toFixed(1)}% vs previous
          period
        </div>
      )}
      {valid.length > 1 && (
        <svg
          className="sparkline"
          viewBox="0 0 150 28"
          aria-label={title + " trend"}
        >
          <polyline
            fill="none"
            stroke="var(--purple)"
            strokeWidth="1.5"
            points={valid
              .map(
                (v, i) =>
                  (i / (valid.length - 1)) * 150 +
                  "," +
                  (26 - ((v - lo) / (hi - lo || 1)) * 24),
              )
              .join(" ")}
          />
        </svg>
      )}
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    (
      ref.current?.querySelector<HTMLElement>("input") ||
      ref.current?.querySelector<HTMLElement>("button")
    )?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input,select",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
