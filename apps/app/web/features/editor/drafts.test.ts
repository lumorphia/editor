import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE } from "@prismtone/shared/recipe";
import { addToPendingExports, PENDING_EXPORT_LIMIT, type PendingExport } from "./drafts.ts";

const pending = (draftId: string, createdAt = 1): PendingExport => ({
  draftId,
  blob: new Blob([draftId], { type: "image/webp" }),
  recipe: DEFAULT_RECIPE,
  createdAt,
});

describe("addToPendingExports", () => {
  it("appends new drafts while preserving order", () => {
    expect(addToPendingExports([pending("a")], pending("b")).map((item) => item.draftId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("replaces another export of the same draft in place", () => {
    const result = addToPendingExports([pending("a"), pending("b")], pending("a", 2));
    expect(result.map((item) => item.draftId)).toEqual(["a", "b"]);
    expect(result[0]?.createdAt).toBe(2);
  });

  it("rejects more than five different drafts", () => {
    const full = Array.from({ length: PENDING_EXPORT_LIMIT }, (_, index) => pending(String(index)));
    expect(() => addToPendingExports(full, pending("overflow"))).toThrow("5 枚まで");
  });
});
