import { Filter, GlProgram, Texture, type TextureSource } from "pixi.js";
import type { LocalAdjustmentV2 } from "@prismtone/shared/recipe";
import { MIN_FEATHER } from "../mask-math.ts";
import type { Size } from "./geometry.ts";
import { ADJUST_GLSL, FILTER_VERTEX } from "./adjust-glsl.ts";

// 部分補正 1 件 = フィルタ 1 パス (#109)。マスク (mask-math.ts / brush-raster.ts) と色補正
// (adjust-math.ts) の CPU 実装と同じ式。片方を変えたら必ずもう片方も変える。
// シャープ (3x3 アンシャープ) と美肌 (5x5 の輪郭を残す平滑化) は近傍を見るので CPU 参照は無く、
// E2E は平坦部 (変わらない) とマスク外だけを照合する (docs/design/08 §7)。
// 近傍の間隔は元画像の px で決める (uSourceSize) ので、プレビュー (縮小) と書き出し (原寸) で
// 同じ広がりになる。

/** 近傍サンプルの間隔 (元画像の px)。5x5 で ±2 タップ = ±4px */
export const KERNEL_STEP_PX = 2;

const fragment = /* glsl */ `
precision highp float;
#define KERNEL_STEP ${KERNEL_STEP_PX.toFixed(1)}

in vec2 vTextureCoord;
in vec2 vImageUv;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uMask;     // ブラシマスク (r)。楕円のときは白 1px
uniform vec4 uInputSize;     // .zw = 1 / 中間テクスチャの px
uniform vec4 uInputClamp;    // 近傍サンプルの範囲 (中間テクスチャの余白に触れない)
uniform vec4 uOutputFrame;   // .zw = 画像の px サイズ (領域 = 画像矩形)
uniform vec2 uSourceSize;    // 元画像の px (近傍の間隔を原寸基準にする)
uniform float uMaskMode;     // 0 = 楕円 (解析的)、1 = ブラシ (テクスチャ)
uniform float uSharpen;      // 0..1
uniform float uSmooth;       // 0..0.6

uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemperature;
uniform float uTint;
uniform float uSaturation;
uniform float uAmount;       // 効果量 0..1
uniform vec2 uCenter;        // 楕円の中心 (正規化)
uniform vec2 uRadii;         // 半径 (幅・高さに対する比)
uniform float uRotation;     // rad
uniform float uFeather;      // 0..1
uniform float uInvert;       // 0 / 1
uniform float uShowMask;     // 1 なら選択範囲を赤で重ねる (UI のマスク表示)

${ADJUST_GLSL}

vec3 tap(vec2 offsetPx) {
  // 元画像の px → 中間テクスチャの座標: 画像 uv 1 = uOutputFrame.zw * uInputSize.zw
  vec2 d = offsetPx / uSourceSize * (uOutputFrame.zw * uInputSize.zw);
  vec4 c = texture(uTexture, clamp(vTextureCoord + d, uInputClamp.xy, uInputClamp.zw));
  return c.a > 0.0 ? c.rgb / c.a : c.rgb;
}

// 3x3 の平均との差を足す
vec3 sharpen(vec3 rgb) {
  vec3 sum = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      sum += tap(vec2(float(x), float(y)) * KERNEL_STEP);
    }
  }
  return rgb + (rgb - sum / 9.0) * uSharpen;
}

// 5x5 の bilateral。輝度が近い画素だけ平均する (輪郭を残す)
vec3 smoothSkin(vec3 rgb) {
  float y0 = dot(rgb, vec3(0.299, 0.587, 0.114));
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec3 c = tap(vec2(float(x), float(y)) * KERNEL_STEP);
      float dy = dot(c, vec3(0.299, 0.587, 0.114)) - y0;
      float ws = exp(-float(x * x + y * y) / 8.0);
      float wr = exp(-(dy * dy) / 0.02);
      float w = ws * wr;
      sum += c * w;
      wsum += w;
    }
  }
  return sum / wsum;
}

float ellipseMask(void) {
  vec2 p = (vImageUv - uCenter) * uOutputFrame.zw;
  float c = cos(-uRotation);
  float s = sin(-uRotation);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / (uRadii * uOutputFrame.zw);
  float d = length(q);
  float v = 1.0 - smoothstep(1.0 - uFeather, 1.0, d);
  return mix(v, 1.0 - v, uInvert);
}

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  float mask = uMaskMode > 0.5 ? mix(texture(uMask, vImageUv).r, 1.0 - texture(uMask, vImageUv).r, uInvert) : ellipseMask();
  float m = mask * uAmount;
  vec3 rgb = src.a > 0.0 ? src.rgb / src.a : src.rgb;
  if (m > 0.0) {
    vec3 adjusted = rgb;
    if (uSmooth > 0.0) adjusted = mix(adjusted, smoothSkin(adjusted), uSmooth);
    if (uSharpen > 0.0) adjusted = sharpen(adjusted);
    adjusted = adjustColor(clamp(adjusted, 0.0, 1.0), uExposure, uContrast, uHighlights, uShadows, uTemperature, uTint, 0.0, uSaturation);
    rgb = mix(rgb, adjusted, m);
  }
  if (uShowMask > 0.5) {
    rgb = mix(rgb, vec3(1.0, 0.15, 0.15), mask * 0.5);
  }
  finalColor = vec4(rgb * src.a, src.a);
}
`;

type F32 = { value: number; type: "f32" };
type Vec2 = { value: Float32Array; type: "vec2<f32>" };

type LocalUniforms = {
  uExposure: F32;
  uContrast: F32;
  uHighlights: F32;
  uShadows: F32;
  uTemperature: F32;
  uTint: F32;
  uSaturation: F32;
  uAmount: F32;
  uSourceSize: Vec2;
  uMaskMode: F32;
  uSharpen: F32;
  uSmooth: F32;
  uCenter: Vec2;
  uRadii: Vec2;
  uRotation: F32;
  uFeather: F32;
  uInvert: F32;
  uShowMask: F32;
};

const f32 = (value: number): F32 => ({ value, type: "f32" });
const vec2 = (x: number, y: number): Vec2 => ({
  value: new Float32Array([x, y]),
  type: "vec2<f32>",
});

export class LocalAdjustFilter extends Filter {
  constructor(local: LocalAdjustmentV2, source: Size) {
    super({
      glProgram: GlProgram.from({
        vertex: FILTER_VERTEX,
        fragment,
        name: "prismtone-local-adjust",
      }),
      resources: {
        localUniforms: {
          uExposure: f32(0),
          uContrast: f32(0),
          uHighlights: f32(0),
          uShadows: f32(0),
          uTemperature: f32(0),
          uTint: f32(0),
          uSaturation: f32(0),
          uAmount: f32(1),
          uSourceSize: vec2(source.width, source.height),
          uMaskMode: f32(0),
          uSharpen: f32(0),
          uSmooth: f32(0),
          uCenter: vec2(0.5, 0.5),
          uRadii: vec2(0.1, 0.1),
          uRotation: f32(0),
          uFeather: f32(0.5),
          uInvert: f32(0),
          uShowMask: f32(0),
        } satisfies LocalUniforms,
        uMask: Texture.WHITE.source,
      },
      padding: 0,
      antialias: "off",
      resolution: 1,
    });
    this.setLocal(local, false);
  }

  /** ブラシマスクのテクスチャ。null で楕円 (解析的) に戻す */
  setMaskTexture(source: TextureSource | null): void {
    this.resources.uMask = source ?? Texture.WHITE.source;
  }

  setLocal(local: LocalAdjustmentV2, showMask: boolean): void {
    const u = this.resources.localUniforms.uniforms as {
      [K in keyof LocalUniforms]: LocalUniforms[K]["value"];
    };
    const a = local.adjust;
    u.uExposure = a.exposure;
    u.uContrast = a.contrast / 100;
    u.uHighlights = a.highlights / 100;
    u.uShadows = a.shadows / 100;
    u.uTemperature = a.temperature / 100;
    u.uTint = a.tint / 100;
    u.uSaturation = a.saturation / 100;
    u.uAmount = local.amount / 100;
    u.uSharpen = a.sharpen / 100;
    u.uSmooth = a.smooth / 100;
    u.uShowMask = showMask ? 1 : 0;
    u.uMaskMode = local.mask.kind === "brush" ? 1 : 0;
    u.uInvert = local.mask.invert ? 1 : 0;
    if (local.mask.kind === "ellipse") {
      const m = local.mask;
      u.uCenter[0] = m.cx;
      u.uCenter[1] = m.cy;
      u.uRadii[0] = m.rx;
      u.uRadii[1] = m.ry;
      u.uRotation = (m.rotation * Math.PI) / 180;
      u.uFeather = Math.max(m.feather, MIN_FEATHER);
    }
  }
}
