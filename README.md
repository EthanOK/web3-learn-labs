# web3-learn-labs

To install dependencies:

```bash
bun install
```

## SDK 用法

```ts
import { Web3LearnLabsClient } from "web3-learn-labs";

const client = new Web3LearnLabsClient({
  appName: "demo",
});

client.welcome("Ethan");
```

## 本地运行（开发）

```bash
bun test
```

## 工具：地址二维码（ETH/BTC）

位置：`utils/qrcode/generate.ts`

- **生成 PNG 文件**：

```bash
bun utils/qrcode/generate.ts <地址> out.png
open out.png
```

- **终端直接输出二维码（字符画）**：

```bash
bun utils/qrcode/generate.ts --terminal <地址> --small
```

- **带金额参数**（会编码进 URI）：
  - BTC：`bitcoin:<address>?amount=0.001`
  - ETH：`ethereum:<address>?value=<wei>`（`--amount` 默认按 ETH 输入并自动转 wei）

```bash
bun utils/qrcode/generate.ts <地址> out.png --amount 0.01
bun utils/qrcode/generate.ts --terminal <地址> --small --amount 0.01
```

- **BTC Testnet**：支持 `tb1...`（bech32）地址自动识别。

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
