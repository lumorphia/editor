import { describe, expect, it } from "vitest";
import { rewriteWorkerUrls } from "./worker-urls.ts";

describe("rewriteWorkerUrls", () => {
  it("points a module worker at the built .js file", () => {
    const src = 'new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });';
    expect(rewriteWorkerUrls(src)).toEqual({
      code: 'new Worker(new URL("./face.worker.js", import.meta.url), { type: "module" });',
      count: 1,
    });
  });

  it("leaves other URLs alone", () => {
    const src = 'new URL("./face.task", import.meta.url); import("./x.ts");';
    expect(rewriteWorkerUrls(src)).toEqual({ code: src, count: 0 });
  });
});
