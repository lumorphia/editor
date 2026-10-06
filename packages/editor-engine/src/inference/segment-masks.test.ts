import { describe, expect, it } from "vitest";
import { BITMAP_MAX_EDGE, decodeRle } from "@lumorphia/editor-recipe";
import { SAM_LEVELS, toBitmapMask } from "./segment-masks.ts";

describe("toBitmapMask", () => {
  it("shrinks a full-size mask to the bitmap edge limit keeping the aspect ratio", () => {
    // 1024×512 の右半分が 1
    const w = 1024;
    const h = 512;
    const src = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) src.fill(1, y * w + w / 2, y * w + w);
    const m = toBitmapMask(src, w, h);
    expect(m.kind).toBe("bitmap");
    expect(m.width).toBe(BITMAP_MAX_EDGE);
    expect(m.height).toBe(BITMAP_MAX_EDGE / 2);
    const bits = decodeRle(m.rle, m.width * m.height);
    expect(bits[10]).toBe(0);
    expect(bits[m.width - 10]).toBe(1);
    expect(m.strokes).toEqual([]);
    expect(m.invert).toBe(false);
  });

  it("keeps a small mask as-is and can invert it (背景 = 人物の反転)", () => {
    const src = Uint8Array.from([1, 0, 0, 1]);
    const m = toBitmapMask(src, 2, 2, { invert: true });
    expect([m.width, m.height]).toEqual([2, 2]);
    expect(decodeRle(m.rle, 4)).toEqual(Uint8Array.from([1, 0, 0, 1]));
    expect(m.invert).toBe(true);
  });

  it("a cell is set when at least half of its source pixels are set", () => {
    // 4×1 → 2×1: 左のセルは 1 が 1/2 (境界で 1)、右のセルは 0/2
    const m = toBitmapMask(Uint8Array.from([1, 0, 0, 0]), 4, 1, { maxEdge: 2 });
    expect(decodeRle(m.rle, 2)).toEqual(Uint8Array.from([1, 0]));
  });

  it("names the three SAM granularities in a fixed order (全体 → 装備 → 部品)", () => {
    expect(SAM_LEVELS.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(SAM_LEVELS[1]!.label).toBe("装備");
  });
});
