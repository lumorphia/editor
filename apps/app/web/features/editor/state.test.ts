import { describe, expect, it } from "vitest";
import { DEFAULT_ELLIPSE_MASK, DEFAULT_RECIPE } from "@prismtone/shared/recipe";
import { editorReducer, initialEditorState, type EditorState } from "./state.ts";

const loaded: EditorState = editorReducer(initialEditorState, {
  type: "image/loaded",
  draftId: "d1",
  image: {
    bitmap: {} as ImageBitmap,
    blob: new Blob(),
    name: "a.png",
    format: "png",
    original: { width: 1, height: 1 },
  },
});

describe("editorReducer", () => {
  it("drag preview does not add history, commit adds exactly one entry with the pre-drag base", () => {
    let s = loaded;
    s = editorReducer(s, { type: "adjust/preview", key: "exposure", value: 0.5 });
    s = editorReducer(s, { type: "adjust/preview", key: "exposure", value: 1 });
    s = editorReducer(s, { type: "adjust/preview", key: "exposure", value: 1.5 });
    expect(s.history.past).toHaveLength(0);
    expect(s.history.present.adjust.exposure).toBe(1.5);
    s = editorReducer(s, { type: "adjust/commit", key: "exposure", value: 1.5 });
    expect(s.history.past).toHaveLength(1);
    expect(s.history.past[0]).toBe(DEFAULT_RECIPE);
    expect(s.dragBase).toBeNull();
    s = editorReducer(s, { type: "history/undo" });
    expect(s.history.present.adjust.exposure).toBe(0);
  });

  it("applying a preset records presetId and is undoable", () => {
    let s = editorReducer(loaded, { type: "preset/apply", id: "mono" });
    expect(s.history.present.presetId).toBe("mono");
    expect(s.history.present.adjust.saturation).toBe(-100);
    s = editorReducer(s, { type: "history/undo" });
    expect(s.history.present).toBe(DEFAULT_RECIPE);
  });

  it("manual adjust after a preset clears presetId", () => {
    let s = editorReducer(loaded, { type: "preset/apply", id: "mono" });
    s = editorReducer(s, { type: "adjust/commit", key: "contrast", value: 10 });
    expect(s.history.present.presetId).toBeNull();
    expect(s.history.present.adjust.saturation).toBe(-100);
  });

  it("reset returns to defaults as one undoable step", () => {
    let s = editorReducer(loaded, { type: "preset/apply", id: "vivid" });
    s = editorReducer(s, { type: "geometry/commit", patch: { rotation: 90 } });
    s = editorReducer(s, { type: "recipe/reset" });
    expect(s.history.present).toBe(DEFAULT_RECIPE);
    s = editorReducer(s, { type: "history/undo" });
    expect(s.history.present.geometry.rotation).toBe(90);
  });

  it("ignores unknown preset ids", () => {
    const s = editorReducer(loaded, { type: "preset/apply", id: "nope" });
    expect(s).toBe(loaded);
  });

  it("loading a new image resets history and clears errors", () => {
    let s = editorReducer(loaded, { type: "ui/error", error: "x" });
    s = editorReducer(s, { type: "preset/apply", id: "film" });
    s = editorReducer(s, { type: "image/loaded", draftId: "d2", image: loaded.source! });
    expect(s.history.past).toHaveLength(0);
    expect(s.ui.error).toBeNull();
    expect(s.draftId).toBe("d2");
  });
});

describe("compare slider", () => {
  it("境界は 0..1 に収め、切り抜きを始めると比較を切る", () => {
    let s = editorReducer(initialEditorState, { type: "ui/compare", on: true });
    s = editorReducer(s, { type: "ui/compare-position", position: 1.7 });
    expect(s.ui.comparePosition).toBe(1);
    s = editorReducer(s, { type: "ui/compare-position", position: -0.2 });
    expect(s.ui.comparePosition).toBe(0);
    s = editorReducer(s, { type: "ui/cropping", on: true });
    expect(s.ui.comparing).toBe(false);
  });
});

describe("editorReducer: 部分補正 (#109)", () => {
  const withOne = editorReducer(loaded, { type: "local/add", kind: "ellipse" });
  const id = withOne.history.present.localAdjustments[0]!.id;

  it("adds an ellipse adjustment as one history step and selects it", () => {
    expect(withOne.history.past).toHaveLength(1);
    expect(withOne.history.pastLabels[0]).toBe("部分補正を追加");
    expect(withOne.history.present.localAdjustments).toHaveLength(1);
    expect(withOne.history.present.localAdjustments[0]!.mask.kind).toBe("ellipse");
    expect(withOne.ui.local.selectedId).toBe(id);
    expect(withOne.ui.tool).toBe("local");
  });

  it("adds with a preset applied when asked", () => {
    const s = editorReducer(loaded, { type: "local/add", kind: "ellipse", presetId: "eyes" });
    const local = s.history.present.localAdjustments[0]!;
    expect(local.presetId).toBe("eyes");
    expect(local.adjust.sharpen).toBe(30);
    expect(s.history.pastLabels[0]).toBe("部分補正を追加: 瞳強調");
  });

  it("refuses a 9th adjustment", () => {
    let s = loaded;
    for (let i = 0; i < 9; i++) s = editorReducer(s, { type: "local/add", kind: "ellipse" });
    expect(s.history.present.localAdjustments).toHaveLength(8);
    expect(s.history.past).toHaveLength(8);
  });

  it("gives each adjustment a distinct id", () => {
    let s = withOne;
    s = editorReducer(s, { type: "local/add", kind: "ellipse" });
    const ids = s.history.present.localAdjustments.map((l) => l.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("drag preview of a local slider adds no history, commit adds one with the pre-drag base", () => {
    let s = withOne;
    s = editorReducer(s, { type: "local/adjust-preview", id, key: "exposure", value: 0.5 });
    s = editorReducer(s, { type: "local/adjust-preview", id, key: "exposure", value: 1 });
    expect(s.history.past).toHaveLength(1);
    expect(s.history.present.localAdjustments[0]!.adjust.exposure).toBe(1);
    s = editorReducer(s, { type: "local/adjust-commit", id, key: "exposure", value: 1 });
    expect(s.history.past).toHaveLength(2);
    expect(s.history.past[1]).toBe(withOne.history.present);
    expect(s.history.pastLabels[1]).toBe("部分補正: 露光量 +1.00");
  });

  it("clears presetId when a local slider is committed", () => {
    let s = editorReducer(loaded, { type: "local/add", kind: "ellipse", presetId: "eyes" });
    const pid = s.history.present.localAdjustments[0]!.id;
    s = editorReducer(s, { type: "local/adjust-commit", id: pid, key: "exposure", value: 0.1 });
    expect(s.history.present.localAdjustments[0]!.presetId).toBeNull();
  });

  it("amount and mask drags follow the same preview / commit rule", () => {
    let s = withOne;
    s = editorReducer(s, { type: "local/amount-preview", id, value: 40 });
    s = editorReducer(s, { type: "local/amount-commit", id, value: 40 });
    expect(s.history.present.localAdjustments[0]!.amount).toBe(40);
    const mask = { ...DEFAULT_ELLIPSE_MASK, cx: 0.2, cy: 0.3 };
    s = editorReducer(s, { type: "local/mask-preview", id, mask });
    expect(s.history.past).toHaveLength(2);
    s = editorReducer(s, { type: "local/mask-commit", id, mask });
    expect(s.history.past).toHaveLength(3);
    expect(s.history.pastLabels[2]).toBe("マスクを動かす");
    expect(s.history.present.localAdjustments[0]!.mask).toEqual(mask);
  });

  it("applies a local preset to the selected adjustment, keeping its mask", () => {
    const mask = { ...DEFAULT_ELLIPSE_MASK, cx: 0.2 };
    let s = editorReducer(withOne, { type: "local/mask-commit", id, mask });
    s = editorReducer(s, { type: "local/preset", id, presetId: "gear" });
    const local = s.history.present.localAdjustments[0]!;
    expect(local.presetId).toBe("gear");
    expect(local.adjust.shadows).toBe(30);
    expect(local.mask).toEqual(mask);
    expect(s.history.pastLabels.at(-1)).toBe("部分補正: 装備強調");
  });

  it("toggles visibility and removes, moving the selection to a neighbour", () => {
    let s = editorReducer(withOne, { type: "local/add", kind: "ellipse" });
    const second = s.history.present.localAdjustments[1]!.id;
    s = editorReducer(s, { type: "local/toggle-visible", id });
    expect(s.history.present.localAdjustments[0]!.visible).toBe(false);
    expect(s.history.pastLabels.at(-1)).toBe("部分補正を隠す");
    s = editorReducer(s, { type: "local/select", id: second });
    s = editorReducer(s, { type: "local/remove", id: second });
    expect(s.history.present.localAdjustments.map((l) => l.id)).toEqual([id]);
    expect(s.ui.local.selectedId).toBe(id);
    s = editorReducer(s, { type: "local/remove", id });
    expect(s.ui.local.selectedId).toBeNull();
  });

  it("undo of an add drops the selection and reset clears everything", () => {
    let s = editorReducer(withOne, { type: "history/undo" });
    expect(s.history.present.localAdjustments).toHaveLength(0);
    expect(s.ui.local.selectedId).toBeNull();
    s = editorReducer(withOne, { type: "recipe/reset" });
    expect(s.history.present.localAdjustments).toEqual([]);
    expect(s.ui.local.selectedId).toBeNull();
  });

  it("ignores actions for an unknown id", () => {
    const s = editorReducer(withOne, {
      type: "local/adjust-commit",
      id: "nope",
      key: "exposure",
      value: 1,
    });
    expect(s).toBe(withOne);
  });

  it("ui/show-mask turns the mask overlay on and off without touching the recipe", () => {
    const off = editorReducer(withOne, { type: "ui/show-mask", on: false });
    expect(off.ui.local.showMask).toBe(false);
    expect(off.history).toBe(withOne.history);
    expect(editorReducer(off, { type: "ui/show-mask", on: true }).ui.local.showMask).toBe(true);
  });
});
