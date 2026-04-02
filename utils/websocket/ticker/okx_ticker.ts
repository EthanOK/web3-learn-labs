import {
  connectWebSocketWithFailover,
  parseMessageEventJson,
} from "../webSocket_client";

/** 与 OKX 文档一致：主域与 wsaws 互为备用 */
const DEFAULT_PUBLIC_URLS = ["wss://ws.okx.com/ws/v5/public"] as const;

const publicUrls = process.env.OKX_WS_PUBLIC_URL
  ? [process.env.OKX_WS_PUBLIC_URL]
  : DEFAULT_PUBLIC_URLS;

/** 连接成功后发送的 subscribe，只改这里即可增删频道/交易对 */
const okxPublicSubscribePayload = {
  id: "10086",
  op: "subscribe",
  args: [
    { channel: "tickers", instId: "BTC-USDT" },
    { channel: "tickers", instId: "ETH-USDT" },
  ],
} as const;

/** OKX v5 public `tickers` 频道单条 data（推送里数值多为 string） */
export type OkxTickerRow = {
  instType?: string;
  instId?: string;
  last?: string;
  lastSz?: string;
  askPx?: string;
  askSz?: string;
  bidPx?: string;
  bidSz?: string;
  open24h?: string;
  high24h?: string;
  low24h?: string;
  sodUtc0?: string;
  sodUtc8?: string;
  volCcy24h?: string;
  vol24h?: string;
  ts?: string;
};

type OkxTickersPush = {
  arg?: { channel?: string; instId?: string };
  data?: OkxTickerRow[];
};

function onMessage(ev: MessageEvent) {
  const parsed = parseMessageEventJson(ev);
  if (parsed === undefined) return;
  const msg = parsed as OkxTickersPush;

  const arg = msg.arg;
  const rows = msg.data;
  if (arg?.channel === "tickers" && Array.isArray(rows) && rows.length > 0) {
    // console.log("📈 length:", rows.length);
    for (const ticker of rows) {
      console.log(`symbol: ${ticker.instId}  price: ${ticker.last}`);
    }
  } else {
    console.log("📩", msg);
  }
}

connectWebSocketWithFailover(0, {
  urls: publicUrls,
  onExhausted: () => {
    console.error(
      "无法在任一地址完成 TLS/WebSocket。多为网络问题：防火墙拦截 8443、地区限制、需代理/VPN。可设置 OKX_WS_PUBLIC_URL 指定端点。",
    );
  },
  onOpen: (ws) => {
    ws.send(JSON.stringify(okxPublicSubscribePayload));
  },
  onMessage,
});

// bun run utils/websocket/okx_ticker.ts
