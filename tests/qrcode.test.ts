import { expect, test } from "bun:test";
import {
  ChainEnum,
  buildQrPayload,
  generateQrDataURL,
  generateQrPngBuffer,
  generateQrTerminalString,
} from "../utils/qrcode/generate";

test("generate ETH QR as data url", async () => {
  const dataUrl = await generateQrDataURL({
    chain: ChainEnum.Ethereum,
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
  });
  expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  const dataUrl_sepolia = await generateQrDataURL({
    chain: ChainEnum.Sepolia,
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
  });
  expect(dataUrl_sepolia.startsWith("data:image/png;base64,")).toBe(true);
});

test("generate BTC QR as png buffer", async () => {
  const png = await generateQrPngBuffer({
    chain: ChainEnum.Bitcoin,
    address: "bc1qa8ll7sjkyq7z7pm27gcsfrzd4tvw62mrgcctrd",
  });
  expect(png.byteLength).toBeGreaterThan(100);
});

test("generate QR for terminal", async () => {
  const s = await generateQrTerminalString({
    chain: ChainEnum.Ethereum,
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
    small: true,
    amount: "0.05",
  });
  expect(s.length).toBeGreaterThan(10);
  if (Bun.env.SHOW_QR === "1") console.log(s);
});

test("encode amount in payload", () => {
  const btc = buildQrPayload({
    chain: ChainEnum.Bitcoin,
    address: "bc1qa8ll7sjkyq7z7pm27gcsfrzd4tvw62mrgcctrd",
    amount: "0.001",
  });
  expect(btc).toContain("bitcoin:");
  expect(btc).toContain("amount=0.001");

  const eth = buildQrPayload({
    chain: ChainEnum.Ethereum,
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
    amount: "0.01",
  });
  expect(eth).toContain("ethereum:");
  expect(eth).toContain("value=");
});
