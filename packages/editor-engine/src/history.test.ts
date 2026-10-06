import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, type EditRecipe } from "@lumorphia/editor-recipe";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  HISTORY_LIMIT,
  preview,
  redo,
  redoLabel,
  undo,
  undoLabel,
} from "./history.ts";

const withExposure = (r: EditRecipe, exposure: number): EditRecipe => ({
  ...r,
  adjust: { ...r.adjust, exposure },
});

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const h = createHistory(DEFAULT_RECIPE);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("preview does not create history entries", () => {
    const h = preview(createHistory(DEFAULT_RECIPE), withExposure(DEFAULT_RECIPE, 1));
    expect(h.present.adjust.exposure).toBe(1);
    expect(canUndo(h)).toBe(false);
  });

  it("commit then undo then redo round-trips", () => {
    const a = DEFAULT_RECIPE;
    const b = withExposure(a, 1);
    const c = withExposure(a, 2);
    let h = commit(commit(createHistory(a), b), c);
    expect(h.present).toBe(c);
    h = undo(h);
    expect(h.present).toBe(b);
    expect(canRedo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(a);
    h = redo(h);
    expect(h.present).toBe(b);
  });

  it("commit after undo discards the redo stack", () => {
    const a = DEFAULT_RECIPE;
    let h = commit(createHistory(a), withExposure(a, 1));
    h = undo(h);
    h = commit(h, withExposure(a, -1));
    expect(canRedo(h)).toBe(false);
    expect(h.present.adjust.exposure).toBe(-1);
  });

  it("commit with the same object is a no-op", () => {
    const h = createHistory(DEFAULT_RECIPE);
    expect(commit(h, DEFAULT_RECIPE)).toBe(h);
  });

  it("caps history length", () => {
    let h = createHistory(DEFAULT_RECIPE);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++)
      h = commit(h, withExposure(DEFAULT_RECIPE, i / 100));
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });

  it("never mutates previous states", () => {
    const h0 = createHistory(DEFAULT_RECIPE);
    const h1 = commit(h0, withExposure(DEFAULT_RECIPE, 1));
    expect(h0.past).toEqual([]);
    expect(h0.present).toBe(DEFAULT_RECIPE);
    expect(h1.past).not.toBe(h0.past);
  });
});

describe("history labels", () => {
  it("commit の操作名が undo / redo で行き来する", () => {
    let h = createHistory(DEFAULT_RECIPE);
    h = commit(h, withExposure(DEFAULT_RECIPE, 1), "露光量 +1.00");
    h = commit(h, withExposure(DEFAULT_RECIPE, 2), "露光量 +2.00");
    expect(undoLabel(h)).toBe("露光量 +2.00");
    expect(redoLabel(h)).toBeNull();
    h = undo(h);
    expect(undoLabel(h)).toBe("露光量 +1.00");
    expect(redoLabel(h)).toBe("露光量 +2.00");
    h = redo(h);
    expect(undoLabel(h)).toBe("露光量 +2.00");
    // 新しい commit で future の名前も消える
    h = undo(h);
    h = commit(h, withExposure(DEFAULT_RECIPE, 3), "露光量 +3.00");
    expect(redoLabel(h)).toBeNull();
    expect(h.pastLabels).toEqual(["露光量 +1.00", "露光量 +3.00"]);
  });
});
