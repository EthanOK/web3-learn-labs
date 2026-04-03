# 链上地址二维码工具说明

基于 `qrcode` 包：从 ETH / BTC（含测试网）地址生成 **URI 或纯地址** 的二维码，输出 **DataURL、PNG、终端字符**；适合脚本与后端复用同一套拼装逻辑。入口为 `generate.ts`。

## 1. 目录结构

| 文件 | 说明 |
|------|------|
| `generate.ts` | 地址识别、URI 拼装、生成 DataURL / PNG / 终端字符；含 CLI。 |

## 2. `generate.ts`：链与 URI 规则

### 2.1 支持的链（`ChainEnum`）

| 枚举 | 用途 |
|------|------|
| `Ethereum` / `Sepolia` | `0x` + 40 位十六进制（Sepolia 需显式 `chain`，或通过扩展识别逻辑） |
| `Bitcoin` | 主网：`bc1...` / `1...` / `3...` |
| `BitcoinTestnet` | 测试网：`tb1...` / `2...` |

`detectChainFromAddress(address)` 按格式推断链；无法识别会抛错。也可在选项里 **`chain`** 强制指定。

### 2.2 编码内容（`format`）

| `format` | 行为 |
|----------|------|
| `uri`（默认） | `ethereum:<address>`、`sepolia:<address>`、`bitcoin:<address>`；可带查询参数（见下）。 |
| `address` | 仅原始地址字符串，无前缀。 |

### 2.3 金额（`amount` / `unit`）

- **ETH / Sepolia**：默认 `unit: "eth"`，金额转为 **wei** 写入 URI 的 `value`；`unit: "wei"` 时把 `amount` 当作整数 wei。  
- **BTC / BTC Testnet**：`amount` 作为 BTC 数量字符串写入 `amount` 查询参数（如 `"0.001"`）。

### 2.4 收款示例：二维码里编码的字符串长什么样

以下由 `buildQrPayload` 生成（`format` 为默认 `uri` 时）；扫码得到的即是整段 URI。

#### 0.1 ETH（主网）

- 逻辑：`amount: "0.1"` 且默认 `unit: "eth"` 时，先换算成 **wei（18 位小数）**，再写入查询参数 **`value`**。`value` 为**整数字符串**，不是 `0.1`。
- 换算：\(0.1 \times 10^{18} =\) **`100000000000000000`** wei。

示例（地址请换成真实收款地址）：

```text
ethereum:0x你的地址?value=100000000000000000
```

Sepolia：`sepolia:0x你的地址?value=100000000000000000`。

若使用 `unit: "wei"` 且 `amount: "100000000000000000"`，结果与上面一致（不再做 ETH 小数解析）。

#### 0.1 BTC

- 逻辑：BTC 不把聪写进 URI，而是把金额作为 **BTC 十进制字符串** 放在 **`amount`** 参数中。

示例：

```text
bitcoin:你的地址?amount=0.1
```

测试网地址（如 `tb1...`）同理，仍为 `bitcoin:` scheme。

#### 对照表

| 资产 | URI 参数名 | 参数含义 | `0.1` 时的取值 |
|------|------------|----------|----------------|
| ETH / Sepolia | `value` | wei（整数，字符串） | `100000000000000000` |
| BTC | `amount` | BTC 数量（十进制字符串） | `0.1` |

不同钱包对 `ethereum:` / `bitcoin:` 及金额参数的支持程度不一，上线前应用目标钱包实扫验证。

### 2.5 二维码图像参数

`GenerateQrOptions` 可选：`errorCorrectionLevel`（`L`/`M`/`Q`/`H`）、`margin`、`scale`。

### 2.6 导出的 API

| 函数 | 说明 |
|------|------|
| `buildQrPayload(options)` | 返回最终扫码字符串（不画图）。 |
| `generateQrDataURL(options)` | 返回 `data:image/png;base64,...`。 |
| `generateQrPngBuffer(options)` | `Uint8Array` PNG。 |
| `generateQrPngFile(outFile, options)` | 写入磁盘。 |
| `generateQrTerminalString(options)` | 终端 ASCII；`small: true` 更紧凑。 |

在其它 TS 模块中：

```ts
import {
  buildQrPayload,
  generateQrDataURL,
  generateQrPngFile,
} from "./utils/qrcode/generate.ts";

await generateQrPngFile("out.png", {
  address: "0x...",
  amount: "0.01",
});
```

## 3. CLI（`generate.ts`）

在项目根目录：

```bash
# 输出 DataURL 到 stdout（无第二个参数）
bun utils/qrcode/generate.ts 0xYourEthAddress

# 写入 PNG
bun utils/qrcode/generate.ts 0xYourEthAddress ./qr.png

# 带金额（ETH 会进 URI 的 value）
bun utils/qrcode/generate.ts 0xYourEthAddress ./qr.png --amount 0.01

# 终端二维码
bun utils/qrcode/generate.ts --terminal bc1YourBtcAddress --small --amount 0.001
```

## 4. 依赖

- `qrcode`：`generate.ts`。

## 5. 注意点（给接入方）

1. **URI 与钱包兼容性**：不同钱包对 `ethereum:` / `bitcoin:` 参数支持程度不一，上线前用目标钱包实扫验证。  
2. **Sepolia**：地址形态与主网相同，自动识别会落在 `Ethereum`；测试网需 **`chain: "Sepolia"`**（或等价枚举键）才能生成 `sepolia:` scheme。

---

*若与源码行为不一致，以 `generate.ts` 为准。*
