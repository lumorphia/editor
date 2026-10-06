import type { GeometryV1 } from "@lumorphia/editor-recipe";

/**
 * 幾何変換の純粋な計算部分。PixiJS には依存しない (単体テスト対象)。
 * 座標系: 回転・水平補正・反転を適用した後の「キャンバス」上で crop を 0..1 の正規化座標として持つ。
 */

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** 直角回転と微調整回転を合わせた角度 (度)。 */
export function totalRotationDeg(g: GeometryV1): number {
  return g.rotation + g.straighten;
}

/** 元画像を angle 度回転したときの外接矩形サイズ。 */
export function rotatedBounds(src: Size, angleDeg: number): Size {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    width: Math.round(src.width * c + src.height * s),
    height: Math.round(src.width * s + src.height * c),
  };
}

/** 幾何適用後のキャンバスサイズ (crop 前)。 */
export function canvasSize(src: Size, g: GeometryV1): Size {
  return rotatedBounds(src, totalRotationDeg(g));
}

/** crop を実ピクセルの矩形にする。crop が無ければキャンバス全体。 */
export function cropRect(canvas: Size, g: GeometryV1): Rect {
  if (!g.crop) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const x = Math.round(g.crop.x * canvas.width);
  const y = Math.round(g.crop.y * canvas.height);
  const width = Math.max(1, Math.round(g.crop.w * canvas.width));
  const height = Math.max(1, Math.round(g.crop.h * canvas.height));
  return {
    x,
    y,
    width: Math.min(width, canvas.width - x),
    height: Math.min(height, canvas.height - y),
  };
}

/** アスペクト指定文字列 ("16:9" 等) を比率に変換する。free / null は undefined。 */
export function aspectRatio(aspect: GeometryV1["aspect"]): number | undefined {
  if (!aspect || aspect === "free") return undefined;
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return undefined;
  return w / h;
}

/** 指定比率でキャンバス中央に収まる最大の crop (正規化座標)。 */
export function centeredCrop(canvas: Size, ratio: number): NonNullable<GeometryV1["crop"]> {
  const canvasRatio = canvas.width / canvas.height;
  let w = 1;
  let h = 1;
  if (ratio > canvasRatio) {
    h = canvasRatio / ratio;
  } else {
    w = ratio / canvasRatio;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** 出力サイズを長辺 maxEdge に収めるスケール。 */
export function exportScale(rect: Size, maxEdge: number): number {
  const edge = Math.max(rect.width, rect.height);
  return edge > maxEdge ? maxEdge / edge : 1;
}
