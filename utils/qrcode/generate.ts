// 给定 ETH 或 BTC 地址，生成二维码

import { encodeBIP321, validateBitcoinAddress } from "bip-321";
import { build as buildEthUrl } from "eth-url-parser";
import type { BuildInput } from "eth-url-parser";
import * as QRCode from "qrcode";

/** `detectChainFromAddress` 的返回值 */
export type DetectedAddressKind = "ethereum" | "bitcoin";

/** 收款二维码：仅地址 + 可选金额 + 可选 EVM chainId；EVM/BTC 由地址格式推断 */
export type GenerateQrOptions = {
  address: string;
  /** 可选。EVM：`amount` 为 ETH 小数；BTC：为 BTC 小数（如 `"0.001"`） */
  amount?: string | number;
  /** 可选。仅 EVM：`ethereum:0x...@<chainId>`；Sepolia 一般为 `11155111` */
  chainId?: string | number;
  /** 可选。仅 BTC（BIP-321）：`label` 查询参数 */
  label?: string;
};

const QR_IMAGE_DEFAULTS = {
  errorCorrectionLevel: "M" as const,
  margin: 2,
  scale: 8,
};

const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_BASE58_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BTC_BECH32_RE = /^(bc1)[0-9a-z]{25,90}$/;
// BTC testnet bech32 HRP: "tb"（地址形如 tb1...）
const BTC_TESTNET_BECH32_RE = /^(tb1)[0-9a-z]{25,90}$/;
const BTC_TESTNET_BASE58_RE = /^(2)[a-km-zA-HJ-NP-Z1-9]{25,34}$/;

export function detectChainFromAddress(address: string): DetectedAddressKind {
  const a = address.trim();
  if (ETH_RE.test(a)) return "ethereum";
  if (
    BTC_BECH32_RE.test(a) ||
    BTC_BASE58_RE.test(a) ||
    BTC_TESTNET_BECH32_RE.test(a) ||
    BTC_TESTNET_BASE58_RE.test(a)
  )
    return "bitcoin";
  throw new Error(`无法识别地址类型: ${address}`);
}

function resolveEip681ChainId(chainId?: string | number): `${number}` | null {
  const raw = chainId === undefined ? "" : String(chainId).trim();
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`chainId 须为十进制正整数: ${chainId}`);
  }
  return raw as `${number}`;
}

export function buildQrPayload(options: GenerateQrOptions): string {
  const address = options.address.trim();
  const chain = detectChainFromAddress(address);

  const amount = options.amount;

  const normalizeDecimal = (value: string, maxDecimals: number): string => {
    const v = value.trim();
    if (!/^\d+(\.\d+)?$/.test(v))
      throw new Error(`amount 格式不合法: ${value}`);
    const [intPartRaw = "", fracRaw = ""] = v.split(".");
    const intPart = intPartRaw.replace(/^0+/, "") || "0";
    const fracTrimmed = fracRaw.slice(0, maxDecimals).replace(/0+$/, "");
    return fracTrimmed ? `${intPart}.${fracTrimmed}` : intPart;
  };

  // EVM：`eth-url-parser`（@types/eth-url-parser）按 ERC-681 拼装 `ethereum:`，并对 `value` 做科学计数法规范化
  if (chain === "ethereum") {
    const input: BuildInput = { target_address: address };
    const cid = resolveEip681ChainId(options.chainId);
    if (cid !== null) input.chain_id = cid;

    if (amount !== undefined) {
      const normalizedEth = normalizeDecimal(String(amount), 18);
      input.parameters = { value: `${normalizedEth}e18` };
    }

    // console.log(input);
    const result = buildEthUrl(input);
    // console.log(result);
    return result;
  }

  if (chain === "bitcoin") {
    const v = validateBitcoinAddress(address);
    if (!v.valid) {
      throw new Error(v.error ?? "Invalid bitcoin address");
    }
    const amountNum =
      amount === undefined
        ? undefined
        : Number.parseFloat(String(amount).trim());
    if (amount !== undefined) {
      if (Number.isNaN(amountNum!) || amountNum! < 0) {
        throw new Error(`BTC amount 不合法: ${amount}`);
      }
    }
    const labelRaw =
      options.label === undefined ? "" : String(options.label).trim();
    const label = labelRaw === "" ? undefined : labelRaw;

    const extra: { amount?: number; label?: string } = {};
    if (amountNum !== undefined) extra.amount = amountNum;
    if (label !== undefined) extra.label = label;

    return encodeBIP321({ address, ...extra }).uri;
  }

  return `${address}`;
}

export async function generateQrDataURL(
  options: GenerateQrOptions,
): Promise<string> {
  const payload = buildQrPayload(options);
  return await QRCode.toDataURL(payload, QR_IMAGE_DEFAULTS);
}

export async function generateQrPngBuffer(
  options: GenerateQrOptions,
): Promise<Uint8Array> {
  const payload = buildQrPayload(options);
  const buf = await QRCode.toBuffer(payload, {
    type: "png",
    ...QR_IMAGE_DEFAULTS,
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
    ...QR_IMAGE_DEFAULTS,
  });
}

function printUsage() {
  // 仅用于 CLI：保持最小且清晰
  // eslint-disable-next-line no-console
  console.log(
    "用法:\n  bun utils/qrcode/generate.ts <地址> [out.png] [--amount 0.01] [--chainId 11155111] [--label 备注]\n  bun utils/qrcode/generate.ts --terminal <地址> [--small] [--amount 0.01] [--chainId 11155111] [--label 备注]\n  （--label 仅对 BTC 地址生效，写入 BIP-321 的 label 参数）",
  );
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const terminal = args.includes("--terminal");
  const small = args.includes("--small");
  const amountIdx = args.indexOf("--amount");
  const amount =
    amountIdx >= 0 && args[amountIdx + 1] ? args[amountIdx + 1] : undefined;
  const chainIdIdx = args.indexOf("--chainId");
  const chainId =
    chainIdIdx >= 0 && args[chainIdIdx + 1] ? args[chainIdIdx + 1] : undefined;
  const labelIdx = args.indexOf("--label");
  const label =
    labelIdx >= 0 && args[labelIdx + 1] ? args[labelIdx + 1] : undefined;

  const rest = args.filter(
    (x, i) =>
      x !== "--terminal" &&
      x !== "--small" &&
      x !== "--amount" &&
      i !== amountIdx + 1 &&
      x !== "--chainId" &&
      i !== chainIdIdx + 1 &&
      x !== "--label" &&
      i !== labelIdx + 1,
  );
  const [address, outFile] = rest;

  if (!address) {
    printUsage();
    process.exitCode = 1;
  } else {
    const qrOpts: GenerateQrOptions = { address, amount, chainId, label };

    if (terminal) {
      const s = await generateQrTerminalString({ ...qrOpts, small });
      // eslint-disable-next-line no-console
      console.log(s);
    } else if (outFile) {
      await generateQrPngFile(outFile, qrOpts);
      // eslint-disable-next-line no-console
      console.log(`已写入: ${outFile}`);
    } else {
      const dataUrl = await generateQrDataURL(qrOpts);
      // eslint-disable-next-line no-console
      console.log(dataUrl);
    }
  }
}
