import { defineConfig } from "vitest/config";
import { readEditorSource } from "../../vitest.source.ts";
export default defineConfig({
  ...readEditorSource,
  test: { name: "editor-recipe", include: ["src/**/*.test.ts"] },
});
