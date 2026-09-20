import { Filter, GlProgram } from "pixi.js";
import type { LocalAdjustmentV2 } from "@prismtone/shared/recipe";
import { MIN_FEATHER } from "../mask-math.ts";
import { ADJUST_GLSL, FILTER_VERTEX } from "./adjust-glsl.ts";

// 部分補正 1 件 = フィルタ 1 パス (#109)。マスク (mask-math.ts) と色補正 (adjust-math.ts) の
// CPU 実装と同じ式。片方を変えたら必ずもう片方も変える。
// ブラシマスク (uMask テクスチャ)、シャープ、美肌は PR3 で足す。

const fragment = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;
in vec2 vImageUv;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uOutputFrame;   // .zw = 画像の px サイズ (領域 = 画像矩形)

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
  float mask = ellipseMask();
  float m = mask * uAmount;
  vec3 rgb = src.a > 0.0 ? src.rgb / src.a : src.rgb;
  if (m > 0.0) {
    vec3 adjusted = adjustColor(rgb, uExposure, uContrast, uHighlights, uShadows, uTemperature, uTint, 0.0, uSaturation);
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
  constructor(local: LocalAdjustmentV2) {
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
          uCenter: vec2(0.5, 0.5),
          uRadii: vec2(0.1, 0.1),
          uRotation: f32(0),
          uFeather: f32(0.5),
          uInvert: f32(0),
          uShowMask: f32(0),
        } satisfies LocalUniforms,
      },
      padding: 0,
      antialias: "off",
      resolution: 1,
    });
    this.setLocal(local, false);
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
    u.uShowMask = showMask ? 1 : 0;
    if (local.mask.kind === "ellipse") {
      const m = local.mask;
      u.uCenter[0] = m.cx;
      u.uCenter[1] = m.cy;
      u.uRadii[0] = m.rx;
      u.uRadii[1] = m.ry;
      u.uRotation = (m.rotation * Math.PI) / 180;
      u.uFeather = Math.max(m.feather, MIN_FEATHER);
      u.uInvert = m.invert ? 1 : 0;
    } else {
      // ブラシは PR3。それまでは何も掛けない
      u.uAmount = 0;
    }
  }
}
