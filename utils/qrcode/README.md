# 链上抵押 / 收款地址二维码（URI 编码说明）

**定位**：说明 **抵押 / 收款地址给用户扫的二维码** 里，应编码成怎样的 **`ethereum:` / `bitcoin:` URI**（含可选金额）。**典型用途**：抵押、充值等场景的地址展示，用户用手机钱包扫码后自动带出地址与金额，减少手抄错误。

**URI 字符串**的拼装规则见下文；把该字符串交给二维码库即可出图。

- **前端展示（推荐）**：需要更好的视觉效果（圆角点阵、中心 Logo、纠错等级、导出 PNG 等）时，建议使用 **[qr-code-styling](https://github.com/kozakdenys/qr-code-styling)** 的 **`QRCodeStyling`**。扫码内容仍是同一套 `ethereum:` / `bitcoin:` 文本，与库无关。本仓库可参考 `styled-preview-client.ts`（配置样式与 `data`）与 `styled_serve.ts`（本地预览页）。
- **脚本 / 联调**：`generate.ts` 基于 `qrcode` 包实现相同 URI 规则，并可输出 **DataURL、PNG、终端字符**。

## 1. 目录结构

| 文件 | 说明 |
|------|------|
| `generate.ts` | 地址识别、URI 拼装、生成 DataURL / PNG / 终端字符；含 CLI。 |
| `styled-preview-client.ts` | 前端参考：`QRCodeStyling` 圆角样式、中心 `logo.svg`、下载 PNG。 |
| `styled_serve.ts` | 本地预览：`bun run qr:styled`（见 `package.json`）。 |
| `styled-preview.html` | 预览页 HTML。 |
| `logo.svg` | 样式二维码中心图。 |

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

`generate.ts` 生成 PNG 等时可选：`errorCorrectionLevel`（`L`/`M`/`Q`/`H`）、`margin`、`scale`。

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
- `qr-code-styling`：前端样式二维码（`QRCodeStyling`），见 `styled-preview-client.ts`。

## 5. 注意点（给接入方）

1. **URI 与钱包兼容性**：不同钱包对 `ethereum:` / `bitcoin:` 参数支持程度不一，上线前用目标钱包实扫验证。  
2. **Sepolia**：地址形态与主网相同，自动识别会落在 `Ethereum`；测试网需 **`chain: "Sepolia"`**（或等价枚举键）才能生成 `sepolia:` scheme。  
3. **样式与内容分离**：`QRCodeStyling` 只影响外观；**必须**保证传入的 `data` 与下文 URI 规则一致，否则钱包解析会错。

---

*URI 拼装以 `generate.ts` 为准；样式参数以 `styled-preview-client.ts` 为准。*
