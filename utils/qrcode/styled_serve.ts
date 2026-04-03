import preview from "./styled-preview.html";

const logoFile = Bun.file(new URL("./logo.svg", import.meta.url));

const port = Number(Bun.env.STYLED_QR_PORT ?? "3456");

Bun.serve({
  port,
  routes: {
    "/": preview,
    "/logo.svg": new Response(logoFile, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    }),
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`二维码生成器预览: http://localhost:${port}/`);
console.log(
  `示例: http://localhost:${port}/?data=${encodeURIComponent("ethereum:0xa7fF5F6751650681e52181dfA24704b82F2f82d6?value=0.1e18")}`,
);
