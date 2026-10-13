import { useState } from "react";
import { Command } from "cmdk";
import { Raw, short } from "@/lib/perpl";
import { TABS } from "@/hooks/use-navigation";
import { Modal } from "./pulse-ui";
export default function Palette({
  close,
  openWallet,
  openMarket,
  openTab,
  markets,
  watch,
  leaderboard,
}: {
  close: () => void;
  openWallet: (a: string) => void;
  openMarket: (id: string) => void;
  openTab: (s: string) => void;
  markets: Raw[];
  watch: string[];
  leaderboard: Raw | null;
}) {
  const [q, setQ] = useState("");
  let recent: string[] = [];
  try {
    recent = JSON.parse(localStorage.getItem("perpl-recent") || "[]");
  } catch {}
  const go = (a: string) => {
    openWallet(a);
    close();
  };
  const suggestions = [
    ...new Set([
      ...watch,
      ...recent,
      ...(leaderboard?.data?.d || [])
        .filter((r: Raw) => q && r.a.includes(q.toLowerCase()))
        .slice(0, 5)
        .map((r: Raw) => r.a),
    ]),
  ];
  return (
    <Modal title="Search Perpl Analytics" close={close}>
      <Command shouldFilter={false}>
        <Command.Input
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder="Wallet address, BTC, or tab name…"
          aria-label="Search address market or tab"
        />
        <Command.List>
          <Command.Empty>
            No matching result. Paste a full 0x wallet address.
          </Command.Empty>
          {/^0x[a-fA-F0-9]{40}$/.test(q) && (
            <Command.Item onSelect={() => go(q.toLowerCase())}>
              Open {short(q)}
            </Command.Item>
          )}
          <Command.Group heading="Markets">
            {markets
              .filter(
                (m) => !q || m.symbol.toLowerCase().includes(q.toLowerCase()),
              )
              .slice(0, 6)
              .map((m) => (
                <Command.Item
                  key={m.id}
                  onSelect={() => {
                    openMarket(String(m.id));
                    close();
                  }}
                >
                  {m.symbol} · Market
                </Command.Item>
              ))}
          </Command.Group>
          <Command.Group heading="Views">
            {TABS.filter(
              (t) => !q || t.toLowerCase().includes(q.toLowerCase()),
            ).map((t) => (
              <Command.Item
                key={t}
                onSelect={() => {
                  openTab(t);
                  close();
                }}
              >
                {t}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Watched, recent and matched wallets">
            {suggestions
              .filter((a) => !q || a.includes(q.toLowerCase()))
              .slice(0, 8)
              .map((a) => (
                <Command.Item key={a} onSelect={() => go(a)}>
                  {watch.includes(a) ? "★ " : ""}
                  {short(a)}
                </Command.Item>
              ))}
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  );
}
