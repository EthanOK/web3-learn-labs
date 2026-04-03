# WebSocket 现货行情调研说明（供后端参考）

本文档对应仓库内 `utils/websocket/` 的**调研与联调脚本**，非线上服务。目的是验证三家交易所公开 WebSocket 的可连性、消息形态，以及**统一到 USDT 计价**后做**多源均值**的可行性与注意点。

## 1. 范围与结论摘要

| 交易所   | 公开 WS 端点（默认）                         | 本仓库使用的频道 / 事件        | 价格字段（现货最新价）   |
|----------|----------------------------------------------|--------------------------------|--------------------------|
| Binance  | `wss://data-stream.binance.vision/ws`        | `SUBSCRIBE` → `ethusdt@ticker` | `24hrTicker` 的 `c`      |
| OKX      | `wss://ws.okx.com/ws/v5/public`              | `tickers`，`instId` 如 `ETH-USDT` | `data[].last`        |
| Coinbase | `wss://ws-feed.exchange.coinbase.com`        | `channels: ["ticker"]`         | `ticker` 的 `price`      |

**统一到 `ETHUSDT` 口径：**

- Binance / OKX：原生即为 USDT 现货对。
- Coinbase：订阅 `ETH-USD` 与 `USDT-USD`，用 `price(ETH-USD) / price(USDT-USD)` 近似得到 USDT 计价（与现货 `ETH-USDT` 存在基差与延迟差异，生产环境需评估是否可接受）。

**多源均值（`ticker/avg_ticker.ts`）：**

- 每个交易对维护三家最新价与时间戳；**8s 内**视为有效，超时在日志里显示为 `n/a`，**不参与均值**。
- 均值 = 当前**有效**来源的算术平均（1～3 家均可，不要求三家同时在线）。
- 控制台输出节流约 **1s / 交易对**（避免刷屏）。

## 2. 端点、订阅 JSON 与推送结果（本仓库实际用法）

行情推送体以 **Binance / OKX 官方 WebSocket 文档**为准；**Coinbase** 与 Exchange `ws-feed` 实际 `ticker` 及 `ticker/coinbase_ticker.ts` 类型一致。下表数值均为示例。本仓库解析现价时：**Binance 用 `c`，OKX 用 `data[].last`，Coinbase 用 `price`（并按前述换算到 USDT）。**

### 2.1 Binance Spot

| 项目 | 内容 |
|------|------|
| **WS 端点（本仓库默认）** | `wss://data-stream.binance.vision/ws`（单连接，连上后发 `SUBSCRIBE`） |
| **可选：组合流（见 `binance_ticker.ts`）** | `wss://data-stream.binance.vision/stream?streams=ethusdt@ticker/btcusdt@ticker` — URL 已带流名时通常**无需**再发订阅 |
| **覆盖端点** | 环境变量 `BINANCE_WS_PUBLIC_URL` |

**发送（订阅 `<symbol>@ticker` → 24hrTicker）：**

```json
{
  "method": "SUBSCRIBE",
  "params": ["ethusdt@ticker", "btcusdt@ticker"],
  "id": 1
}
```

**订阅回执（成功，`result` 为 `null` 表示非查询类请求成功）：**

```json
{
  "result": null,
  "id": 1
}
```

**推送形态：**

1. **单连接 `/ws`**：根对象即为下表中的 `24hrTicker`。  
2. **组合流 `/stream?streams=...`**：根对象为 `{ "stream": "ethusdt@ticker", "data": { ...24hrTicker... } }`。

**`@ticker` 推送完整字段（Individual Symbol Ticker Streams，与官方文档一致）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `e` | string | 事件类型，固定 `24hrTicker` |
| `E` | number | 事件时间（ms） |
| `s` | string | 交易对，如 `ETHUSDT` |
| `p` | string | 24h 涨跌额 |
| `P` | string | 24h 涨跌幅（%） |
| `w` | string | 加权平均价 |
| `x` | string | 窗口内首笔成交价（见官方说明） |
| `c` | string | **最新价（last price）** |
| `Q` | string | 最新成交数量 |
| `b` | string | 最优买价 |
| `B` | string | 最优买量 |
| `a` | string | 最优卖价 |
| `A` | string | 最优卖量 |
| `o` | string | 24h 开盘价 |
| `h` | string | 24h 最高价 |
| `l` | string | 24h 最低价 |
| `v` | string | 24h 基础资产成交量 |
| `q` | string | 24h 计价资产成交额 |
| `O` | number | 统计窗口开始时间（ms） |
| `C` | number | 统计窗口结束时间（ms） |
| `F` | number | 首笔成交 ID |
| `L` | number | 末笔成交 ID |
| `n` | number | 24h 成交笔数 |

**示例 JSON（`data` 内层或与组合流 `data` 相同）：**

```json
{
  "e": "24hrTicker",
  "E": 1672515782136,
  "s": "ETHUSDT",
  "p": "50.12",
  "P": "2.08",
  "w": "2440.55",
  "x": "2390.00",
  "c": "2450.12",
  "Q": "0.042",
  "b": "2450.00",
  "B": "1.5",
  "a": "2450.20",
  "A": "2.0",
  "o": "2400.00",
  "h": "2480.00",
  "l": "2390.00",
  "v": "123456.78",
  "q": "301234567.89",
  "O": 1672430000000,
  "C": 1672515782136,
  "F": 100000001,
  "L": 100500000,
  "n": 345678
}
```

**组合流外层示例：**

```json
{
  "stream": "ethusdt@ticker",
  "data": {
    "e": "24hrTicker",
    "E": 1672515782136,
    "s": "ETHUSDT",
    "c": "2450.12"
  }
}
```

另可能收到 `ping`/`pong` 控制帧及错误 JSON；业务解析宜先判断是否存在 `e === "24hrTicker"` 或组合流的 `stream` + `data`。

---

### 2.2 OKX v5 Public

| 项目 | 内容 |
|------|------|
| **WS 端点（本仓库默认）** | `wss://ws.okx.com/ws/v5/public` |
| **覆盖端点** | 环境变量 `OKX_WS_PUBLIC_URL` |

**发送（订阅 `tickers`）：**

```json
{
  "id": "avg",
  "op": "subscribe",
  "args": [
    { "channel": "tickers", "instId": "ETH-USDT" },
    { "channel": "tickers", "instId": "BTC-USDT" }
  ]
}
```

**订阅成功回执：**

```json
{
  "id": "avg",
  "event": "subscribe",
  "arg": { "channel": "tickers", "instId": "ETH-USDT" },
  "connId": "a4d3ae55"
}
```

**订阅失败（示例）：**

```json
{
  "id": "avg",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: ...",
  "connId": "a4d3ae55"
}
```

**行情推送（`tickers` 频道完整 `data[]` 元素，与官方文档一致）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `instType` | string | 产品类型，现货多为 `SPOT` |
| `instId` | string | 如 `ETH-USDT` |
| `last` | string | **最新成交价** |
| `lastSz` | string | 最新成交数量（0 表示无成交） |
| `askPx` / `askSz` | string | 最优卖价 / 量 |
| `bidPx` / `bidSz` | string | 最优买价 / 量 |
| `open24h` / `high24h` / `low24h` | string | 24h 开 / 高 / 低 |
| `volCcy24h` | string | 24h 成交量（单位见官方：现货为计价货币口径） |
| `vol24h` | string | 24h 成交量（合约张数或基础币数量，见官方） |
| `sodUtc0` / `sodUtc8` | string | UTC0 / UTC8 开盘价 |
| `ts` | string | 本条 ticker 生成时间（ms 时间戳字符串） |

**示例 JSON：**

```json
{
  "arg": { "channel": "tickers", "instId": "ETH-USDT" },
  "data": [
    {
      "instType": "SPOT",
      "instId": "ETH-USDT",
      "last": "2450.11",
      "lastSz": "0.1",
      "askPx": "2450.20",
      "askSz": "11",
      "bidPx": "2450.00",
      "bidSz": "5",
      "open24h": "2400",
      "high24h": "2480",
      "low24h": "2380",
      "volCcy24h": "50000000",
      "vol24h": "20500",
      "sodUtc0": "2395",
      "sodUtc8": "2398",
      "ts": "1597026383085"
    }
  ]
}
```

本仓库逻辑：仅当根级存在 `arg.channel === "tickers"` 且 `data` 为数组时，按行情处理；与 `event: "subscribe"` / `error` 等回执区分。

---

### 2.3 Coinbase Exchange（ws-feed）

| 项目 | 内容 |
|------|------|
| **WS 端点（本仓库默认）** | `wss://ws-feed.exchange.coinbase.com` |
| **覆盖端点** | 环境变量 `COINBASE_WS_URL` |

**发送（与 `avg_ticker` 一致时需 `USDT-USD` + 各 `*-USD`）：**

```json
{
  "type": "subscribe",
  "product_ids": ["ETH-USD", "BTC-USD", "USDT-USD"],
  "channels": ["ticker"]
}
```

单脚本 `coinbase_ticker.ts` 还会订阅 `heartbeat`，此处从略。

**`ticker` 频道单条消息完整字段（与 `ticker/coinbase_ticker.ts` 及 ws-feed 一致）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 固定 `ticker` |
| `sequence` | number | 序列号 |
| `product_id` | string | 如 `ETH-USD`、`USDT-USD` |
| `price` | string | **最新价** |
| `open_24h` | string | 24h 开盘价 |
| `volume_24h` | string | 24h 成交量（base） |
| `low_24h` / `high_24h` | string | 24h 低 / 高 |
| `volume_30d` | string | 30d 成交量 |
| `best_bid` / `best_bid_size` | string | 最优买价 / 量 |
| `best_ask` / `best_ask_size` | string | 最优卖价 / 量 |
| `side` | string | 最新一笔主动方向（如 `buy` / `sell`） |
| `time` | string | ISO 时间 |
| `trade_id` | number | 成交 ID |
| `last_size` | string | 最新成交数量 |

**示例 JSON：**

```json
{
  "type": "ticker",
  "sequence": 1234567890123456,
  "product_id": "ETH-USD",
  "price": "3000.25",
  "open_24h": "2950.00",
  "volume_24h": "15000.50",
  "low_24h": "2900.00",
  "high_24h": "3050.00",
  "volume_30d": "450000.00",
  "best_bid": "3000.10",
  "best_bid_size": "2.5",
  "best_ask": "3000.30",
  "best_ask_size": "1.2",
  "side": "buy",
  "time": "2024-01-15T12:34:56.789000Z",
  "trade_id": 987654321,
  "last_size": "0.015"
}
```

**换算为与 Binance/OKX 一致的 `ETHUSDT` 口径（脚本内逻辑）：**

- 先缓存 `USDT-USD` 的 `price`，记为 \(r\) = USDT/USD。  
- 对 `ETH-USD`：`price_usdt = price(ETH-USD) / r`。  

**其它常见消息类型（非完整现价体，解析时需分支）：**

- `type: "subscriptions"`：订阅确认，内含已订阅 `channels` / `product_ids`。  
- `type: "heartbeat"`：保活（若订阅了 `heartbeat` 频道）。  
- `type: "error"`：错误信息。  

本仓库均值脚本仅处理 `type === "ticker"` 且含 `product_id`、`price`。

---

## 3. 目录与职责

| 路径 | 说明 |
|------|------|
| `webSocket_client.ts` | 公共：JSON 解析、多 URL 故障转移、断线退避重连（指数 backoff + 抖动）。 |
| `ticker/binance_ticker.ts` | 仅 Binance：组合流或单连接订阅，打印最新价。 |
| `ticker/okx_ticker.ts` | 仅 OKX：订阅 `tickers`，打印。 |
| `ticker/coinbase_ticker.ts` | 仅 Coinbase：含 `USDT-USD` 换算示例。 |
| `ticker/avg_ticker.ts` | 三家同时连接 + 统一符号 + 时效过滤 + 均值日志。 |

后端若自建服务，可只参考**订阅报文与字段映射**，重连与多 URL 策略可按语言栈自行实现；本仓库用 **Bun 内置 `WebSocket`**，不依赖 `ws` 包。

## 4. 环境变量（联调 / 网络受限时）

| 变量 | 用途 |
|------|------|
| `SYMBOLS` | `avg_ticker` 交易对列表，逗号或空格分隔，默认 `BTCUSDT,ETHUSDT`。例：`SYMBOLS=ETHUSDT`。 |
| `BINANCE_WS_PUBLIC_URL` | 覆盖 Binance 端点（单 URL）。 |
| `OKX_WS_PUBLIC_URL` | 覆盖 OKX 端点。 |
| `COINBASE_WS_URL` | 覆盖 Coinbase 端点。 |

Binance 单脚本还支持 `BINANCE_STREAMS`（流名列表）；`avg_ticker` 内 Binance 使用 `SYMBOLS` 生成 `lower@ticker` 并 `SUBSCRIBE`。

## 5. 本地测试命令

在项目根目录执行（需已安装 [Bun](https://bun.sh/)）：

```bash
# 仅验证单所
bun run utils/websocket/ticker/binance_ticker.ts
bun run utils/websocket/ticker/okx_ticker.ts
bun run utils/websocket/ticker/coinbase_ticker.ts

# 三所 + ETH（及默认 BTC）均值
SYMBOLS=ETHUSDT bun run utils/websocket/ticker/avg_ticker.ts
```

## 6. 给后端落地的建议（可选）

1. **连接与稳定性**：公网 WS 易受防火墙、地区、TLS 影响；生产建议可配置多 endpoint、指数退避重连、订阅成功后的心跳/超时检测（各所文档不同，需分别核对）。
2. **Coinbase 换算**：依赖 `USDT-USD` 与 `*-USD` 两条 ticker 的先后与新鲜度；若 `USDT-USD` 缺失，当前脚本不会更新该所 USDT 价（避免除零或陈旧汇率）。
3. **均值语义**：当前实现是「有效源简单平均」，未加权；若某所延迟大，可考虑中位数、丢弃离群值或按成交量加权（需额外字段与业务规则）。
4. **与 HTTP REST**：WS 适合实时推送；若后端仅需定时落库，也可用各所 REST 拉 last price 做对照校验。

## 7. 官方文档入口（实现以官方为准）

联调时请以各交易所最新文档为准（URL 与字段可能变更）：

- [Binance WebSocket Streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)
- [OKX WebSocket API](https://www.okx.com/docs-v5/zh/#order-book-trading-market-data-ws-tickers-channel)
- [Coinbase Exchange WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview)

---

*文档与脚本同步于仓库 `utils/websocket/`；若行为与代码不一致，以源码为准。*
