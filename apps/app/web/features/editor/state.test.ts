import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE } from "@prismtone/shared/recipe";
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
