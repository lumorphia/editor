// AdjustFilter と LocalAdjustFilter で共有する GLSL (#109)。
// 色補正の式は adjust-math.ts の CPU 実装と同じ。片方を変えたら必ずもう片方も変える。

/**
 * フィルタの頂点シェーダ。PixiJS v8 の既定 (defaultFilter.vert) と同じ位置計算に、
 * 画像の正規化座標 vImageUv を足したもの。
 * DevelopStage ではフィルタ領域 (uOutputFrame) が画像矩形そのものなので、aPosition (0..1) が
 * そのまま画像の正規化座標になる。表示用の Sprite に直接フィルタを付けると領域が回転後の
 * 外接矩形とビューポートに依存するので、この前提が崩れる (docs/design/08 §3.3)
 */
export const FILTER_VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vImageUv;

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
  vImageUv = aPosition;
}
`;

/** sRGB <-> linear と、8 項目の色補正 (docs/design/04 §4 の順) */
export const ADJUST_GLSL = /* glsl */ `
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

vec3 adjustColor(
  vec3 rgb,
  float exposure, float contrast, float highlights, float shadows,
  float temperature, float tint, float vibrance, float saturation
) {
  // --- linear ---
  rgb = srgbToLinear(rgb);
  rgb *= exp2(exposure);
  rgb.r *= 1.0 + 0.25 * temperature;
  rgb.b *= 1.0 - 0.25 * temperature;
  rgb.g *= 1.0 - 0.25 * tint;

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float wh = smoothstep(0.3, 1.0, luma);
  float ws = 1.0 - smoothstep(0.0, 0.5, luma);
  rgb *= (1.0 + highlights * 0.5 * wh) * (1.0 + shadows * 0.5 * ws);

  // --- sRGB ---
  rgb = linearToSrgb(clamp(rgb, 0.0, 1.0));

  float cf = 1.0 + contrast * 0.8;
  rgb = (rgb - 0.5) * cf + 0.5;

  float y = dot(rgb, vec3(0.299, 0.587, 0.114));
  float sat = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
  float vf = 1.0 + vibrance * (1.0 - clamp(sat, 0.0, 1.0));
  rgb = mix(vec3(y), rgb, vf);
  rgb = mix(vec3(y), rgb, 1.0 + saturation);

  return clamp(rgb, 0.0, 1.0);
}
`;
