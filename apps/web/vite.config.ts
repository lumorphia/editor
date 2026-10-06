import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // dev でも本番と同じく cross-origin isolated にする (onnxruntime-web のマルチスレッド)
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  // 自動選択が押したときに動的 import する依存。dev の依存最適化が初めて見つけるとページを丸ごとリロードするので、最初から束ねる
  optimizeDeps: {
    include: ["@mediapipe/tasks-vision", "@huggingface/transformers"],
    // Worker を new URL("./x.worker.js", import.meta.url) で起こすので、束ねると相対 URL が壊れる
    exclude: ["@lumorphia/editor-engine"],
  },
  resolve: { dedupe: ["react", "react-dom", "zod"] },
  plugins: [tailwindcss()],
});
