import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// 依存の向き (AGENTS.md) を eslint.config.js が本当に止めるか。ファイルは作らず、パスだけ与えて検査する
const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

async function restricted(filePath: string, code: string): Promise<boolean> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).some((m) => m.ruleId === "no-restricted-imports");
}

describe("eslint boundaries", () => {
  it("keeps the recipe free of Node APIs", async () => {
    expect(await restricted("packages/editor-recipe/src/x.ts", 'import "node:fs";')).toBe(true);
  });

  it("keeps the recipe free of the engine", async () => {
    expect(
      await restricted("packages/editor-recipe/src/x.ts", 'import "@lumorphia/editor-engine";'),
    ).toBe(true);
  });

  it("keeps the engine free of React", async () => {
    expect(await restricted("packages/editor-engine/src/x.ts", 'import "react";')).toBe(true);
  });

  it("lets the engine CLI use Node APIs", async () => {
    expect(await restricted("packages/editor-engine/bin/x.ts", 'import "node:fs";')).toBe(false);
  });

  it("keeps the UI free of react-router", async () => {
    expect(await restricted("packages/editor-react/src/x.tsx", 'import "react-router";')).toBe(
      true,
    );
  });

  it("lets the UI use React and the engine", async () => {
    const code = 'import "react";\nimport "@lumorphia/editor-engine";';
    expect(await restricted("packages/editor-react/src/x.tsx", code)).toBe(false);
  });

  it("keeps every package free of the hosts", async () => {
    expect(await restricted("packages/editor-react/src/x.tsx", 'import "@prismtone/shared";')).toBe(
      true,
    );
  });

  it("makes packages use each other through exports only", async () => {
    const code = 'import "@lumorphia/editor-engine/src/state.ts";';
    expect(await restricted("packages/editor-react/src/x.tsx", code)).toBe(true);
  });
});
