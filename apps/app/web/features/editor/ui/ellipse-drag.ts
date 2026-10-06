import type { EllipseMaskV2 } from "@lumorphia/editor-recipe";
import type { Point } from "../mask-math.ts";
import type { Size } from "../render/geometry.ts";

export type EllipseHandle = "move" | "rx" | "ry" | "rotate";

/** 半径の下限 (幅・高さに対する比)。スキーマの gt(0) を満たしつつ、掴めなくならない程度 */
export const MIN_RADIUS = 0.005;
/** 回転ハンドルを楕円の上端からどれだけ離すか (px) */
export const ROTATE_HANDLE_OFFSET_PX = 32;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 中心からの相対位置 (px) を、楕円の軸に合わせて回した座標にする */
function toAxes(mask: EllipseMaskV2, uv: Point, size: Size): Point {
  const px = (uv.x - mask.cx) * size.width;
  const py = (uv.y - mask.cy) * size.height;
  const rad = (-mask.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: c * px - s * py, y: s * px + c * py };
}

/** 楕円の軸上の点 (px、中心相対) を画像の正規化座標にする */
function fromAxes(mask: EllipseMaskV2, p: Point, size: Size): Point {
  const rad = (mask.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: mask.cx + (c * p.x - s * p.y) / size.width,
    y: mask.cy + (s * p.x + c * p.y) / size.height,
  };
}

/**
 * 楕円マスクのドラッグ (純粋関数、#109)。座標は幾何を掛ける前の画像の正規化座標。
 * from / to はドラッグの開始点と現在点。
 */
export function dragEllipse(
  start: EllipseMaskV2,
  handle: EllipseHandle,
  from: Point,
  to: Point,
  size: Size,
): EllipseMaskV2 {
  switch (handle) {
    case "move":
      return {
        ...start,
        cx: clamp(start.cx + (to.x - from.x), 0, 1),
        cy: clamp(start.cy + (to.y - from.y), 0, 1),
      };
    case "rx": {
      const p = toAxes(start, to, size);
      return { ...start, rx: Math.max(MIN_RADIUS, Math.abs(p.x) / size.width) };
    }
    case "ry": {
      const p = toAxes(start, to, size);
      return { ...start, ry: Math.max(MIN_RADIUS, Math.abs(p.y) / size.height) };
    }
    case "rotate": {
      // ハンドルは -ry 方向 (上) にある。その方向が真上になる角度が 0
      const px = (to.x - start.cx) * size.width;
      const py = (to.y - start.cy) * size.height;
      let deg = (Math.atan2(py, px) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      return { ...start, rotation: deg };
    }
  }
}

/** ハンドルの位置 (画像の正規化座標)。rotateOffsetPx は画像 px (画面上で一定にしたければ表示倍率で割って渡す) */
export function ellipseHandles(
  mask: EllipseMaskV2,
  size: Size,
  rotateOffsetPx = ROTATE_HANDLE_OFFSET_PX,
): Record<Exclude<EllipseHandle, "move">, Point> {
  const rxPx = mask.rx * size.width;
  const ryPx = mask.ry * size.height;
  return {
    rx: fromAxes(mask, { x: rxPx, y: 0 }, size),
    ry: fromAxes(mask, { x: 0, y: -ryPx }, size),
    rotate: fromAxes(mask, { x: 0, y: -ryPx - rotateOffsetPx }, size),
  };
}
