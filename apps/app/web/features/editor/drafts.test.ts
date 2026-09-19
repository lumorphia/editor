import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE } from "@prismtone/shared/recipe";
import {
  addToPendingExports,
  DRAFT_LIMIT,
  PENDING_EXPORT_LIMIT,
  selectStaleDrafts,
  upgradeStoredRecipe,
  type Draft,
  type PendingExport,
} from "./drafts.ts";

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

describe("selectStaleDrafts", () => {
  const draft = (id: string, updatedAt: number): Draft => ({
    id,
    name: id,
    blob: new Blob([id]),
    recipe: DEFAULT_RECIPE,
    updatedAt,
  });
  const seven = Array.from({ length: DRAFT_LIMIT + 2 }, (_, i) => draft(String(i), i));

  it("removes the oldest beyond the limit", () => {
    expect(selectStaleDrafts(seven, []).map((d) => d.id)).toEqual(["0", "1"]);
    expect(selectStaleDrafts(seven.slice(0, DRAFT_LIMIT), [])).toEqual([]);
  });

  it("never removes drafts that are still pending exports, even if they are the oldest", () => {
    expect(selectStaleDrafts(seven, ["0", "1"]).map((d) => d.id)).toEqual(["2", "3"]);
    // 保護で候補が足りないときは残る分を消すだけ
    expect(selectStaleDrafts(seven, ["0", "1", "2", "3", "4", "5"]).map((d) => d.id)).toEqual([
      "6",
    ]);
  });
});

describe("upgradeStoredRecipe (#109 レシピの版上げ)", () => {
  it("brings a version 1 recipe saved before local adjustments up to the current version", () => {
    const { version: _v, localAdjustments: _l, ...v1 } = DEFAULT_RECIPE;
    expect(upgradeStoredRecipe({ ...v1, version: 1 })).toEqual(DEFAULT_RECIPE);
  });

  it("returns null for a recipe it cannot read instead of throwing", () => {
    expect(upgradeStoredRecipe({ version: 99 })).toBeNull();
    expect(upgradeStoredRecipe(undefined)).toBeNull();
  });

  it("keeps a current recipe as it is", () => {
    expect(upgradeStoredRecipe(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });
});
