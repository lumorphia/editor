import { defineConfig } from "vitest/config";
import { readEditorSource } from "../../vitest.source.ts";
export default defineConfig({
  ...readEditorSource,
  test: { name: "web", include: ["server/**/*.test.ts", "src/**/*.test.ts"] },
});
