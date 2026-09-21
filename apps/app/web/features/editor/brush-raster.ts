import {
  MAX_BRUSH_POINTS,
  decodeRle,
  type BitmapMaskV3,
  type BrushMaskV2,
  type BrushStrokeV2,
  type Mask,
  type PolygonMaskV3,
  type StrokedMask,
} from "@prismtone/shared/recipe";
import { ellipseMaskValue, type Point } from "./mask-math.ts";
import type { Size } from "./render/geometry.ts";

/**
 * ブラシマスクのラスタライズ (#109)。DOM に依存しない純関数で、単体テストと GPU 出力の照合に使う。
 * ストロークは幾何を掛ける前の画像の正規化座標。半径は画像の長辺に対する比 (size / 2)。
 * 描画は「点の周りに円のスタンプを、線分に沿って半径の 1/4 間隔で押す」。add は max、erase は min。
 */

export type MaskRaster = { width: number; height: number; data: Uint8ClampedArray };

/** マスクテクスチャの長辺。画像より粗くても、GPU で線形補間されるので境界は滑らか */
export const MASK_RASTER_MAX_EDGE = 1024;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 画像の縦横比を保って長辺を maxEdge に収めた整数の寸法 */
export function rasterSize(source: Size, maxEdge = MASK_RASTER_MAX_EDGE): Size {
  const edge = Math.max(source.width, source.height);
  const s = edge > maxEdge ? maxEdge / edge : 1;
  return {
    width: Math.max(1, Math.round(source.width * s)),
    height: Math.max(1, Math.round(source.height * s)),
  };
}

export function createMaskRaster(source: Size, maxEdge = MASK_RASTER_MAX_EDGE): MaskRaster {
  const { width, height } = rasterSize(source, maxEdge);
  return { width, height, data: new Uint8ClampedArray(width * height) };
}

/**
 * スタンプ 1 つの値 (0..1)。中心から hardness × 半径までは 1、そこから縁でなだらかに 0。
 * feather (0..1) は硬さを下げる方向に効く (輪郭をぼかすため)
 */
function falloff(distance: number, radius: number, hardness: number, feather: number): number {
  if (distance >= radius) return 0;
  const core = clamp01(hardness * (1 - feather));
  if (core >= 1) return 1;
  return 1 - smoothstep(core * radius, radius, distance);
}

/** 線分 ab 上で p に最も近い点までの距離 */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** ストローク 1 本をラスタに描く (その場で書き換える)。プレビューでは 1 本ずつ足す */
export function stampStroke(raster: MaskRaster, stroke: BrushStrokeV2, feather: number): void {
  const { width, height, data } = raster;
  const edge = Math.max(width, height);
  const radius = (stroke.size * edge) / 2;
  const toPx = (p: Point) => ({ x: p.x * width, y: p.y * height });
  const points = stroke.points.map(toPx);
  const paint = (c: Point) => {
    const x0 = Math.max(0, Math.floor(c.x - radius));
    const x1 = Math.min(width - 1, Math.ceil(c.x + radius));
    const y0 = Math.max(0, Math.floor(c.y - radius));
    const y1 = Math.min(height - 1, Math.ceil(c.y + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        const v = Math.round(falloff(d, radius, stroke.hardness, feather) * 255);
        if (v === 0) continue;
        const i = y * width + x;
        data[i] = stroke.mode === "add" ? Math.max(data[i]!, v) : Math.min(data[i]!, 255 - v);
      }
    }
  };
  const spacing = Math.max(0.5, radius / 4);
  let prev = points[0]!;
  paint(prev);
  for (const next of points.slice(1)) {
    const len = Math.hypot(next.x - prev.x, next.y - prev.y);
    const n = Math.ceil(len / spacing);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      paint({ x: prev.x + (next.x - prev.x) * t, y: prev.y + (next.y - prev.y) * t });
    }
    prev = next;
  }
}

function invertRaster(raster: MaskRaster): void {
  for (let i = 0; i < raster.data.length; i++) raster.data[i] = 255 - raster.data[i]!;
}

/** マスク全体をゼロから描く (undo・下書き復元・書き出し) */
export function rasterizeBrushMask(
  mask: BrushMaskV2,
  source: Size,
  maxEdge = MASK_RASTER_MAX_EDGE,
): MaskRaster {
  const raster = createMaskRaster(source, maxEdge);
  for (const stroke of mask.strokes) stampStroke(raster, stroke, mask.feather);
  if (mask.invert) invertRaster(raster);
  return raster;
}

/**
 * 多角形 (v3) の下地を走査線で塗る。輪は外周 + 穴で、偶奇 (交差回数が奇数なら内側) で塗るので
 * 顔の輪郭から目・口を抜ける。点は正規化座標
 */
function fillPolygon(raster: MaskRaster, rings: PolygonMaskV3["rings"]): void {
  const { width, height, data } = raster;
  const edges: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      edges.push({ x0: a.x * width, y0: a.y * height, x1: b.x * width, y1: b.y * height });
    }
  }
  const xs: number[] = [];
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (const e of edges) {
      // 半開区間で数えて、頂点を 2 回数えない
      if (e.y0 <= cy === e.y1 <= cy) continue;
      xs.push(e.x0 + ((cy - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k]!));
      const to = Math.min(width, Math.round(xs[k + 1]!));
      if (to > from) data.fill(255, y * width + from, y * width + to);
    }
  }
}

/** 箱ぼかしを縦横に 2 回 (三角形のカーネル相当)。radius は px */
function blurRaster(raster: MaskRaster, radius: number): void {
  const r = Math.round(radius);
  if (r < 1) return;
  const { width, height } = raster;
  const pass = (src: Uint8ClampedArray, horizontal: boolean): Uint8ClampedArray => {
    const out = new Uint8ClampedArray(src.length);
    const len = horizontal ? width : height;
    const lines = horizontal ? height : width;
    const idx = (line: number, i: number) => (horizontal ? line * width + i : i * width + line);
    for (let line = 0; line < lines; line++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[idx(line, Math.min(len - 1, Math.max(0, i)))]!;
      for (let i = 0; i < len; i++) {
        out[idx(line, i)] = sum / (2 * r + 1);
        sum += src[idx(line, Math.min(len - 1, i + r + 1))]! - src[idx(line, Math.max(0, i - r))]!;
      }
    }
    return out;
  };
  for (let k = 0; k < 2; k++) {
    raster.data = pass(raster.data, true);
    raster.data = pass(raster.data, false);
  }
}

/** feather (0..1) を px に。長辺の 5% まで */
const featherPx = (feather: number, raster: MaskRaster) =>
  feather * 0.05 * Math.max(raster.width, raster.height);

export function rasterizePolygonMask(
  mask: PolygonMaskV3,
  source: Size,
  maxEdge = MASK_RASTER_MAX_EDGE,
): MaskRaster {
  const raster = createMaskRaster(source, maxEdge);
  fillPolygon(raster, mask.rings);
  blurRaster(raster, featherPx(mask.feather, raster));
  for (const stroke of mask.strokes) stampStroke(raster, stroke, mask.feather);
  if (mask.invert) invertRaster(raster);
  return raster;
}

/** ビットマップ (v3) を最近傍でラスタの寸法に広げる */
export function rasterizeBitmapMask(
  mask: BitmapMaskV3,
  source: Size,
  maxEdge = MASK_RASTER_MAX_EDGE,
): MaskRaster {
  const raster = createMaskRaster(source, maxEdge);
  const bits = decodeRle(mask.rle, mask.width * mask.height);
  const { width, height, data } = raster;
  for (let y = 0; y < height; y++) {
    const by = Math.min(mask.height - 1, Math.floor(((y + 0.5) / height) * mask.height));
    for (let x = 0; x < width; x++) {
      const bx = Math.min(mask.width - 1, Math.floor(((x + 0.5) / width) * mask.width));
      data[y * width + x] = bits[by * mask.width + bx] ? 255 : 0;
    }
  }
  blurRaster(raster, featherPx(mask.feather, raster));
  for (const stroke of mask.strokes) stampStroke(raster, stroke, mask.feather);
  if (mask.invert) invertRaster(raster);
  return raster;
}

/** strokes を持つマスク (brush / polygon / bitmap) をゼロから描く */
export function rasterizeMask(
  mask: StrokedMask,
  source: Size,
  maxEdge = MASK_RASTER_MAX_EDGE,
): MaskRaster {
  switch (mask.kind) {
    case "brush":
      return rasterizeBrushMask(mask, source, maxEdge);
    case "polygon":
      return rasterizePolygonMask(mask, source, maxEdge);
    case "bitmap":
      return rasterizeBitmapMask(mask, source, maxEdge);
  }
}

/** 1 点での多角形マスクの値 (0/1、feather と strokes は見ない)。偶奇の参照実装 */
export function polygonMaskValue(uv: Point, mask: PolygonMaskV3): number {
  let inside = false;
  for (const ring of mask.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > uv.y !== b.y > uv.y && uv.x < a.x + ((uv.y - a.y) * (b.x - a.x)) / (b.y - a.y))
        inside = !inside;
    }
  }
  const v = inside ? 1 : 0;
  return mask.invert ? 1 - v : v;
}

/** 1 点でのマスクの値 (参照実装)。種類で振り分ける */
export function maskValue(uv: Point, mask: Mask, source: Size): number {
  switch (mask.kind) {
    case "ellipse":
      return ellipseMaskValue(uv, mask, source);
    case "brush":
      return brushMaskValue(uv, mask, source);
    case "polygon":
      return polygonMaskValue(uv, mask);
    case "bitmap":
      return bitmapMaskValue(uv, mask);
  }
}

/** 1 点でのビットマップマスクの値 (0/1、feather と strokes は見ない) */
export function bitmapMaskValue(uv: Point, mask: BitmapMaskV3): number {
  const bits = decodeRle(mask.rle, mask.width * mask.height);
  const bx = Math.min(mask.width - 1, Math.floor(uv.x * mask.width));
  const by = Math.min(mask.height - 1, Math.floor(uv.y * mask.height));
  const v = bits[by * mask.width + bx] ? 1 : 0;
  return mask.invert ? 1 - v : v;
}

/**
 * 1 点でのブラシマスクの値 (0..1)。ラスタを介さず線分までの距離で評価する参照実装。
 * ストロークを順に適用する (add は max、erase は min) のはラスタと同じ
 */
export function brushMaskValue(uv: Point, mask: BrushMaskV2, source: Size): number {
  const edge = Math.max(source.width, source.height);
  const p = { x: uv.x * source.width, y: uv.y * source.height };
  let value = 0;
  for (const stroke of mask.strokes) {
    const radius = (stroke.size * edge) / 2;
    const pts = stroke.points.map((q) => ({ x: q.x * source.width, y: q.y * source.height }));
    let d = Infinity;
    for (let i = 0; i < pts.length; i++) {
      d = Math.min(d, distanceToSegment(p, pts[i]!, pts[Math.min(i + 1, pts.length - 1)]!));
    }
    const v = falloff(d, radius, stroke.hardness, mask.feather);
    value = stroke.mode === "add" ? Math.max(value, v) : Math.min(value, 1 - v);
  }
  return mask.invert ? 1 - value : value;
}

/**
 * ポインタの点列を間引く: 直前に残した点から minDistance 未満の移動は捨てる。最初と最後は残す。
 * 上限を超えたら等間隔に間引く (レシピの肥大化を抑える、docs/design/04 §1.1)
 */
export function simplifyPoints(
  points: readonly Point[],
  minDistance: number,
  limit = MAX_BRUSH_POINTS,
): Point[] {
  if (points.length === 0) return [];
  const kept: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1]!;
    if (Math.hypot(points[i]!.x - last.x, points[i]!.y - last.y) >= minDistance)
      kept.push(points[i]!);
  }
  if (points.length > 1) kept.push(points[points.length - 1]!);
  if (kept.length <= limit) return kept;
  const step = (kept.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, i) => kept[Math.round(i * step)]!);
}
