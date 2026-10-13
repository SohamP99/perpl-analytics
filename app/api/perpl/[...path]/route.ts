import type { NextRequest } from "next/server";

// A fixed-origin, read-only relay. Private keys never reach this server.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/perpl", "");
  const publicPath =
    /^\/v1\/(pub\/context|market-data\/(ticker|\d+\/ticker|\d+\/book|\d+\/candles\/(60|300|900|1800|3600|7200|14400|28800|43200|86400)\/\d+-\d+|(?:\d+\/)?funding\/\d+-\d+))$/.test(
      path,
    );
  const privatePath =
    /^\/v1\/trading\/(wallet|positions|fills|position-history|account-history|portfolio\/(equity|pnl)\/(all|day|2weeks|week|month))$/.test(
      path,
    );
  if (!publicPath && !privatePath)
    return Response.json(
      { error: "Unsupported read endpoint" },
      { status: 400 },
    );
  const window = path.match(/\/(\d+)-(\d+)$/);
  if (
    publicPath &&
    window &&
    (Number(window[1]) < Date.UTC(2026, 1, 1) ||
      Number(window[2]) < Number(window[1]))
  )
    return Response.json(
      { error: "History starts February 1, 2026; invalid time window" },
      { status: 400 },
    );
  const headers: Record<string, string> = { Accept: "application/json" };
  if (privatePath) {
    for (const key of [
      "X-API-Key",
      "X-API-Timestamp",
      "X-API-Nonce",
      "X-API-Signature",
    ]) {
      const value = request.headers.get(key);
      if (!value)
        return Response.json(
          { error: "A signed read-only key is required" },
          { status: 401 },
        );
      headers[key] = value;
    }
  }
  try {
    const upstream = await fetch(
      "https://app.perpl.xyz/api" + path + url.search,
      { headers, signal: AbortSignal.timeout(15000), cache: "no-store" },
    );
    if (!upstream.ok)
      return Response.json(
        {
          error:
            upstream.status === 401 || upstream.status === 403
              ? "Perpl rejected this API key or signature"
              : upstream.status === 404
                ? "No Perpl account or history found"
                : `Perpl API returned ${upstream.status}`,
        },
        { status: upstream.status },
      );
    const data = await upstream.json();
    return Response.json(data, {
      headers: {
        "Cache-Control": privatePath ? "no-store" : "public, max-age=5",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Perpl is temporarily unreachable. Please retry." },
      { status: 502 },
    );
  }
}
