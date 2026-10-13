import { useEffect, useState } from "react";
export const TABS = [
  "Overview",
  "Markets",
  "Fees",
  "Capital flows",
  "Users & activity",
  "Risk & funding",
  "Traders",
  "Liquidations",
];
const slug = (v: string) =>
  v.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-");
function read() {
  const p = new URLSearchParams(location.search);
  return {
    view:
      p.get("view") === "wallet"
        ? "wallet"
        : location.pathname === "/methodology"
          ? "methodology"
          : "protocol",
    tab: TABS.find((t) => slug(t) === p.get("tab")) || "Overview",
    range:
      ["7D", "30D", "90D", "YTD", "All"].find(
        (r) => r.toLowerCase() === p.get("range"),
      ) || "All",
    market: p.get("market") || "all",
    address: /^0x[a-fA-F0-9]{40}$/.test(p.get("address") || "")
      ? p.get("address")!.toLowerCase()
      : "",
    compare: (p.get("compare") || "")
      .split(",")
      .filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a))
      .slice(0, 2),
    drawer: p.get("detail") || "",
  };
}
export function useNavigation() {
  const [nav, setNav] = useState(read);
  useEffect(() => {
    const on = () => setNav(read());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const update = (patch: Partial<ReturnType<typeof read>>) => {
    const n = { ...nav, ...patch },
      p = new URLSearchParams();
    p.set("view", n.view);
    if (n.view === "protocol") {
      p.set("tab", slug(n.tab));
      p.set("range", n.range.toLowerCase());
      if (n.market !== "all") p.set("market", n.market);
      if (n.drawer) p.set("detail", n.drawer);
    }
    if (n.view === "wallet") {
      if (n.address) p.set("address", n.address);
      if (n.compare.length) p.set("compare", n.compare.join(","));
    }
    history.pushState(
      {},
      "",
      n.view === "methodology" ? "/methodology" : "/?" + p,
    );
    setNav(n);
  };
  return { nav, update };
}
export function useWatchlist() {
  const [watch, setWatch] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("perpl-watch") || "[]")
        .filter((a: string) => /^0x[a-fA-F0-9]{40}$/.test(a))
        .slice(0, 20);
    } catch {
      return [];
    }
  });
  const toggleWatch = (a: string) =>
    setWatch((old) => {
      const next = old.includes(a)
        ? old.filter((x) => x !== a)
        : [...old, a].slice(-20);
      try {
        localStorage.setItem("perpl-watch", JSON.stringify(next));
      } catch {}
      return next;
    });
  return { watch, toggleWatch };
}
