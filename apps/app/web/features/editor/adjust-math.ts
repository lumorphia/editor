import type { AdjustV1, EditRecipe, LocalAdjustV2 } from "@prismtone/shared/recipe";
import type { Point } from "./mask-math.ts";
import { maskValue } from "./brush-raster.ts";
import type { Size } from "./render/geometry.ts";

/**
 * 補正パイプラインの CPU 参照実装。
 * GLSL (render/adjust-filter.ts) はこの関数と同じ式を実装する。
 * 単体テストと、Playwright での GPU 出力との照合に使う (docs/design/04 §4)。
 */

export type RGB = readonly [number, number, number];

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** レシピの値域 (-100..100 / EV) をシェーダ用の正規化値に変換する。 */
export function normalizeAdjust(a: AdjustV1) {
  return {
    exposure: a.exposure,
    contrast: a.contrast / 100,
    highlights: a.highlights / 100,
    shadows: a.shadows / 100,
    temperature: a.temperature / 100,
    tint: a.tint / 100,
    vibrance: a.vibrance / 100,
    saturation: a.saturation / 100,
  };
}

export type NormalizedAdjust = ReturnType<typeof normalizeAdjust>;

export function applyAdjust(input: RGB, adjust: AdjustV1): RGB {
  const u = normalizeAdjust(adjust);

  // --- linear 空間 ---
  let r = srgbToLinear(input[0]);
  let g = srgbToLinear(input[1]);
  let b = srgbToLinear(input[2]);

  const gain = Math.pow(2, u.exposure);
  r *= gain;
  g *= gain;
  b *= gain;

  r *= 1 + 0.25 * u.temperature;
  b *= 1 - 0.25 * u.temperature;
  g *= 1 - 0.25 * u.tint;

  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const wh = smoothstep(0.3, 1.0, luma);
  const ws = 1 - smoothstep(0.0, 0.5, luma);
  const hs = (1 + u.highlights * 0.5 * wh) * (1 + u.shadows * 0.5 * ws);
  r *= hs;
  g *= hs;
  b *= hs;

  // --- sRGB 空間 ---
  r = linearToSrgb(clamp01(r));
  g = linearToSrgb(clamp01(g));
  b = linearToSrgb(clamp01(b));

  const cf = 1 + u.contrast * 0.8;
  r = (r - 0.5) * cf + 0.5;
  g = (g - 0.5) * cf + 0.5;
  b = (b - 0.5) * cf + 0.5;

  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const vf = 1 + u.vibrance * (1 - clamp01(sat));
  r = mix(y, r, vf);
  g = mix(y, g, vf);
  b = mix(y, b, vf);

  const sf = 1 + u.saturation;
  r = mix(y, r, sf);
  g = mix(y, g, sf);
  b = mix(y, b, sf);

  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * 部分補正の色調整。全体の補正と同じ式で vibrance だけ無い (#109)。
 * sharpen / smooth は近傍を見る処理なので、この点ごとの参照実装には含めない
 * (E2E の判定点はマスク内の平坦部とマスク外に限る、docs/design/08 §7)
 */
export function applyLocalAdjust(input: RGB, adjust: LocalAdjustV2): RGB {
  const { sharpen: _sharpen, smooth: _smooth, ...rest } = adjust;
  return applyAdjust(input, { ...rest, vibrance: 0 });
}

/**
 * レシピ全体を 1 画素に適用する参照実装: 全体の補正 → 部分補正を順に。
 * uv は幾何を掛ける前の画像の正規化座標
 */
export function applyRecipeAt(input: RGB, uv: Point, recipe: EditRecipe, size: Size): RGB {
  let rgb = applyAdjust(input, recipe.adjust);
  for (const local of recipe.localAdjustments) {
    if (!local.visible) continue;
    const mask = maskValue(uv, local.mask, size);
    const m = mask * (local.amount / 100);
    if (m <= 0) continue;
    const adjusted = applyLocalAdjust(rgb, local.adjust);
    rgb = [mix(rgb[0], adjusted[0], m), mix(rgb[1], adjusted[1], m), mix(rgb[2], adjusted[2], m)];
  }
  return rgb;
}
