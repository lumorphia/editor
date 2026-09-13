import type { GeometryV1 } from "@prismtone/shared/recipe";

export type Crop = NonNullable<GeometryV1["crop"]>;
export type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN = 0.05;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * crop 枠のドラッグ計算 (正規化座標、純粋関数)。
 * ratio は「キャンバス座標系での w/h 比」= (目的の比率) / (キャンバスの比率)。
 */
export function dragCrop(
  start: Crop,
  handle: Handle,
  dx: number,
  dy: number,
  ratio?: number,
): Crop {
  if (handle === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    };
  }

  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.w;
  let y1 = start.y + start.h;

  if (handle.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN);
  if (handle.includes("e")) x1 = clamp(x1 + dx, x0 + MIN, 1);
  if (handle.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN);
  if (handle.includes("s")) y1 = clamp(y1 + dy, y0 + MIN, 1);

  if (ratio) {
    // 幅を優先し、高さを比率から決める。固定辺 (アンカー) は動かした辺の反対側
    let w = x1 - x0;
    let h = w / ratio;
    const horizontalOnly = handle === "e" || handle === "w";
    const verticalOnly = handle === "n" || handle === "s";
    if (verticalOnly) {
      h = y1 - y0;
      w = h * ratio;
    }
    // はみ出すなら縮める
    const anchorX = handle.includes("w") ? x1 : x0;
    const anchorY = handle.includes("n") ? y1 : y0;
    const maxW = handle.includes("w") ? anchorX : 1 - anchorX;
    const maxH = handle.includes("n") ? anchorY : 1 - anchorY;
    if (w > maxW) {
      w = maxW;
      h = w / ratio;
    }
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    if (horizontalOnly || !verticalOnly) {
      x0 = handle.includes("w") ? anchorX - w : anchorX;
      y0 = handle.includes("n") ? anchorY - h : anchorY;
    } else {
      y0 = handle.includes("n") ? anchorY - h : anchorY;
      x0 = handle.includes("w") ? anchorX - w : anchorX;
    }
    x1 = x0 + w;
    y1 = y0 + h;
  }

  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
