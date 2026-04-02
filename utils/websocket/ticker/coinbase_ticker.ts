import {
  connectWebSocketWithFailover,
  parseMessageEventJson,
} from "../webSocket_client";

/** Coinbase Exchange WebSocket（公开行情） */
const DEFAULT_PUBLIC_URLS = ["wss://ws-feed.exchange.coinbase.com"] as const;

const publicUrls = process.env.COINBASE_WS_URL
  ? [process.env.COINBASE_WS_URL]
  : DEFAULT_PUBLIC_URLS;

const SUBSCRIBE = {
  type: "subscribe",
  // BTC-USD 比 BTC-USDT 更高频
  product_ids: ["ETH-USD", "BTC-USD", "USDT-USD"],
  // product_ids: ["ETH-USDT", "BTC-USDT"],
  channels: ["heartbeat", "ticker"],
} as const;

/** Coinbase Exchange `ticker` 频道推送结构（与 ws-feed 实际一致） */
type CoinbaseTickerPayload = {
  type: "ticker";
  sequence: number;
  product_id: string;
  price: string;
  open_24h: string;
  volume_24h: string;
  low_24h: string;
  high_24h: string;
  volume_30d: string;
  best_bid: string;
  best_bid_size: string;
  best_ask: string;
  best_ask_size: string;
  side: string;
  time: string;
  trade_id: number;
  last_size: string;
};

let lastUsdtUsd: number | undefined;

function isTickerPayload(x: unknown): x is CoinbaseTickerPayload {
  return (
    !!x &&
    typeof x === "object" &&
    (x as { type?: unknown }).type === "ticker" &&
    typeof (x as { product_id?: unknown }).product_id === "string"
  );
}

function msgType(msg: unknown): string | undefined {
  if (msg && typeof msg === "object" && "type" in msg) {
    const t = (msg as { type: unknown }).type;
    return typeof t === "string" ? t : undefined;
  }
  return undefined;
}

function onMessage(ev: MessageEvent) {
  const msg = parseMessageEventJson(ev);
  if (msg === undefined) return;

  if (isTickerPayload(msg)) {
    const m = msg;
    if (m.product_id === "USDT-USD") {
      const n = Number.parseFloat(m.price);
      if (Number.isFinite(n) && n > 0) lastUsdtUsd = n;
      console.log(`symbol: ${m.product_id}  price: ${m.price}`);
      return;
    }

    if (m.product_id.endsWith("USD")) {
      const symbol = m.product_id.replace(/USD$/, "USDT");
      const pxUsd = Number.parseFloat(m.price);
      if (lastUsdtUsd && Number.isFinite(pxUsd)) {
        const pxUsdt = pxUsd / lastUsdtUsd;
        console.log(`symbol: ${symbol}  price: ${pxUsdt}`);
      } else {
        console.log(`symbol: ${symbol}  price: ${m.price}`);
      }
      return;
    }

    console.log(`symbol: ${m.product_id}  price: ${m.price}`);
    return;
  }

  const t = msgType(msg);
  if (t === "heartbeat") {
    // console.log("💓 heartbeat", msg);
  } else if (t === "subscriptions" || t === "error") {
    console.log("📋", msg);
  } else {
    console.log("📩", msg);
  }
}

connectWebSocketWithFailover(0, {
  urls: publicUrls,
  onExhausted: () => {
    console.error(
      "无法在任一地址完成连接。多为网络问题，可设置 COINBASE_WS_URL 指定端点。",
    );
  },
  onOpen: (ws) => {
    ws.send(JSON.stringify(SUBSCRIBE));
  },
  onMessage,
});
