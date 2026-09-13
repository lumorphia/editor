import { z } from "zod";

// 編集レシピ v1。定義は docs/design/04-edit-recipe.md を正とする。
// 変更は追加のみ。既存項目の意味・値域は変えない (ADR-0009)。

const pct = z.number().min(-100).max(100);

export const adjustSchemaV1 = z.object({
  exposure: z.number().min(-5).max(5),
  contrast: pct,
  highlights: pct,
  shadows: pct,
  temperature: pct,
  tint: pct,
  vibrance: pct,
  saturation: pct,
});

export const cropSchemaV1 = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const ASPECT_PRESETS = ["free", "1:1", "4:3", "3:2", "16:9", "9:16", "3:4", "2:3"] as const;

export const geometrySchemaV1 = z.object({
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  straighten: z.number().min(-45).max(45),
  flipH: z.boolean(),
  crop: cropSchemaV1.nullable(),
  aspect: z.enum(ASPECT_PRESETS).nullable(),
});

export const editRecipeSchemaV1 = z.object({
  version: z.literal(1),
  presetId: z.string().max(64).nullable(),
  adjust: adjustSchemaV1,
  geometry: geometrySchemaV1,
});

export type AdjustV1 = z.infer<typeof adjustSchemaV1>;
export type GeometryV1 = z.infer<typeof geometrySchemaV1>;
export type EditRecipeV1 = z.infer<typeof editRecipeSchemaV1>;

/** 現行のレシピ型。version を上げたらここを差し替える。 */
export type EditRecipe = EditRecipeV1;
export const editRecipeSchema = editRecipeSchemaV1;
export const CURRENT_RECIPE_VERSION = 1 as const;

export const DEFAULT_ADJUST: AdjustV1 = Object.freeze({
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
});

export const DEFAULT_GEOMETRY: GeometryV1 = Object.freeze({
  rotation: 0,
  straighten: 0,
  flipH: false,
  crop: null,
  aspect: null,
});

export const DEFAULT_RECIPE: EditRecipe = Object.freeze({
  version: 1,
  presetId: null,
  adjust: DEFAULT_ADJUST,
  geometry: DEFAULT_GEOMETRY,
});
