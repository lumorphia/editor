import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4300);

/**
 * 単独アプリ (apps/web) に対して現像の E2E を回す。build は pnpm e2e が先に済ませる
 * (パッケージを dist にし、モデルを揃えてから vite build)。サーバーは apps/web/server/serve.ts
 */
export default defineConfig({
  testDir: "./e2e",
  // WebGL (SwiftShader) と WASM が CPU を取り合うので並べすぎない。CI のランナーは 2 コア
  workers: Number(process.env.E2E_WORKERS ?? (process.env.CI ? 2 : 4)),
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // 日本語の UI で書いたテストなので日本語で固定する
    locale: "ja-JP",
    trace: "retain-on-failure",
    // headless Chromium で WebGL を使う (SwiftShader)
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `PORT=${PORT} node apps/web/server/serve.ts`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
