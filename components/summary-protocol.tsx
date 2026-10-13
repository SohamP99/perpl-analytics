"use client";
import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Raw, money } from "@/lib/perpl";
import { localRead } from "./local-data";

export function useProtocolSummary() {
  const [data, setData] = useState<Raw | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false,
      running = false;
    async function load() {
      if (document.hidden || running) return;
      running = true;
      try {
        const r = await localRead("protocol");
        if (!stopped) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      } finally {
        running = false;
      }
    }
    load();
    window.addEventListener("perpl-sync", load);
    return () => {
      stopped = true;
      window.removeEventListener("perpl-sync", load);
    };
  }, []);
  return { data, error };
}
