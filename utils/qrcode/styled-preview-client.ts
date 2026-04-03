import QRCodeStyling from "qr-code-styling";

/** fetch 失败时的兜底（避免整图空白） */
const FALLBACK_LOGO_DATA_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0b0b"/></svg>',
  );

async function loadLogoAsDataUrl(): Promise<string> {
  try {
    const res = await fetch("/logo.svg", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
  } catch {
    return FALLBACK_LOGO_DATA_URL;
  }
}

function defaultData(): string {
  const q = new URLSearchParams(location.search).get("data");
  if (q) return q;
  return "ethereum:0x0000000000000000000000000000000000000000";
}

function buildQr(data: string, imageDataUrl: string): QRCodeStyling {
  return new QRCodeStyling({
    width: 320,
    height: 320,
    type: "svg",
    data,
    margin: 10,
    qrOptions: { errorCorrectionLevel: "Q" },
    image: imageDataUrl,
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.32,
      margin: 6,
    },
    dotsOptions: { type: "rounded", color: "#0b0b0b" },
    cornersSquareOptions: { type: "dot", color: "#0b0b0b" },
    cornersDotOptions: { type: "dot", color: "#0b0b0b" },
    backgroundOptions: { color: "#ffffff" },
  });
}

async function main() {
  const qrBox = document.getElementById("qr");
  const payloadField = document.getElementById("payload");
  const downloadBtn = document.getElementById("download");
  const regenBtn = document.getElementById("regen");

  if (!qrBox || !(payloadField instanceof HTMLInputElement)) {
    throw new Error("styled-preview: missing #qr or #payload");
  }

  const input = payloadField;

  const logo = await loadLogoAsDataUrl();
  const qr = buildQr(defaultData(), logo);
  input.value = defaultData();
  qr.append(qrBox);

  downloadBtn?.addEventListener("click", () => {
    void qr.download({ name: "qr-styled", extension: "png" });
  });

  function redraw() {
    const data = input.value.trim() || defaultData();
    qr.update({ data });
  }

  regenBtn?.addEventListener("click", redraw);
  input.addEventListener("change", redraw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") redraw();
  });
}

void main();
