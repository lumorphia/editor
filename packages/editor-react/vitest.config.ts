import { defineConfig } from "vitest/config";
import { readEditorSource } from "../../vitest.source.ts";
export default defineConfig({
  ...readEditorSource,
  test: { name: "editor-react", include: ["src/**/*.test.ts"] },
});
