import type { Size } from "./geometry.ts";

/**
 * 表示のズームと移動 (純粋な計算、PixiJS に依存しない)。
 * zoom はフィット表示に対する倍率 (1 = ホストに収まる)。pan はフィット時の中央からのずれ (CSS px)。
 * 画像がホストから完全に出ないよう pan を clamp する。
 */
export type Viewport = { zoom: number; pan: { x: number; y: number } };

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;
export const FIT_MARGIN = 0.96;
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, pan: { x: 0, y: 0 } };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** ホストに収まる倍率 (画像 px → CSS px) */
export function fitScale(canvas: Size, host: Size): number {
  return Math.min(host.width / canvas.width, host.height / canvas.height) * FIT_MARGIN;
}

/** 表示の倍率と、ステージの左上位置 (CSS px) */
export function place(
  canvas: Size,
  host: Size,
  vp: Viewport,
): { scale: number; x: number; y: number } {
  const scale = fitScale(canvas, host) * vp.zoom;
  return {
    scale,
    x: (host.width - canvas.width * scale) / 2 + vp.pan.x,
    y: (host.height - canvas.height * scale) / 2 + vp.pan.y,
  };
}

/** 画像の端がホストの中央を越えて外へ出ないよう pan を抑える */
export function clampPan(canvas: Size, host: Size, vp: Viewport): Viewport {
  const scale = fitScale(canvas, host) * vp.zoom;
  const limitX = Math.max(0, (canvas.width * scale - host.width) / 2 + host.width / 2);
  const limitY = Math.max(0, (canvas.height * scale - host.height) / 2 + host.height / 2);
  return {
    zoom: vp.zoom,
    pan: { x: clamp(vp.pan.x, -limitX, limitX), y: clamp(vp.pan.y, -limitY, limitY) },
  };
}

/**
 * anchor (ホスト内の CSS px) の下にある画像の点を動かさずに倍率を変える。
 * anchor を省くとホストの中央
 */
export function zoomAt(
  canvas: Size,
  host: Size,
  vp: Viewport,
  nextZoom: number,
  anchor: { x: number; y: number } = { x: host.width / 2, y: host.height / 2 },
): Viewport {
  // 小さい画像はフィットが等倍より大きい。等倍 (1 / fit) までは縮められるようにする
  const zoom = clamp(nextZoom, Math.min(MIN_ZOOM, 1 / fitScale(canvas, host)), MAX_ZOOM);
  const before = place(canvas, host, vp);
  // anchor の画像座標 (px)
  const ix = (anchor.x - before.x) / before.scale;
  const iy = (anchor.y - before.y) / before.scale;
  const scale = fitScale(canvas, host) * zoom;
  // 同じ画像座標が anchor に来る左上位置 → 中央基準の pan に戻す
  const x = anchor.x - ix * scale;
  const y = anchor.y - iy * scale;
  return clampPan(canvas, host, {
    zoom,
    pan: {
      x: x - (host.width - canvas.width * scale) / 2,
      y: y - (host.height - canvas.height * scale) / 2,
    },
  });
}

export function panBy(canvas: Size, host: Size, vp: Viewport, dx: number, dy: number): Viewport {
  return clampPan(canvas, host, { zoom: vp.zoom, pan: { x: vp.pan.x + dx, y: vp.pan.y + dy } });
}

/** ホイールの 1 ノッチで進む倍率の刻み */
export const ZOOM_STEP = 1.25;
