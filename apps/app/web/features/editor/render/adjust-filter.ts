import { Filter, GlProgram } from "pixi.js";
import type { AdjustV1 } from "@prismtone/shared/recipe";
import { normalizeAdjust } from "../adjust-math.ts";
import { ADJUST_GLSL, FILTER_VERTEX } from "./adjust-glsl.ts";

// adjust-math.ts の CPU 実装と同じ式 (adjust-glsl.ts)。片方を変えたら必ずもう片方も変える。

const fragment = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;
in vec2 vImageUv;
out vec4 finalColor;

uniform sampler2D uTexture;

uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemperature;
uniform float uTint;
uniform float uVibrance;
uniform float uSaturation;

${ADJUST_GLSL}

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  // premultiplied alpha を戻す
  vec3 rgb = src.a > 0.0 ? src.rgb / src.a : src.rgb;
  rgb = adjustColor(rgb, uExposure, uContrast, uHighlights, uShadows, uTemperature, uTint, uVibrance, uSaturation);
  finalColor = vec4(rgb * src.a, src.a);
}
`;

export type AdjustUniforms = {
  uExposure: { value: number; type: "f32" };
  uContrast: { value: number; type: "f32" };
  uHighlights: { value: number; type: "f32" };
  uShadows: { value: number; type: "f32" };
  uTemperature: { value: number; type: "f32" };
  uTint: { value: number; type: "f32" };
  uVibrance: { value: number; type: "f32" };
  uSaturation: { value: number; type: "f32" };
};

export class AdjustFilter extends Filter {
  constructor(adjust: AdjustV1) {
    const n = normalizeAdjust(adjust);
    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment, name: "prismtone-adjust" }),
      resources: {
        adjustUniforms: {
          uExposure: { value: n.exposure, type: "f32" },
          uContrast: { value: n.contrast, type: "f32" },
          uHighlights: { value: n.highlights, type: "f32" },
          uShadows: { value: n.shadows, type: "f32" },
          uTemperature: { value: n.temperature, type: "f32" },
          uTint: { value: n.tint, type: "f32" },
          uVibrance: { value: n.vibrance, type: "f32" },
          uSaturation: { value: n.saturation, type: "f32" },
        } satisfies AdjustUniforms,
      },
      // DevelopStage の前提: 領域 = 画像矩形、中間テクスチャの余白に触れない (docs/design/08 §3.3)
      padding: 0,
      antialias: "off",
      resolution: 1,
    });
  }

  setAdjust(adjust: AdjustV1): void {
    const n = normalizeAdjust(adjust);
    const u = this.resources.adjustUniforms.uniforms as Record<keyof AdjustUniforms, number>;
    u.uExposure = n.exposure;
    u.uContrast = n.contrast;
    u.uHighlights = n.highlights;
    u.uShadows = n.shadows;
    u.uTemperature = n.temperature;
    u.uTint = n.tint;
    u.uVibrance = n.vibrance;
    u.uSaturation = n.saturation;
  }
}
