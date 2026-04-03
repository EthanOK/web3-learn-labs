// 给定 ETH 或 BTC 地址，生成二维码

import * as QRCode from "qrcode";

export enum ChainEnum {
  //mainnet
  Ethereum = "Ethereum",
  Bitcoin = "Bitcoin",
  // Testnet
  Sepolia = "Sepolia",
  BitcoinTestnet = "BitcoinTestnet",
}

export type Chain = keyof typeof ChainEnum;

export type GenerateQrOptions = {
  address: string;
  /**
   * 默认会根据地址格式自动判断（ETH: 0x..., BTC: bc1.../1.../3...）
   * 如果你希望强制某条链，可以显式传入。
   */
  chain?: Chain;
  /**
   * 生成二维码的内容格式。默认使用 `<scheme>:<address>`（ethereum:/bitcoin:）。
   * 传 `address` 则只编码原始地址字符串。
   */
  format?: "uri" | "address";
  /**
   * 交易金额（可选）。
   * - BTC: 直接使用 BTC 数量（例如 "0.001"）
   * - ETH: 默认按 ETH 数量（例如 "0.01"），按 ERC-681 推荐写法编码到 `value`（如 "0.01e18"）
   */
  amount?: string | number;
  /**
   * amount 的单位（仅对 ETH 有意义）
   * - "eth": 默认，把 ETH 数量编码成 `value=<amount>e18`
   * - "wei": 直接把 amount 当成 wei（整数）
   */
  unit?: "eth" | "wei";
  /**
   * 二维码尺寸/冗余参数
   */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  margin?: number;
  scale?: number;
};

const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_BASE58_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BTC_BECH32_RE = /^(bc1)[0-9a-z]{25,90}$/;
// BTC testnet bech32 HRP: "tb"（地址形如 tb1...）
const BTC_TESTNET_BECH32_RE = /^(tb1)[0-9a-z]{25,90}$/;
const BTC_TESTNET_BASE58_RE = /^(2)[a-km-zA-HJ-NP-Z1-9]{25,34}$/;

export function detectChainFromAddress(address: string): Chain {
  const a = address.trim();
  if (ETH_RE.test(a)) return ChainEnum.Ethereum;
  if (BTC_BECH32_RE.test(a) || BTC_BASE58_RE.test(a)) return ChainEnum.Bitcoin;
  if (BTC_TESTNET_BECH32_RE.test(a) || BTC_TESTNET_BASE58_RE.test(a))
    return ChainEnum.BitcoinTestnet;
  throw new Error(`无法识别地址类型: ${address}`);
}

export function buildQrPayload(
  options: Pick<
    GenerateQrOptions,
    "address" | "chain" | "format" | "amount" | "unit"
  >,
): string {
  const address = options.address.trim();
  const chain = options.chain ?? detectChainFromAddress(address);
  const format = options.format ?? "uri";

  if (format === "address") return address;

  const amount = options.amount;

  const normalizeDecimal = (value: string, maxDecimals: number): string => {
    const v = value.trim();
    if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(`amount 格式不合法: ${value}`);
    const [intPartRaw, fracRaw = ""] = v.split(".");
    const intPart = intPartRaw.replace(/^0+/, "") || "0";
    const fracTrimmed = fracRaw.slice(0, maxDecimals).replace(/0+$/, "");
    return fracTrimmed ? `${intPart}.${fracTrimmed}` : intPart;
  };

  const withQuery = (
    base: string,
    params: Record<string, string | undefined>,
  ) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `${base}?${qs}` : base;
  };

  const parseDecimalToBigInt = (value: string, decimals: number): bigint => {
    const v = value.trim();
    if (!/^\d+(\.\d+)?$/.test(v))
      throw new Error(`amount 格式不合法: ${value}`);
    const [intPart, fracPart = ""] = v.split(".");
    const frac = fracPart.padEnd(decimals, "0").slice(0, decimals);
    const combined = `${intPart}${frac}`.replace(/^0+/, "") || "0";
    return BigInt(combined);
  };

  // 常见钱包可识别的 URI scheme
  if (chain === ChainEnum.Ethereum || chain === ChainEnum.Sepolia) {
    const scheme = chain === ChainEnum.Sepolia ? "sepolia" : "ethereum";
    if (amount === undefined) return `${scheme}:${address}`;

    const unit = options.unit ?? "eth";
    if (unit === "wei") {
      const valueWei = BigInt(String(amount).trim());
      return withQuery(`${scheme}:${address}`, { value: valueWei.toString() });
    }

    // ERC-681: value 以 atomic unit(wei) 表示，允许科学计数法；建议用 exponent=18 表达 ETH 名义单位
    // 仅允许整数：通过限制小数位 <= 18，确保 exponent(18) >= 小数位数
    const normalizedEth = normalizeDecimal(String(amount), 18);
    return withQuery(`${scheme}:${address}`, { value: `${normalizedEth}e18` });
  }

  if (chain === ChainEnum.Bitcoin || chain === ChainEnum.BitcoinTestnet) {
    const scheme = "bitcoin";
    if (amount === undefined) return `${scheme}:${address}`;
    return withQuery(`${scheme}:${address}`, { amount: String(amount).trim() });
  }

  return `unknown:${address}`;
}

export async function generateQrDataURL(
  options: GenerateQrOptions,
): Promise<string> {
  const payload = buildQrPayload(options);
  return await QRCode.toDataURL(payload, {
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
    margin: options.margin ?? 2,
    scale: options.scale ?? 8,
  });
}

export async function generateQrPngBuffer(
  options: GenerateQrOptions,
): Promise<Uint8Array> {
  const payload = buildQrPayload(options);
  const buf = await QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
    margin: options.margin ?? 2,
    scale: options.scale ?? 8,
  });
  return new Uint8Array(buf);
}

export async function generateQrPngFile(
  outFile: string,
  options: GenerateQrOptions,
): Promise<void> {
  const png = await generateQrPngBuffer(options);
  await Bun.write(outFile, png);
}

export async function generateQrTerminalString(
  options: GenerateQrOptions & {
    /**
     * `true` 会输出更小的终端二维码（更紧凑）
     */
    small?: boolean;
  },
): Promise<string> {
  const payload = buildQrPayload(options);
  return await QRCode.toString(payload, {
    type: "terminal",
    small: options.small ?? false,
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
    margin: options.margin ?? 2,
    scale: options.scale ?? 8,
  });
}

function printUsage() {
  // 仅用于 CLI：保持最小且清晰
  // eslint-disable-next-line no-console
  console.log(
    "用法:\n  bun utils/qrcode/generate.ts <地址> [out.png] [--amount 0.01]\n  bun utils/qrcode/generate.ts --terminal <地址> [--small] [--amount 0.01]",
  );
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const terminal = args.includes("--terminal");
  const small = args.includes("--small");
  const amountIdx = args.indexOf("--amount");
  const amount =
    amountIdx >= 0 && args[amountIdx + 1] ? args[amountIdx + 1] : undefined;

  const rest = args.filter(
    (x, i) =>
      x !== "--terminal" &&
      x !== "--small" &&
      x !== "--amount" &&
      i !== amountIdx + 1,
  );
  const [address, outFile] = rest;

  if (!address) {
    printUsage();
    process.exitCode = 1;
  } else if (terminal) {
    const s = await generateQrTerminalString({ address, small, amount });
    // eslint-disable-next-line no-console
    console.log(s);
  } else if (outFile) {
    await generateQrPngFile(outFile, { address, amount });
    // eslint-disable-next-line no-console
    console.log(`已写入: ${outFile}`);
  } else {
    const dataUrl = await generateQrDataURL({ address, amount });
    // eslint-disable-next-line no-console
    console.log(dataUrl);
  }
}
