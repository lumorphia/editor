import type { AdjustV1, EditRecipe, LocalAdjust } from "@prismtone/shared/recipe";
import type { Point } from "./mask-math.ts";
import { maskValue } from "./brush-raster.ts";
import type { Size } from "./render/geometry.ts";

/**
 * 補正パイプラインの CPU 参照実装。
 * GLSL (render/adjust-filter.ts) はこの関数と同じ式を実装する。
 * 単体テストと、Playwright での GPU 出力との照合に使う (docs/design/04 §4)。
 */

export type RGB = readonly [number, number, number];
export type ImageSampler = (uv: Point) => RGB;

const BLOOM_RADIUS_PX = 8;
const CLARITY_RADIUS_PX = 4;
const BLOOM_THRESHOLD = 0.65;

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
 * sharpen / smooth は既存テストとの互換のため点ごとの参照には含めない。#184 の空間効果は
 * context があるとき 3x3 の近傍を参照し、GLSL と同じ式で計算する。
 */
export function applyLocalAdjust(
  input: RGB,
  adjust: LocalAdjust,
  context?: { uv: Point; sampleOffset: (dx: number, dy: number) => RGB },
): RGB {
  const { sharpen: _sharpen, smooth: _smooth, blur, bloom, vignette, clarity, ...rest } = adjust;
  let spatial: RGB = input;
  const radius = Math.max(
    blur,
    bloom > 0 ? BLOOM_RADIUS_PX : 0,
    clarity !== 0 ? CLARITY_RADIUS_PX : 0,
  );
  let average: RGB = input;
  let glow: RGB = [0, 0, 0];
  if (context && radius > 0) {
    const sum = [0, 0, 0];
    const bright = [0, 0, 0];
    for (const y of [-1, 0, 1]) {
      for (const x of [-1, 0, 1]) {
        const sampled = context.sampleOffset(x * radius, y * radius);
        for (let channel = 0; channel < 3; channel += 1) {
          const value = sampled[channel]!;
          sum[channel] = sum[channel]! + value;
          bright[channel] =
            bright[channel]! + Math.max(0, value - BLOOM_THRESHOLD) / (1 - BLOOM_THRESHOLD);
        }
      }
    }
    average = [sum[0]! / 9, sum[1]! / 9, sum[2]! / 9];
    glow = [bright[0]! / 9, bright[1]! / 9, bright[2]! / 9];
  }
  if (blur > 0 && context) spatial = average;
  if (clarity !== 0 && context) {
    const strength = clarity / 100;
    spatial = spatial.map((value, channel) =>
      clamp01(value + (input[channel]! - average[channel]!) * strength),
    ) as unknown as RGB;
  }
  if (bloom > 0 && context) {
    const strength = (bloom / 100) * 0.5;
    spatial = spatial.map((value, channel) =>
      clamp01(value + glow[channel]! * strength),
    ) as unknown as RGB;
  }
  let adjusted = applyAdjust(spatial, { ...rest, vibrance: 0 });
  if (vignette > 0 && context) {
    const px = (context.uv.x - 0.5) * 2;
    const py = (context.uv.y - 0.5) * 2;
    const distance = (px * px + py * py) / 2;
    const shade = 1 - (vignette / 100) * 0.65 * smoothstep(0.2, 1, distance);
    adjusted = adjusted.map((value) => clamp01(value * shade)) as unknown as RGB;
  }
  return adjusted;
}

/**
 * レシピ全体を 1 画素に適用する参照実装: 全体の補正 → 部分補正を順に。
 * uv は幾何を掛ける前の画像の正規化座標
 */
export function applyRecipeAt(
  input: RGB | ImageSampler,
  uv: Point,
  recipe: EditRecipe,
  size: Size,
): RGB {
  const source: ImageSampler = typeof input === "function" ? input : () => input;
  let stage: ImageSampler = (point) => applyAdjust(source(point), recipe.adjust);
  for (const local of recipe.localAdjustments) {
    if (!local.visible) continue;
    const previous = stage;
    stage = (point) => {
      const rgb = previous(point);
      const mask = maskValue(point, local.mask, size);
      const m = mask * (local.amount / 100);
      if (m <= 0) return rgb;
      const adjusted = applyLocalAdjust(rgb, local.adjust, {
        uv: point,
        sampleOffset: (dx, dy) =>
          previous({
            x: clamp01(point.x + dx / size.width),
            y: clamp01(point.y + dy / size.height),
          }),
      });
      return [
        mix(rgb[0], adjusted[0], m),
        mix(rgb[1], adjusted[1], m),
        mix(rgb[2], adjusted[2], m),
      ];
    };
  }
  return stage(uv);
}
