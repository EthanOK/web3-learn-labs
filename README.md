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

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
