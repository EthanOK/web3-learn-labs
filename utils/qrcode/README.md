# 链上抵押 / 收款地址二维码（URI 编码说明）

**定位**：说明 **抵押 / 收款地址给用户扫的二维码** 里，应编码成怎样的 **`ethereum:` / `bitcoin:` URI**（含可选金额）。**典型用途**：抵押、充值等场景的地址展示，用户用手机钱包扫码后自动带出地址与金额，减少手抄错误。

**URI 字符串**的拼装规则见下文；把该字符串交给二维码库即可出图。

- **前端展示（推荐）**：需要更好的视觉效果（圆角点阵、中心 Logo、纠错等级、导出 PNG 等）时，建议使用 **[qr-code-styling](https://github.com/kozakdenys/qr-code-styling)** 的 **`QRCodeStyling`**。扫码内容仍是同一套 `ethereum:` / `bitcoin:` 文本，与库无关。本仓库可参考 `styled-preview-client.ts`（配置样式与 `data`）与 `styled_serve.ts`（本地预览页）。
- **脚本 / 联调**：`generate.ts` 使用 **`eth-url-parser`**（类型由 **`@types/eth-url-parser`** 提供）按 ERC-681 拼装 `ethereum:`；BTC 使用 **[`bip-321`](https://www.npmjs.com/package/bip-321)** 的 **`encodeBIP321`** 生成符合 **BIP-321** 的 `bitcoin:` URI。出图由 **`qrcode`**（DataURL、PNG、终端字符）。

## 1. 目录结构

| 文件 | 说明 |
|------|------|
| `generate.ts` | 地址识别、URI 拼装、生成 DataURL / PNG / 终端字符；含 CLI。 |
| `styled-preview-client.ts` | 前端参考：`QRCodeStyling` 圆角样式、中心 `logo.svg`、下载 PNG。 |
| `styled_serve.ts` | 本地预览：`bun run qr:styled`（见 `package.json`）。 |
| `styled-preview.html` | 预览页 HTML。 |
| `logo.svg` | 样式二维码中心图。 |

## 2. `generate.ts`：链与 URI 规则

### 2.1 地址如何对应 EVM / BTC（`detectChainFromAddress`）

| 识别结果（`DetectedAddressKind`） | 地址形态 |
|-------------------------|----------|
| `ethereum` | `0x` + 40 位十六进制（**无法从地址区分主网与 Sepolia**） |
| `bitcoin` | `bc1...` / `1...` / `3...` / `tb1...` / `2...` 等（URI 不区分主网/测试网，一律 `bitcoin:<地址>?...`） |

`detectChainFromAddress(address)` 仅按格式推断；无法识别会抛错。**EVM 测试网**在 URI 里用 **`chainId` / `--chainId`**（Sepolia 一般为 **`11155111`**）。

### 2.2 `GenerateQrOptions`（仅三项）

| 字段 | 必填 | 说明 |
|------|------|------|
| `address` | 是 | 收款地址；格式决定 EVM / BTC |
| `amount` | 否 | EVM：ETH 小数；BTC：BTC 小数 |
| `chainId` | 否 | 仅 EVM：EIP-681 `@<chainId>`；Sepolia 一般为 **`11155111`** |

始终生成 **`ethereum:` / `bitcoin:`** 收款 URI（不经由 `format`）。`qrcode` 出图参数在代码内固定（纠错 M、margin、scale），不在选项里暴露。

### 2.3 收款示例：二维码里编码的字符串长什么样

以下由 `buildQrPayload` 生成；扫码得到的即是整段 URI。

#### 0.1 ETH（主网）

- 逻辑：`amount: "0.1"` 时由 **`eth-url-parser`** 的 `build` 写入 **`value`**，并按库规范为 ERC-681 科学计数法（`0.1` ETH 通常输出 **`1e17`**）。

示例（地址请换成真实收款地址）：

```text
ethereum:0x你的地址?value=1e17
```

Sepolia（EIP-681）：`ethereum:0x你的地址@11155111?value=1e17`（与主网仅差 `@11155111`，需传 **`chainId`**）。

#### 0.1 BTC（BIP-321）

- 逻辑：由 **`bip-321`** 的 **`encodeBIP321`** 拼装；地址始终在 **`bitcoin:`** 后的 **hierarchical part**；金额以 **`amount`** 查询参数给出（库内为 **number**，输出为十进制字符串）。**不按主网/测试网切换 URI 形态**（`tb1...` 等与 `bc1...` 同样写成 `bitcoin:tb1...?amount=...`）。

示例：

```text
bitcoin:你的地址?amount=0.1
```

#### 对照表

| 资产 | URI 参数名 | 参数含义 | `0.1` 时的取值 |
|------|------------|----------|----------------|
| ETH / Sepolia | `value` | ERC-681 number（`eth-url-parser` 会规范科学计数法） | 如 `1e17`（对应 0.1 ETH） |
| BTC | `amount` | BIP-321：`amount` 参数（十进制） | `0.1` |

不同钱包对 `ethereum:` / `bitcoin:` 及金额参数的支持程度不一，上线前应用目标钱包实扫验证。

## 3. CLI（`generate.ts`）

在项目根目录：

```bash
# 输出 DataURL 到 stdout（无第二个参数）
bun utils/qrcode/generate.ts 0xYourEthAddress

# 写入 PNG
bun utils/qrcode/generate.ts 0xYourEthAddress ./qr.png

# 带金额（ETH 会进 URI 的 value）
bun utils/qrcode/generate.ts 0xYourEthAddress ./qr.png --amount 0.01

# Sepolia：指定 EIP-681 chainId（0x 地址默认识别为主网，需显式加）
bun utils/qrcode/generate.ts 0xYourEthAddress ./sepolia.png --chainId 11155111 --amount 0.1

# 终端二维码
bun utils/qrcode/generate.ts --terminal bc1YourBtcAddress --small --amount 0.001
```

## 4. 依赖

- `eth-url-parser` + `@types/eth-url-parser`：`generate.ts` 拼装 `ethereum:` URI（ERC-681）。  
- `bip-321`：`generate.ts` 拼装 BIP-321 `bitcoin:` URI（`encodeBIP321` / `validateBitcoinAddress`）。  
- `qrcode`：`generate.ts` 出图。  
- `qr-code-styling`：前端样式二维码（`QRCodeStyling`），见 `styled-preview-client.ts`。

## 5. 注意点（给接入方）

1. **URI 与钱包兼容性**：不同钱包对 `ethereum:` / `bitcoin:` 参数支持程度不一，上线前用目标钱包实扫验证。  
2. **Sepolia / chainId**：`0x` 地址仅表示「EVM」；要 Sepolia 须传 **`chainId: "11155111"`** 或 **`--chainId 11155111`**，生成 **`ethereum:0x...@11155111`**（EIP-681），不使用 `sepolia:` scheme。  
3. **样式与内容分离**：`QRCodeStyling` 只影响外观；**必须**保证传入的 `data` 与下文 URI 规则一致，否则钱包解析会错。

---

*URI 拼装以 `generate.ts` 为准；样式参数以 `styled-preview-client.ts` 为准。*
