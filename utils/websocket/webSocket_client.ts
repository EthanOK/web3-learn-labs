/**
 * 公用 WebSocket 工具（Bun / 浏览器内置 WebSocket，不依赖 `ws` 包）
 */

/** 将 MessageEvent.data 转为 UTF-8 字符串（兼容 string / ArrayBuffer / TypedArray） */
export function messageDataToString(data: MessageEvent["data"]): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data.buffer);
  return String(data);
}

const DEFAULT_JSON_PREVIEW = 200;

/** 从 message 事件解析 JSON；失败时打印预览并返回 undefined */
export function parseMessageEventJson(
  ev: MessageEvent,
  previewLength = DEFAULT_JSON_PREVIEW,
): unknown | undefined {
  const raw = messageDataToString(ev.data);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    console.error("❌ invalid JSON:", raw.slice(0, previewLength));
    return undefined;
  }
}

export type WebSocketFailoverOptions = {
  urls: readonly string[];
  /** 所有 URL 都连不上时调用（通常里层 console.error） */
  onExhausted: () => void;
  /** 连接成功：发送 subscribe 等；随后会自动注册 onMessage / error / close */
  onOpen: (ws: WebSocket, url: string) => void;
  onMessage: (ev: MessageEvent) => void;
  /**
   * 断线自动重连（默认开启）。
   * - `enabled=false` 可彻底关闭重连
   * - `maxDelayMs` 仅限制单次等待上限（整体不会停止重试）
   */
  reconnect?: {
    enabled?: boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function computeBackoffDelayMs(attempt: number, options?: WebSocketFailoverOptions["reconnect"]): number {
  const base = options?.baseDelayMs ?? 500;
  const max = options?.maxDelayMs ?? 30_000;
  const jitterRatio = clamp(options?.jitterRatio ?? 0.2, 0, 1);

  // attempt=0 表示立刻重试（但我们通常用 attempt 从 1 开始）
  const exp = attempt <= 0 ? 0 : attempt - 1;
  const raw = base * 2 ** exp;
  const capped = Math.min(raw, max);
  const jitter = capped * jitterRatio * (Math.random() * 2 - 1); // [-ratio, +ratio]
  return Math.max(0, Math.round(capped + jitter));
}

/**
 * 按顺序尝试 URL：首次 error 则换下一个；open 后挂上业务 onMessage。
 */
export function connectWebSocketWithFailover(
  index: number,
  options: WebSocketFailoverOptions,
): void {
  const { urls, onExhausted, onOpen, onMessage } = options;
  const reconnectEnabled = options.reconnect?.enabled ?? true;

  let lastConnectedIndex = Math.max(0, index);
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const clearReconnectTimer = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  };

  const scheduleReconnect = (reason: string) => {
    if (!reconnectEnabled) return;
    clearReconnectTimer();
    reconnectAttempt += 1;
    const delayMs = computeBackoffDelayMs(reconnectAttempt, options.reconnect);
    console.log(`♻️  ${reason}，${delayMs}ms 后重连（第 ${reconnectAttempt} 次）…`);
    reconnectTimer = setTimeout(() => {
      connectFrom(lastConnectedIndex);
    }, delayMs);
  };

  const connectFrom = (startIndex: number) => {
    clearReconnectTimer();

    const tryIndex = (i: number) => {
      if (i >= urls.length) {
        onExhausted();
        // 全部失败也继续重连（等待后从 0 开始再来一轮）
        lastConnectedIndex = 0;
        scheduleReconnect("所有地址连接失败");
        return;
      }

      const url = urls[i];
      if (!url) {
        tryIndex(i + 1);
        return;
      }

      console.log(`正在连接 ${url} …`);
      const ws = new WebSocket(url);

      ws.addEventListener(
        "open",
        () => {
          console.log("✅ WebSocket connected");
          reconnectAttempt = 0;
          lastConnectedIndex = i;

          onOpen(ws, url);
          ws.addEventListener("message", onMessage);
          ws.addEventListener("error", (ev: Event) => {
            console.error("❌ WebSocket error:", ev);
          });
          ws.addEventListener("close", (ev: CloseEvent) => {
            console.log(`🔌 WebSocket closed (code=${ev.code} reason=${ev.reason || "n/a"})`);
            scheduleReconnect("连接断开");
          });
        },
        { once: true },
      );

      ws.addEventListener(
        "error",
        (ev: Event) => {
          console.error(`❌ ${url}`, ev);
          tryIndex(i + 1);
        },
        { once: true },
      );
    };

    tryIndex(Math.max(0, startIndex));
  };

  connectFrom(index);
}
