import { expect, test } from "bun:test";
import { parseBIP321 } from "bip-321";
import { parse as parseEthUrl } from "eth-url-parser";
import {
  buildQrPayload,
  generateQrDataURL,
  generateQrPngBuffer,
  generateQrTerminalString,
} from "../utils/qrcode/generate";

test("generate ETH QR as data url", async () => {
  const dataUrl = await generateQrDataURL({
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
  });
  expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  const dataUrl_sepolia = await generateQrDataURL({
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
    chainId: "11155111",
  });
  expect(dataUrl_sepolia.startsWith("data:image/png;base64,")).toBe(true);
});

test("generate BTC QR as png buffer", async () => {
  const png = await generateQrPngBuffer({
    address: "bc1qa8ll7sjkyq7z7pm27gcsfrzd4tvw62mrgcctrd",
  });
  expect(png.byteLength).toBeGreaterThan(100);
});

test("generate QR for terminal", async () => {
  const s = await generateQrTerminalString({
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
    small: true,
    amount: "0.05",
  });
  expect(s.length).toBeGreaterThan(10);
  if (Bun.env.SHOW_QR === "1") console.log(s);
});

test("encode amount in payload", () => {
  const btc = buildQrPayload({
    address: "bc1qa8ll7sjkyq7z7pm27gcsfrzd4tvw62mrgcctrd",
    amount: "0.001",
  });
  expect(btc).toBe(
    "bitcoin:bc1qa8ll7sjkyq7z7pm27gcsfrzd4tvw62mrgcctrd?amount=0.001",
  );
  expect(parseBIP321(btc).valid).toBe(true);

  const btcTestnet = buildQrPayload({
    address: "tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmg",
    amount: "0.01",
  });
  expect(btcTestnet).toBe(
    "bitcoin:tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmg?amount=0.01",
  );
  expect(parseBIP321(btcTestnet).valid).toBe(true);

  const btcLabel = buildQrPayload({
    address: "bc1qa8ll7sjkyq7z7pm27gcsfrzd4tvw62mrgcctrd",
    label: "Coffee Shop",
  });
  expect(btcLabel).toBe(
    "bitcoin:bc1qa8ll7sjkyq7z7pm27gcsfrzd4tvw62mrgcctrd?label=Coffee%20Shop",
  );
  expect(parseBIP321(btcLabel).valid).toBe(true);

  const eth = buildQrPayload({
    address: "0xa7fF5F6751650681e52181dfA24704b82F2f82d6",
    amount: "0.01",
  });
  expect(eth).toContain("ethereum:");
  expect(eth).toContain("value=");
  expect(eth).toContain("value=1e16");
  const parsed = parseEthUrl(eth);
  expect(parsed.target_address).toBe("0xa7fF5F6751650681e52181dfA24704b82F2f82d6");
  expect(parsed.parameters?.value).toBe("10000000000000000");
});

test("EVM chainId adds @chain_id to ethereum URI", () => {
  const uri = buildQrPayload({
    address: "0x6278A1E803A76796a3A1f7F6344fE874ebfe94B2",
    chainId: 11155111,
  });
  expect(uri).toBe(
    "ethereum:0x6278A1E803A76796a3A1f7F6344fE874ebfe94B2@11155111",
  );
  expect(parseEthUrl(uri).chain_id).toBe("11155111");
});
