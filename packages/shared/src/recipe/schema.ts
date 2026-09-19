import { z } from "zod";

// 編集レシピ。定義は docs/design/04-edit-recipe.md を正とする。
// 変更は追加のみ。既存項目の意味・値域は変えない (ADR-0009)。
// v1: 全体の補正と幾何。v2: 部分補正 (マスク付きの補正、#109) を追加。

const pct = z.number().min(-100).max(100);

/** 部分補正の上限。レシピの肥大化と描画負荷を抑える (#109) */
export const MAX_LOCAL_ADJUSTMENTS = 8;
export const MAX_BRUSH_STROKES = 64;
export const MAX_BRUSH_POINTS = 512;
export const MAX_LOCAL_SMOOTH = 60;

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

// ---- v2: 部分補正 (#109) ----
// マスクの座標は幾何 (回転・反転・トリミング) を掛ける前の画像の正規化座標 (0..1)。
// 幾何は合成後に掛かるので、回転・トリミングしてもマスクの位置はずれない。

const unit = z.number().min(0).max(1);

/** 部分補正で使える項目。全体の補正から vibrance を外し、シャープと美肌 (平滑化) を足す */
export const localAdjustSchemaV2 = z.object({
  exposure: z.number().min(-5).max(5),
  contrast: pct,
  highlights: pct,
  shadows: pct,
  temperature: pct,
  tint: pct,
  saturation: pct,
  /** アンシャープマスク (3x3)。0..100 */
  sharpen: z.number().min(0).max(100),
  /** 輪郭を残す平滑化 (美肌)。過度なぼかしを避けるため上限 60 */
  smooth: z.number().min(0).max(MAX_LOCAL_SMOOTH),
});

export const ellipseMaskSchemaV2 = z.object({
  kind: z.literal("ellipse"),
  cx: unit,
  cy: unit,
  /** 半径。rx は画像の幅、ry は高さに対する比 */
  rx: z.number().gt(0).max(1),
  ry: z.number().gt(0).max(1),
  /** 度 */
  rotation: z.number().min(-180).max(180),
  /** 半径に対するぼかし幅の比 */
  feather: unit,
  invert: z.boolean(),
});

export const brushStrokeSchemaV2 = z.object({
  mode: z.enum(["add", "erase"]),
  /** ブラシ径。画像の長辺に対する比 */
  size: z.number().min(0.005).max(0.5),
  hardness: unit,
  points: z
    .array(z.object({ x: unit, y: unit }))
    .min(1)
    .max(MAX_BRUSH_POINTS),
});

export const brushMaskSchemaV2 = z.object({
  kind: z.literal("brush"),
  strokes: z.array(brushStrokeSchemaV2).max(MAX_BRUSH_STROKES),
  feather: unit,
  invert: z.boolean(),
});

export const maskSchemaV2 = z.discriminatedUnion("kind", [ellipseMaskSchemaV2, brushMaskSchemaV2]);

export const LOCAL_PRESET_IDS = ["eyes", "skin", "gear"] as const;

export const localAdjustmentSchemaV2 = z.object({
  id: z.string().min(1).max(32),
  name: z.string().max(32).nullable(),
  /** 表示用。結果は adjust と amount で決まる (v1 の presetId と同じ原則) */
  presetId: z.enum(LOCAL_PRESET_IDS).nullable(),
  mask: maskSchemaV2,
  adjust: localAdjustSchemaV2,
  /** 効果量 0..100 */
  amount: z.number().min(0).max(100),
  visible: z.boolean(),
});

export const editRecipeSchemaV2 = editRecipeSchemaV1.extend({
  version: z.literal(2),
  localAdjustments: z.array(localAdjustmentSchemaV2).max(MAX_LOCAL_ADJUSTMENTS),
});

export type LocalAdjustV2 = z.infer<typeof localAdjustSchemaV2>;
export type EllipseMaskV2 = z.infer<typeof ellipseMaskSchemaV2>;
export type BrushStrokeV2 = z.infer<typeof brushStrokeSchemaV2>;
export type BrushMaskV2 = z.infer<typeof brushMaskSchemaV2>;
export type MaskV2 = z.infer<typeof maskSchemaV2>;
export type LocalPresetId = (typeof LOCAL_PRESET_IDS)[number];
export type LocalAdjustmentV2 = z.infer<typeof localAdjustmentSchemaV2>;
export type EditRecipeV2 = z.infer<typeof editRecipeSchemaV2>;

/** 現行のレシピ型。version を上げたらここを差し替える。 */
export type EditRecipe = EditRecipeV2;
export const editRecipeSchema = editRecipeSchemaV2;
export const CURRENT_RECIPE_VERSION = 2 as const;
export const localAdjustmentSchema = localAdjustmentSchemaV2;

/**
 * API の入出力で受けるレシピ。旧版の投稿はそのまま返り、投稿時も旧版のクライアントを受ける。
 * 読む側は migrateRecipe で現行に揃える。
 */
export const editRecipeInputSchema = z.union([editRecipeSchemaV1, editRecipeSchemaV2]);
export type EditRecipeInput = z.infer<typeof editRecipeInputSchema>;

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

export const DEFAULT_LOCAL_ADJUST: LocalAdjustV2 = Object.freeze({
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  sharpen: 0,
  smooth: 0,
});

/** 画像の中央、短辺の 1/8 程度の円 */
export const DEFAULT_ELLIPSE_MASK: EllipseMaskV2 = Object.freeze({
  kind: "ellipse",
  cx: 0.5,
  cy: 0.5,
  rx: 0.12,
  ry: 0.12,
  rotation: 0,
  feather: 0.5,
  invert: false,
});

export const DEFAULT_BRUSH_MASK: BrushMaskV2 = Object.freeze({
  kind: "brush",
  strokes: [],
  feather: 0,
  invert: false,
});

/** id と mask を除いた部分補正の既定値。呼ぶ側が id と mask を与える */
export const DEFAULT_LOCAL_ADJUSTMENT: Omit<LocalAdjustmentV2, "id" | "mask"> = Object.freeze({
  name: null,
  presetId: null,
  adjust: DEFAULT_LOCAL_ADJUST,
  amount: 100,
  visible: true,
});

export const DEFAULT_RECIPE: EditRecipe = Object.freeze({
  version: 2,
  presetId: null,
  adjust: DEFAULT_ADJUST,
  geometry: DEFAULT_GEOMETRY,
  localAdjustments: [],
});
