import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/*",
      // リポジトリ全体の決まり (ESLint の依存の向きなど)
      { test: { name: "repo", include: ["tooling/**/*.test.ts"] } },
    ],
    coverage: {
      provider: "v8",
      // lcov は Codecov 用。text は CI のログで読む用
      reporter: ["text", "html", "lcov"],
      include: ["packages/*/src/**"],
      exclude: [
        "**/*.test.ts",
        // パッケージの入口 (export を並べるだけ)
        "packages/*/src/index.ts",
        // ブラウザ専用 (React、PixiJS、GLSL、Worker、ポインタ操作)。Playwright の E2E で検証する。
        // GPU の出力は E2E が CPU の参照 (adjust-math.ts) と照合する
        "packages/*/src/**/*.tsx",
        "packages/editor-engine/src/render/editor-renderer.ts",
        "packages/editor-engine/src/render/adjust-filter.ts",
        "packages/editor-engine/src/render/adjust-glsl.ts",
        "packages/editor-engine/src/render/local-adjust-filter.ts",
        "packages/editor-engine/src/render/develop-stage.ts",
        "packages/editor-engine/src/render/mask-texture.ts",
        "packages/editor-engine/src/load-image.ts",
        "packages/editor-engine/src/inference/face.ts",
        "packages/editor-engine/src/inference/face.worker.ts",
        "packages/editor-engine/src/inference/segment.ts",
        "packages/editor-engine/src/inference/segment.worker.ts",
        "packages/editor-react/src/use-canvas-gestures.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
