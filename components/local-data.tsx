import { Raw } from "@/lib/perpl";
export async function localRead(path: string): Promise<Raw> {
  const r = await fetch("/api/local/" + path, {
    signal: AbortSignal.timeout(25000),
  });
  const d = (await r.json()) as Raw;
  if (!r.ok) throw Error(d.error || "Data unavailable");
  return d;
}
