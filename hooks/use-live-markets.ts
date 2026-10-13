import { useEffect, useState } from "react";
import { Raw, normalize } from "@/lib/perpl";
export function useLiveMarkets(ctx: Raw | null) {
  const [state, setState] = useState<Record<string, Raw>>({}),
    [funding, setFunding] = useState<Record<string, Raw>>({}),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    let socket: WebSocket | null = null,
      stopped = false,
      attempts = 0,
      retry = 1000,
      timer: ReturnType<typeof setTimeout>,
      flush: ReturnType<typeof setTimeout>,
      last = 0;
    let pending: Record<string, Raw> = {},
      rates: Record<string, Raw> = {};
    const connect = () => {
      if (stopped || document.hidden || attempts >= 3) return;
      attempts++;
      socket = new WebSocket("wss://app.perpl.xyz/ws/v1/market-data");
      socket.onopen = () => {
        retry = 1000;
        last = Date.now();
        socket?.send(
          JSON.stringify({
            mt: 5,
            subs: [
              { stream: "market-state@143", subscribe: true },
              { stream: "funding@143", subscribe: true },
              { stream: "heartbeat@143", subscribe: true },
            ],
          }),
        );
      };
      socket.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          last = Date.now();
          if (m.mt === 6) {
            setConnected(
              m.subs?.some(
                (s: Raw) =>
                  s.stream === "market-state@143" &&
                  (!s.status || s.status.code === 0),
              ),
            );
          }
          if (m.mt === 9 && m.d) {
            attempts = 0;
            pending = { ...pending, ...m.d };
            setConnected(true);
          }
          if (m.mt === 10 && m.d) rates = { ...rates, ...m.d };
          if (
            !flush &&
            (Object.keys(pending).length || Object.keys(rates).length)
          )
            flush = setTimeout(() => {
              const nextState = pending,
                nextRates = rates;
              pending = {};
              rates = {};
              if (Object.keys(nextState).length)
                setState((old) => ({ ...old, ...nextState }));
              if (Object.keys(nextRates).length)
                setFunding((old) => ({ ...old, ...nextRates }));
              flush = undefined as any;
            }, 1000);
        } catch {}
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped && !document.hidden && attempts < 3) {
          timer = setTimeout(connect, retry);
          retry = Math.min(30000, retry * 2);
        }
      };
      socket.onerror = () => socket?.close();
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.hidden) {
        socket?.close();
        setConnected(false);
      } else connect();
    };
    document.addEventListener("visibilitychange", visibility);
    connect();
    const health = setInterval(() => {
      if (
        !document.hidden &&
        attempts < 3 &&
        (!socket || socket.readyState === WebSocket.CLOSED)
      ) {
        clearTimeout(timer);
        connect();
      }
      if (last && Date.now() - last > 45000) {
        setConnected(false);
        socket?.close();
      }
    }, 15000);
    return () => {
      stopped = true;
      clearInterval(health);
      clearTimeout(timer);
      clearTimeout(flush);
      socket?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const markets = ctx
    ? ctx.markets.map((m: Raw) =>
        normalize(
          {
            ...m,
            state: connected ? { ...m.state, ...state[m.id] } : m.state,
            funding: connected ? funding[m.id] || m.funding : m.funding,
          },
          ctx,
        ),
      )
    : [];
  return { markets, connected };
}
