import { defineConfig } from "vitest/config";
import { readEditorSource } from "../../vitest.source.ts";
export default defineConfig({
  ...readEditorSource,
  test: {
    name: "editor-engine",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "bin/**/*.test.ts"],
  },
});
