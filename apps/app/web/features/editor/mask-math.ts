import type { EllipseMaskV2, GeometryV1 } from "@prismtone/shared/recipe";
import { canvasSize, totalRotationDeg, type Size } from "./render/geometry.ts";

/**
 * 部分補正のマスクと座標変換の CPU 参照実装 (#109)。
 * GLSL (render/local-adjust-filter.ts) はこの関数と同じ式を実装する。
 * マスクの座標は幾何を掛ける前の画像の正規化座標 (docs/design/04 §1.1)。
 */

export type Point = { x: number; y: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** feather 0 でも smoothstep の edge0 == edge1 (未定義) にならないよう、僅かな幅を残す */
export const MIN_FEATHER = 1e-4;

/**
 * 楕円マスクの値 (0..1)。回転は画素空間で掛ける (画像の縦横比に依存しない角度にするため)。
 * 中心からの距離を半径で割った d に対して、1 - feather までは 1、1 で 0。
 */
export function ellipseMaskValue(uv: Point, mask: EllipseMaskV2, size: Size): number {
  const px = (uv.x - mask.cx) * size.width;
  const py = (uv.y - mask.cy) * size.height;
  const rad = (-mask.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rx = (c * px - s * py) / (mask.rx * size.width);
  const ry = (s * px + c * py) / (mask.ry * size.height);
  const d = Math.hypot(rx, ry);
  const feather = Math.max(mask.feather, MIN_FEATHER);
  const v = 1 - smoothstep(1 - feather, 1, d);
  return mask.invert ? 1 - v : v;
}

/**
 * 画像の正規化座標 → 幾何適用後のキャンバス座標 (px)。
 * PixiJS の Sprite (anchor 0.5、position = キャンバス中央、rotation、scale.x = flipH ? -1 : 1) と同じ順で掛ける。
 */
export function imageUvToCanvas(uv: Point, source: Size, g: GeometryV1): Point {
  const canvas = canvasSize(source, g);
  const rad = (totalRotationDeg(g) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const lx = (uv.x - 0.5) * source.width * (g.flipH ? -1 : 1);
  const ly = (uv.y - 0.5) * source.height;
  return {
    x: canvas.width / 2 + lx * c - ly * s,
    y: canvas.height / 2 + lx * s + ly * c,
  };
}

/** imageUvToCanvas の逆。範囲外 (画像の外) も返す。呼ぶ側で clamp する */
export function canvasToImageUv(p: Point, source: Size, g: GeometryV1): Point {
  const canvas = canvasSize(source, g);
  const rad = (-totalRotationDeg(g) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const wx = p.x - canvas.width / 2;
  const wy = p.y - canvas.height / 2;
  const lx = (wx * c - wy * s) * (g.flipH ? -1 : 1);
  const ly = wx * s + wy * c;
  return { x: lx / source.width + 0.5, y: ly / source.height + 0.5 };
}
