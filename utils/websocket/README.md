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

## 2. 目录与职责

| 路径 | 说明 |
|------|------|
| `webSocket_client.ts` | 公共：JSON 解析、多 URL 故障转移、断线退避重连（指数 backoff + 抖动）。 |
| `ticker/binance_ticker.ts` | 仅 Binance：组合流或单连接订阅，打印最新价。 |
| `ticker/okx_ticker.ts` | 仅 OKX：订阅 `tickers`，打印。 |
| `ticker/coinbase_ticker.ts` | 仅 Coinbase：含 `USDT-USD` 换算示例。 |
| `ticker/avg_ticker.ts` | 三家同时连接 + 统一符号 + 时效过滤 + 均值日志。 |

后端若自建服务，可只参考**订阅报文与字段映射**，重连与多 URL 策略可按语言栈自行实现；本仓库用 **Bun 内置 `WebSocket`**，不依赖 `ws` 包。

## 3. 环境变量（联调 / 网络受限时）

| 变量 | 用途 |
|------|------|
| `SYMBOLS` | `avg_ticker` 交易对列表，逗号或空格分隔，默认 `BTCUSDT,ETHUSDT`。例：`SYMBOLS=ETHUSDT`。 |
| `BINANCE_WS_PUBLIC_URL` | 覆盖 Binance 端点（单 URL）。 |
| `OKX_WS_PUBLIC_URL` | 覆盖 OKX 端点。 |
| `COINBASE_WS_URL` | 覆盖 Coinbase 端点。 |

Binance 单脚本还支持 `BINANCE_STREAMS`（流名列表）；`avg_ticker` 内 Binance 使用 `SYMBOLS` 生成 `lower@ticker` 并 `SUBSCRIBE`。

## 4. 本地测试命令

在项目根目录执行（需已安装 [Bun](https://bun.sh/)）：

```bash
# 仅验证单所
bun run utils/websocket/ticker/binance_ticker.ts
bun run utils/websocket/ticker/okx_ticker.ts
bun run utils/websocket/ticker/coinbase_ticker.ts

# 三所 + ETH（及默认 BTC）均值
SYMBOLS=ETHUSDT bun run utils/websocket/ticker/avg_ticker.ts
```

## 5. 给后端落地的建议（可选）

1. **连接与稳定性**：公网 WS 易受防火墙、地区、TLS 影响；生产建议可配置多 endpoint、指数退避重连、订阅成功后的心跳/超时检测（各所文档不同，需分别核对）。
2. **Coinbase 换算**：依赖 `USDT-USD` 与 `*-USD` 两条 ticker 的先后与新鲜度；若 `USDT-USD` 缺失，当前脚本不会更新该所 USDT 价（避免除零或陈旧汇率）。
3. **均值语义**：当前实现是「有效源简单平均」，未加权；若某所延迟大，可考虑中位数、丢弃离群值或按成交量加权（需额外字段与业务规则）。
4. **与 HTTP REST**：WS 适合实时推送；若后端仅需定时落库，也可用各所 REST 拉 last price 做对照校验。

## 6. 官方文档入口（实现以官方为准）

联调时请以各交易所最新文档为准（URL 与字段可能变更）：

- [Binance WebSocket Streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)
- [OKX WebSocket API](https://www.okx.com/docs-v5/zh/#order-book-trading-market-data-ws-tickers-channel)
- [Coinbase Exchange WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview)

---

*文档与脚本同步于仓库 `utils/websocket/`；若行为与代码不一致，以源码为准。*
