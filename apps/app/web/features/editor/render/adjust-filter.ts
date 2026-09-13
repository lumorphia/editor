import { Filter, GlProgram } from "pixi.js";
import type { AdjustV1 } from "@prismtone/shared/recipe";
import { normalizeAdjust } from "../adjust-math.ts";

// adjust-math.ts の CPU 実装と同じ式。片方を変えたら必ずもう片方も変える。

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const fragment = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;
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

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  // premultiplied alpha を戻す
  vec3 rgb = src.a > 0.0 ? src.rgb / src.a : src.rgb;

  // --- linear ---
  rgb = srgbToLinear(rgb);
  rgb *= exp2(uExposure);
  rgb.r *= 1.0 + 0.25 * uTemperature;
  rgb.b *= 1.0 - 0.25 * uTemperature;
  rgb.g *= 1.0 - 0.25 * uTint;

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float wh = smoothstep(0.3, 1.0, luma);
  float ws = 1.0 - smoothstep(0.0, 0.5, luma);
  rgb *= (1.0 + uHighlights * 0.5 * wh) * (1.0 + uShadows * 0.5 * ws);

  // --- sRGB ---
  rgb = linearToSrgb(clamp(rgb, 0.0, 1.0));

  float cf = 1.0 + uContrast * 0.8;
  rgb = (rgb - 0.5) * cf + 0.5;

  float y = dot(rgb, vec3(0.299, 0.587, 0.114));
  float sat = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
  float vf = 1.0 + uVibrance * (1.0 - clamp(sat, 0.0, 1.0));
  rgb = mix(vec3(y), rgb, vf);
  rgb = mix(vec3(y), rgb, 1.0 + uSaturation);

  rgb = clamp(rgb, 0.0, 1.0);
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
      glProgram: GlProgram.from({ vertex, fragment, name: "prismtone-adjust" }),
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
