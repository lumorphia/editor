import { BITMAP_MAX_EDGE, encodeRle, type BitmapMaskV3 } from "@lumorphia/editor-recipe";

/**
 * SAM の切り抜き (segment.worker.ts) をレシピの bitmap マスクにする純関数 (#177、ADR-0025)。
 * 原寸の 0/1 を長辺 256 に縮め (セルの半分以上が 1 なら 1)、RLE で持つ。
 */

/** SAM が返す 3 段の粒度。spike で順番が安定していた: 0 = キャラクター全体、1 = その装備 1 点、2 = その一部 */
export const SAM_LEVELS = [
  { index: 0, label: "全体", hint: "キャラクター全体 (髪・顔・装備)" },
  { index: 1, label: "装備", hint: "タップした装備 1 点" },
  { index: 2, label: "部品", hint: "装備の一部 (袖、襟、胸当てなど)" },
] as const;
export type SamLevel = (typeof SAM_LEVELS)[number]["index"];
/** 装備強調の既定。IoU で選ぶと全体に寄るので使わない */
export const GEAR_LEVEL: SamLevel = 1;
export const PERSON_LEVEL: SamLevel = 0;

/** bitmap マスクのぼかし。境界の階段を消す程度 */
const BITMAP_FEATHER = 0.1;

export function toBitmapMask(
  mask: Uint8Array,
  width: number,
  height: number,
  options: { invert?: boolean; maxEdge?: number; feather?: number } = {},
): BitmapMaskV3 {
  const maxEdge = options.maxEdge ?? BITMAP_MAX_EDGE;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));
      let on = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) on += mask[yy * width + xx]!;
      bits[y * w + x] = on * 2 >= (y1 - y0) * (x1 - x0) ? 1 : 0;
    }
  }
  return {
    kind: "bitmap",
    width: w,
    height: h,
    rle: encodeRle(bits),
    strokes: [],
    feather: options.feather ?? BITMAP_FEATHER,
    invert: options.invert ?? false,
  };
}
