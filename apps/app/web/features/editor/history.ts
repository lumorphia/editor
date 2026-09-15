import type { EditRecipe } from "@prismtone/shared/recipe";

/**
 * undo / redo の履歴。レシピは不変オブジェクトとして扱い、常に新しい History を返す
 * (docs/design/04 §3)。
 */
export type History = {
  readonly past: readonly EditRecipe[];
  readonly present: EditRecipe;
  readonly future: readonly EditRecipe[];
  /** past[i] から次の状態へ進めた操作の名前 (past と同じ長さ)。取り消しの説明に使う */
  readonly pastLabels: readonly string[];
  /** future[i] へ進める操作の名前 (future と同じ長さ)。やり直しの説明に使う */
  readonly futureLabels: readonly string[];
};

export const HISTORY_LIMIT = 100;

export function createHistory(present: EditRecipe): History {
  return { past: [], present, future: [], pastLabels: [], futureLabels: [] };
}

/** 履歴に積まずに present だけ置き換える (スライダーのドラッグ中)。 */
export function preview(h: History, next: EditRecipe): History {
  return { ...h, present: next };
}

/** present を履歴に積んで next を現在にする (ドラッグ終了、プリセット適用、リセット)。 */
export function commit(h: History, next: EditRecipe, label = "変更"): History {
  if (next === h.present) return h;
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  const pastLabels = [...h.pastLabels, label].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], pastLabels, futureLabels: [] };
}

export function undo(h: History): History {
  const prev = h.past.at(-1);
  if (!prev) return h;
  const label = h.pastLabels.at(-1) ?? "変更";
  return {
    past: h.past.slice(0, -1),
    present: prev,
    future: [h.present, ...h.future],
    pastLabels: h.pastLabels.slice(0, -1),
    futureLabels: [label, ...h.futureLabels],
  };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (!next) return h;
  const [label = "変更", ...restLabels] = h.futureLabels;
  return {
    past: [...h.past, h.present],
    present: next,
    future: rest,
    pastLabels: [...h.pastLabels, label],
    futureLabels: restLabels,
  };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;
/** 「戻る」で取り消される操作の名前 */
export const undoLabel = (h: History) => h.pastLabels.at(-1) ?? null;
/** 「進む」でやり直される操作の名前 */
export const redoLabel = (h: History) => h.futureLabels[0] ?? null;
