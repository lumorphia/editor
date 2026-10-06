import { z } from "zod";
import { isValidRle } from "./rle.ts";

// zod 4 は JIT の可否を Function("") で探る。CSP (script-src に unsafe-eval が無い) の下では握られて動作は
// 落ちないが、ブラウザから違反が報告され続ける (RM-30)。このスキーマはブラウザでも動くので JIT を使わない。
// 同じ zod のインスタンスを使う server 側の検証も jitless になるが、この規模では差が出ない
z.config({ jitless: true });

// 編集レシピ。定義は docs/design/04-edit-recipe.md を正とする。
// 変更は追加のみ。既存項目の意味・値域は変えない (ADR-0009)。
// v1: 全体の補正と幾何。v2: 部分補正 (マスク付きの補正、#109) を追加。
// v3: 自動選択 (#176 / #177) のための多角形・ビットマップのマスクと、人物補正 (#175) の groupId を追加。

const pct = z.number().min(-100).max(100);

/** v2 の部分補正の上限 (レシピの肥大化と描画負荷を抑える、#109)。v3 は MAX_LOCAL_ADJUSTMENTS */
export const MAX_LOCAL_ADJUSTMENTS_V2 = 8;
export const MAX_BRUSH_STROKES = 64;
export const MAX_BRUSH_POINTS = 512;
export const MAX_LOCAL_SMOOTH = 60;
/** 背景ぼかしの半径 (元画像 px)。固定 3x3 カーネルの間隔として使う */
export const MAX_LOCAL_BLUR = 32;

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
  localAdjustments: z.array(localAdjustmentSchemaV2).max(MAX_LOCAL_ADJUSTMENTS_V2),
});

export type LocalAdjustV2 = z.infer<typeof localAdjustSchemaV2>;
export type EllipseMaskV2 = z.infer<typeof ellipseMaskSchemaV2>;
export type BrushStrokeV2 = z.infer<typeof brushStrokeSchemaV2>;
export type BrushMaskV2 = z.infer<typeof brushMaskSchemaV2>;
export type MaskV2 = z.infer<typeof maskSchemaV2>;
export type LocalPresetId = (typeof LOCAL_PRESET_IDS)[number];
export type LocalAdjustmentV2 = z.infer<typeof localAdjustmentSchemaV2>;
export type EditRecipeV2 = z.infer<typeof editRecipeSchemaV2>;

// ---- v3: 自動選択のマスクと人物補正のまとまり (#175 / #176 / #177) ----
// 顔の輪郭 (多角形) と SAM の切り抜き (ビットマップ) をブラシ点列に崩さず持つ。どちらも strokes を持ち、
// 自動で置いたマスクの上にブラシで足す / 消す (brush と同じ道具で直せる)。
// 座標系は v2 と同じ (幾何を掛ける前の画像の正規化座標)。

/** 部分補正の上限。人物補正 (#175) が 1 人で 5 件 (顔・瞳 ×2・人物・背景) 使う */
export const MAX_LOCAL_ADJUSTMENTS = 12;
/** 多角形の輪 (外周 1 + 穴) の上限と、1 輪の点数の上限 */
export const MAX_POLYGON_RINGS = 8;
export const MAX_POLYGON_POINTS = 256;
/** ビットマップマスクの 1 辺の上限 (px)。GPU では線形補間で拡大するので境界は滑らか */
export const BITMAP_MAX_EDGE = 256;

const ring = z
  .array(z.object({ x: unit, y: unit }))
  .min(3)
  .max(MAX_POLYGON_POINTS);

export const polygonMaskSchemaV3 = z.object({
  kind: z.literal("polygon"),
  /** 先頭が外周、以降は穴 (偶奇で塗る)。顔なら外周 = 顔の輪郭、穴 = 目・口 */
  rings: z.array(ring).min(1).max(MAX_POLYGON_RINGS),
  strokes: z.array(brushStrokeSchemaV2).max(MAX_BRUSH_STROKES),
  feather: unit,
  invert: z.boolean(),
});

export const bitmapMaskSchemaV3 = z
  .object({
    kind: z.literal("bitmap"),
    width: z.number().int().min(1).max(BITMAP_MAX_EDGE),
    height: z.number().int().min(1).max(BITMAP_MAX_EDGE),
    /** width × height の 0/1 を rle.ts で圧縮したもの (行優先) */
    rle: z.string().max(64 * 1024),
    strokes: z.array(brushStrokeSchemaV2).max(MAX_BRUSH_STROKES),
    feather: unit,
    invert: z.boolean(),
  })
  .refine((m) => isValidRle(m.rle, m.width * m.height), { message: "rle does not match size" });

export const maskSchemaV3 = z.discriminatedUnion("kind", [
  ellipseMaskSchemaV2,
  brushMaskSchemaV2,
  polygonMaskSchemaV3,
  bitmapMaskSchemaV3,
]);

export const localAdjustmentSchemaV3 = localAdjustmentSchemaV2.extend({
  mask: maskSchemaV3,
  /** 人物補正 (#175) など、まとめて扱う部分補正の組。無ければ null */
  groupId: z.string().min(1).max(32).nullable(),
});

export const editRecipeSchemaV3 = editRecipeSchemaV1.extend({
  version: z.literal(3),
  localAdjustments: z.array(localAdjustmentSchemaV3).max(MAX_LOCAL_ADJUSTMENTS),
});

export type PolygonMaskV3 = z.infer<typeof polygonMaskSchemaV3>;
export type BitmapMaskV3 = z.infer<typeof bitmapMaskSchemaV3>;
export type MaskV3 = z.infer<typeof maskSchemaV3>;
export type LocalAdjustmentV3 = z.infer<typeof localAdjustmentSchemaV3>;
export type EditRecipeV3 = z.infer<typeof editRecipeSchemaV3>;
/** strokes を持つマスク (ブラシで直せるもの) */
export type StrokedMask = Exclude<MaskV3, EllipseMaskV2>;

// ---- v4: 人物補正の追加効果 (#184) ----
// v3 までの部分補正の意味を変えず、空間効果を中立値 0 で追加する。

export const localAdjustSchemaV4 = localAdjustSchemaV2.extend({
  /** 背景ぼかしの半径 (元画像 px)。0..32 */
  blur: z.number().min(0).max(MAX_LOCAL_BLUR),
  /** 高輝度成分をぼかして加算する発光。0..100 */
  bloom: z.number().min(0).max(100),
  /** 画像中心から周辺を減光する強さ。0..100 */
  vignette: z.number().min(0).max(100),
  /** 近傍平均との差による局所コントラスト。-100..100 */
  clarity: pct,
});

export const localAdjustmentSchemaV4 = localAdjustmentSchemaV3.extend({
  adjust: localAdjustSchemaV4,
});

export const editRecipeSchemaV4 = editRecipeSchemaV1.extend({
  version: z.literal(4),
  localAdjustments: z.array(localAdjustmentSchemaV4).max(MAX_LOCAL_ADJUSTMENTS),
});

export type LocalAdjustV4 = z.infer<typeof localAdjustSchemaV4>;
export type LocalAdjustmentV4 = z.infer<typeof localAdjustmentSchemaV4>;
export type EditRecipeV4 = z.infer<typeof editRecipeSchemaV4>;

/** 現行のレシピ型。version を上げたらここを差し替える。 */
export type EditRecipe = EditRecipeV4;
export type LocalAdjust = LocalAdjustV4;
export type LocalAdjustment = LocalAdjustmentV4;
export type Mask = MaskV3;
export const editRecipeSchema = editRecipeSchemaV4;
export const CURRENT_RECIPE_VERSION = 4 as const;
export const localAdjustmentSchema = localAdjustmentSchemaV4;

/**
 * API の入出力で受けるレシピ。旧版の投稿はそのまま返り、投稿時も旧版のクライアントを受ける。
 * 読む側は migrateRecipe で現行に揃える。
 */
export const editRecipeInputSchema = z.union([
  editRecipeSchemaV1,
  editRecipeSchemaV2,
  editRecipeSchemaV3,
  editRecipeSchemaV4,
]);
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

export const DEFAULT_LOCAL_ADJUST_V2: LocalAdjustV2 = Object.freeze({
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

export const DEFAULT_LOCAL_ADJUST: LocalAdjustV4 = Object.freeze({
  ...DEFAULT_LOCAL_ADJUST_V2,
  blur: 0,
  bloom: 0,
  vignette: 0,
  clarity: 0,
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
export const DEFAULT_LOCAL_ADJUSTMENT: Omit<LocalAdjustment, "id" | "mask"> = Object.freeze({
  name: null,
  presetId: null,
  groupId: null,
  adjust: DEFAULT_LOCAL_ADJUST,
  amount: 100,
  visible: true,
});

export const DEFAULT_RECIPE: EditRecipe = Object.freeze({
  version: 4,
  presetId: null,
  adjust: DEFAULT_ADJUST,
  geometry: DEFAULT_GEOMETRY,
  localAdjustments: [],
});
