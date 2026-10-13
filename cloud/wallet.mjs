import { Rpc, EXCHANGE, positionIds, positionView } from "../indexer/chain.mjs";
export class CloudWallet {
  constructor(store, publicData, { rpc } = {}) {
    this.store = store;
    this.publicData = publicData;
    this.rpc = rpc;
    this.pending = new Map();
  }
  async read(address, force = false) {
    const key = "wallet:" + address,
      saved = await this.store.cache(key);
    if (
      saved &&
      Date.now() - saved.at < 300000 &&
      (!force || Date.now() - saved.at < 10000)
    )
      return { ...saved.data, at: saved.at, liveError: "" };
    if (!this.pending.has(address)) {
      if (this.pending.size >= 4)
        throw Error("Wallet lookup busy; retry shortly");
      this.pending.set(
        address,
        this.load(address)
          .then(async (data) => {
            await this.store.saveCache(key, data);
            return { ...data, at: Date.now(), liveError: "" };
          })
          .finally(() => this.pending.delete(address)),
      );
    }
    try {
      return await this.pending.get(address);
    } catch {
      if (saved)
        return {
          ...saved.data,
          at: saved.at,
          liveError:
            "Current wallet read unavailable; previous snapshot retained",
        };
      throw Error("Current wallet read unavailable");
    }
  }
  async load(address) {
    if (!/^0x[a-f0-9]{40}$/.test(address))
      throw Error("Invalid wallet address");
    const rpc =
      this.rpc ||
      new Rpc(process.env.PERPL_LIVE_RPC_URL || "https://rpc.monad.xyz", 50, {
        attempts: 1,
        timeoutMs: 6000,
        signal: AbortSignal.timeout(18000),
      });
    const { data: c } = await this.publicData.publicRead("/v1/pub/context");
    if (
      c.chain.chain_id !== 143 ||
      !c.instances.some((i) => i.address.toLowerCase() === EXCHANGE)
    )
      throw Error("Unexpected Perpl deployment");
    const b = await rpc.block(),
      block = Number(BigInt(b.number));
    let a;
    try {
      [a] = await rpc.read("getAccountByAddr", [address], block, address);
    } catch (e) {
      if (e.contractError !== "AccountDoesNotExist") throw e;
      a = { accountId: 0n, balanceCNS: 0n, lockedBalanceCNS: 0n };
    }
    const data = {
      address,
      account: String(a.accountId),
      balance: Number(a.balanceCNS) / 1e6,
      locked: Number(a.lockedBalanceCNS) / 1e6,
      available: Math.max(0, Number(a.balanceCNS - a.lockedBalanceCNS) / 1e6),
      positions: [],
      block,
      blockTime: Number(BigInt(b.timestamp)) * 1000,
      errors: [],
    };
    if (a.accountId > 0n)
      for (const id of positionIds(a.positions)) {
        const m = c.markets.find((m) => m.id === id);
        if (!m) {
          data.errors.push("Market " + id + " metadata unavailable");
          continue;
        }
        try {
          const [p, mark, valid] = await rpc.read(
            "getPositionV2",
            [id, a.accountId],
            block,
            address,
          );
          if (p.lotLNS === 0n) continue;
          const margins = await rpc.read(
            "getMarginFractions",
            [id, p.lotLNS],
            block,
            address,
          );
          data.positions.push(
            positionView(p, m, margins.perpMaintMarginFracHdths, mark, valid),
          );
        } catch {
          data.errors.push("Market " + id + ": position read unavailable");
        }
      }
    return data;
  }
}
