import type { EditRecipe } from "@prismtone/shared/recipe";

/**
 * undo / redo の履歴。レシピは不変オブジェクトとして扱い、常に新しい History を返す
 * (docs/design/04 §3)。
 */
export type History = {
  readonly past: readonly EditRecipe[];
  readonly present: EditRecipe;
  readonly future: readonly EditRecipe[];
};

export const HISTORY_LIMIT = 100;

export function createHistory(present: EditRecipe): History {
  return { past: [], present, future: [] };
}

/** 履歴に積まずに present だけ置き換える (スライダーのドラッグ中)。 */
export function preview(h: History, next: EditRecipe): History {
  return { ...h, present: next };
}

/** present を履歴に積んで next を現在にする (ドラッグ終了、プリセット適用、リセット)。 */
export function commit(h: History, next: EditRecipe): History {
  if (next === h.present) return h;
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [] };
}

export function undo(h: History): History {
  const prev = h.past.at(-1);
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;
