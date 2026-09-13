import {
  DEFAULT_RECIPE,
  applyPreset,
  findPreset,
  type AdjustV1,
  type EditRecipe,
  type GeometryV1,
} from "@prismtone/shared/recipe";
import { commit, createHistory, preview, redo, undo, type History } from "./history.ts";
import type { LoadedImage } from "./load-image.ts";

export type Tool = "adjust" | "geometry" | "presets";

export type EditorState = {
  readonly source: LoadedImage | null;
  readonly draftId: string | null;
  readonly history: History;
  /** スライダーのドラッグ開始時点のレシピ。commit 時にこれを履歴に積む。 */
  readonly dragBase: EditRecipe | null;
  readonly ui: {
    readonly tool: Tool;
    readonly comparing: boolean;
    readonly cropping: boolean;
    readonly exporting: boolean;
    readonly error: string | null;
  };
};

export type EditorAction =
  | { type: "image/loaded"; image: LoadedImage; draftId: string; recipe?: EditRecipe }
  | { type: "image/failed"; error: string }
  | { type: "adjust/preview"; key: keyof AdjustV1; value: number }
  | { type: "adjust/commit"; key: keyof AdjustV1; value: number }
  | { type: "geometry/commit"; patch: Partial<GeometryV1> }
  | { type: "geometry/preview"; patch: Partial<GeometryV1> }
  | { type: "preset/apply"; id: string }
  | { type: "recipe/reset" }
  | { type: "history/undo" }
  | { type: "history/redo" }
  | { type: "ui/tool"; tool: Tool }
  | { type: "ui/compare"; on: boolean }
  | { type: "ui/cropping"; on: boolean }
  | { type: "ui/exporting"; on: boolean }
  | { type: "ui/error"; error: string | null };

export const initialEditorState: EditorState = {
  source: null,
  draftId: null,
  history: createHistory(DEFAULT_RECIPE),
  dragBase: null,
  ui: { tool: "presets", comparing: false, cropping: false, exporting: false, error: null },
};

const withAdjust = (r: EditRecipe, key: keyof AdjustV1, value: number): EditRecipe => ({
  ...r,
  presetId: null,
  adjust: { ...r.adjust, [key]: value },
});

const withGeometry = (r: EditRecipe, patch: Partial<GeometryV1>): EditRecipe => ({
  ...r,
  geometry: { ...r.geometry, ...patch },
});

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { history } = state;
  switch (action.type) {
    case "image/loaded":
      return {
        ...state,
        source: action.image,
        draftId: action.draftId,
        history: createHistory(action.recipe ?? DEFAULT_RECIPE),
        dragBase: null,
        ui: { ...state.ui, error: null, cropping: false },
      };
    case "image/failed":
      return { ...state, ui: { ...state.ui, error: action.error } };
    case "adjust/preview":
      return {
        ...state,
        dragBase: state.dragBase ?? history.present,
        history: preview(history, withAdjust(history.present, action.key, action.value)),
      };
    case "adjust/commit": {
      // ドラッグ中の preview は履歴に積まない。ドラッグ開始時点 (dragBase) を積む
      const base = state.dragBase ?? history.present;
      const next = withAdjust(base, action.key, action.value);
      return { ...state, dragBase: null, history: commit({ ...history, present: base }, next) };
    }
    case "geometry/preview":
      return {
        ...state,
        dragBase: state.dragBase ?? history.present,
        history: preview(history, withGeometry(history.present, action.patch)),
      };
    case "geometry/commit": {
      const base = state.dragBase ?? history.present;
      const next = withGeometry(base, action.patch);
      return { ...state, dragBase: null, history: commit({ ...history, present: base }, next) };
    }
    case "preset/apply": {
      const preset = findPreset(action.id);
      if (!preset) return state;
      return { ...state, history: commit(history, applyPreset(history.present, preset)) };
    }
    case "recipe/reset":
      return { ...state, history: commit(history, DEFAULT_RECIPE) };
    case "history/undo":
      return { ...state, history: undo(history) };
    case "history/redo":
      return { ...state, history: redo(history) };
    case "ui/tool":
      return { ...state, ui: { ...state.ui, tool: action.tool } };
    case "ui/compare":
      return { ...state, ui: { ...state.ui, comparing: action.on } };
    case "ui/cropping":
      return { ...state, ui: { ...state.ui, cropping: action.on } };
    case "ui/exporting":
      return { ...state, ui: { ...state.ui, exporting: action.on } };
    case "ui/error":
      return { ...state, ui: { ...state.ui, error: action.error } };
  }
}
