import { DEFAULT_ADJUST, type AdjustV1, type EditRecipe } from "./schema.ts";

export type Preset = {
  id: string;
  name: string;
  adjust: Partial<AdjustV1>;
};

// 初期プリセット。数値は実装時 (M1) に実画像で調整する。docs/design/04-edit-recipe.md §2
export const PRESETS: readonly Preset[] = Object.freeze([
  {
    id: "night-city",
    name: "夜景",
    adjust: { exposure: -0.3, shadows: 25, temperature: -20, contrast: 10 },
  },
  {
    id: "warm-sunset",
    name: "夕暮れ",
    adjust: { temperature: 30, highlights: -20, saturation: -10 },
  },
  { id: "cool-morning", name: "朝霧", adjust: { temperature: -25, contrast: -15, shadows: 20 } },
  { id: "pastel", name: "パステル", adjust: { contrast: -20, vibrance: 15, highlights: 15 } },
  { id: "vivid", name: "ビビッド", adjust: { vibrance: 30, contrast: 15 } },
  { id: "film", name: "フィルム", adjust: { shadows: 20, highlights: -15, saturation: -15 } },
  { id: "mono", name: "モノクロ", adjust: { saturation: -100, contrast: 15 } },
  { id: "soft-portrait", name: "ソフト", adjust: { contrast: -10, highlights: -10, vibrance: 10 } },
  { id: "dungeon", name: "ダンジョン", adjust: { exposure: 0.4, shadows: 30, temperature: -15 } },
  {
    id: "gold-hour",
    name: "ゴールド",
    adjust: { temperature: 35, exposure: 0.2, highlights: -15 },
  },
]);

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * プリセットを適用した新しいレシピを返す。元のレシピは変更しない。
 * 適用は adjust への上書きであり、幾何情報には触れない。
 */
export function applyPreset(recipe: EditRecipe, preset: Preset): EditRecipe {
  return {
    ...recipe,
    presetId: preset.id,
    adjust: { ...DEFAULT_ADJUST, ...preset.adjust },
  };
}
