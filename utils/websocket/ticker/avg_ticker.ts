import {
  connectWebSocketWithFailover,
  parseMessageEventJson,
} from "../webSocket_client";

type Exchange = "binance" | "okx" | "coinbase";

type PriceState = {
  ts: number;
  price: number;
};

type SymbolState = Partial<Record<Exchange, PriceState>>;

function now() {
  return Date.now();
}

function parseSymbols(): string[] {
  // 统一用 Binance 风格：BTCUSDT / ETHUSDT
  const raw = process.env.SYMBOLS?.trim();
  if (!raw) return ["BTCUSDT", "ETHUSDT"];
  return raw
    .split(/[,\s]+/g)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

const symbols = parseSymbols();
const state = new Map<string, SymbolState>();
for (const s of symbols) state.set(s, {});

const lastPrintedAt = new Map<string, number>();
const PRINT_INTERVAL_MS = 1000;
const STALE_AFTER_MS = 8_000;

function isFresh(ps: PriceState, t = now()): boolean {
  return t - ps.ts <= STALE_AFTER_MS;
}

function displayPrice(ps: PriceState | undefined, t: number): string {
  if (!ps) return "n/a";
  return isFresh(ps, t) ? ps.price.toFixed(2) : "n/a";
}

function updatePrice(exchange: Exchange, symbol: string, price: number) {
  if (!Number.isFinite(price) || price <= 0) return;
  const st = state.get(symbol);
  if (!st) return;
  st[exchange] = { ts: now(), price };

  const t = now();
  const last = lastPrintedAt.get(symbol) ?? 0;
  if (t - last < PRINT_INTERVAL_MS) return;
  lastPrintedAt.set(symbol, t);

  const bps = st.binance;
  const ops = st.okx;
  const cps = st.coinbase;

  const parts: Array<{ ex: Exchange; price: number }> = [];
  if (bps && isFresh(bps, t)) parts.push({ ex: "binance", price: bps.price });
  if (ops && isFresh(ops, t)) parts.push({ ex: "okx", price: ops.price });
  if (cps && isFresh(cps, t)) parts.push({ ex: "coinbase", price: cps.price });
  if (parts.length === 0) return;

  const avg = parts.reduce((s, p) => s + p.price, 0) / parts.length;
  console.log(
    `symbol: ${symbol}  avg(${parts.length}): ${avg.toFixed(2)}  (binance: ${displayPrice(bps, t)}  okx: ${displayPrice(ops, t)}  coinbase: ${displayPrice(cps, t)})`,
  );
}

// ---------------- Binance ----------------

type BinanceCombinedStreamMsg<TData> = { stream: string; data: TData };
type BinanceTickerEvent = { e: "24hrTicker"; s: string; c: string };

function isBinanceCombinedStreamMsg(
  x: unknown,
): x is BinanceCombinedStreamMsg<unknown> {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as { stream?: unknown }).stream === "string" &&
    "data" in (x as { data?: unknown })
  );
}

function isBinanceTickerEvent(x: unknown): x is BinanceTickerEvent {
  return (
    !!x &&
    typeof x === "object" &&
    (x as { e?: unknown }).e === "24hrTicker" &&
    typeof (x as { s?: unknown }).s === "string" &&
    typeof (x as { c?: unknown }).c === "string"
  );
}

function startBinance() {
  const defaultUrl = "wss://data-stream.binance.vision/ws";
  const urls = process.env.BINANCE_WS_PUBLIC_URL
    ? [process.env.BINANCE_WS_PUBLIC_URL]
    : [defaultUrl];

  const streams = symbols.map((s) => `${s.toLowerCase()}@ticker`);

  connectWebSocketWithFailover(0, {
    urls,
    onExhausted: () => {
      console.error(
        "Binance：无法连接任一地址。可设置 BINANCE_WS_PUBLIC_URL 指定端点。",
      );
    },
    onOpen: (ws) => {
      const payload = { method: "SUBSCRIBE", params: streams, id: 1 } as const;
      ws.send(JSON.stringify(payload));
    },
    onMessage: (ev) => {
      const msg = parseMessageEventJson(ev);
      if (msg === undefined) return;

      if (isBinanceCombinedStreamMsg(msg)) {
        const data = msg.data;
        if (isBinanceTickerEvent(data)) {
          const symbol = data.s.toUpperCase();
          const price = Number.parseFloat(data.c);
          updatePrice("binance", symbol, price);
        }
        return;
      }

      if (isBinanceTickerEvent(msg)) {
        const symbol = msg.s.toUpperCase();
        const price = Number.parseFloat(msg.c);
        updatePrice("binance", symbol, price);
      }
    },
  });
}

// ---------------- OKX ----------------

type OkxTickerRow = { instId?: string; last?: string };
type OkxTickersPush = {
  arg?: { channel?: string; instId?: string };
  data?: OkxTickerRow[];
};

function toOkxInstId(symbol: string): string {
  // BTCUSDT -> BTC-USDT
  return symbol.replace(/USDT$/i, "-USDT");
}

function startOkx() {
  const defaultUrl = "wss://ws.okx.com/ws/v5/public";
  const urls = process.env.OKX_WS_PUBLIC_URL
    ? [process.env.OKX_WS_PUBLIC_URL]
    : [defaultUrl];

  const args = symbols.map((s) => ({ channel: "tickers", instId: toOkxInstId(s) }));
  const subscribe = { id: "avg", op: "subscribe", args } as const;

  connectWebSocketWithFailover(0, {
    urls,
    onExhausted: () => {
      console.error(
        "OKX：无法连接任一地址。可设置 OKX_WS_PUBLIC_URL 指定端点。",
      );
    },
    onOpen: (ws) => {
      ws.send(JSON.stringify(subscribe));
    },
    onMessage: (ev) => {
      const parsed = parseMessageEventJson(ev);
      if (parsed === undefined) return;
      const msg = parsed as OkxTickersPush;

      if (msg.arg?.channel === "tickers" && Array.isArray(msg.data)) {
        for (const row of msg.data) {
          if (!row.instId || !row.last) continue;
          const symbol = row.instId.replace("-", "").toUpperCase(); // BTC-USDT -> BTCUSDT
          const price = Number.parseFloat(row.last);
          updatePrice("okx", symbol, price);
        }
      }
    },
  });
}

// ---------------- Coinbase ----------------

type CoinbaseTickerPayload = { type: "ticker"; product_id: string; price: string };

function isCoinbaseTickerPayload(x: unknown): x is CoinbaseTickerPayload {
  return (
    !!x &&
    typeof x === "object" &&
    (x as { type?: unknown }).type === "ticker" &&
    typeof (x as { product_id?: unknown }).product_id === "string" &&
    typeof (x as { price?: unknown }).price === "string"
  );
}

function toCoinbaseProductId(symbol: string): string | undefined {
  // 用 USD 频道，再用 USDT-USD 做换算
  if (symbol.endsWith("USDT")) return `${symbol.slice(0, -4)}-USD`;
  return undefined;
}

function startCoinbase() {
  const defaultUrl = "wss://ws-feed.exchange.coinbase.com";
  const urls = process.env.COINBASE_WS_URL
    ? [process.env.COINBASE_WS_URL]
    : [defaultUrl];

  const productIds = new Set<string>();
  productIds.add("USDT-USD");
  for (const s of symbols) {
    const pid = toCoinbaseProductId(s);
    if (pid) productIds.add(pid);
  }

  const subscribe = {
    type: "subscribe",
    product_ids: [...productIds],
    channels: ["ticker"],
  } as const;

  let lastUsdtUsd: number | undefined;

  connectWebSocketWithFailover(0, {
    urls,
    onExhausted: () => {
      console.error(
        "Coinbase：无法连接任一地址。可设置 COINBASE_WS_URL 指定端点。",
      );
    },
    onOpen: (ws) => {
      ws.send(JSON.stringify(subscribe));
    },
    onMessage: (ev) => {
      const msg = parseMessageEventJson(ev);
      if (msg === undefined) return;
      if (!isCoinbaseTickerPayload(msg)) return;

      const pid = msg.product_id;
      const px = Number.parseFloat(msg.price);
      if (!Number.isFinite(px) || px <= 0) return;

      if (pid === "USDT-USD") {
        lastUsdtUsd = px;
        return;
      }

      if (pid.endsWith("-USD")) {
        const base = pid.slice(0, -4); // BTC / ETH
        const symbol = `${base}USDT`;
        if (!lastUsdtUsd) return;
        updatePrice("coinbase", symbol, px / lastUsdtUsd);
      }
    },
  });
}

startBinance();
startOkx();
startCoinbase();

// 用法：
// SYMBOLS=BTCUSDT,ETHUSDT bun run utils/websocket/ticker/avg_ticker.ts
