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
        // ブラウザ専用 (React、PixiJS、GLSL、Worker、IndexedDB)。Playwright の E2E で検証する
        "packages/*/src/**/*.tsx",
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
