import { describe, expect, it } from "vitest";
import { DEFAULT_BRUSH_MASK, type BrushStrokeV2 } from "@prismtone/shared/recipe";
import {
  brushMaskValue,
  createMaskRaster,
  rasterSize,
  rasterizeBrushMask,
  simplifyPoints,
  stampStroke,
} from "./brush-raster.ts";

const source = { width: 200, height: 100 };
const dot = (x: number, y: number, extra: Partial<BrushStrokeV2> = {}): BrushStrokeV2 => ({
  mode: "add",
  size: 0.2, // 長辺 200 の 20% = 直径 40px、半径 20px
  hardness: 1,
  points: [{ x, y }],
  ...extra,
});
const at = (r: ReturnType<typeof createMaskRaster>, x: number, y: number) =>
  r.data[y * r.width + x]!;

describe("rasterSize", () => {
  it("keeps the aspect ratio and caps the long edge", () => {
    expect(rasterSize({ width: 4096, height: 2048 }, 1024)).toEqual({ width: 1024, height: 512 });
    expect(rasterSize(source, 1024)).toEqual({ width: 200, height: 100 });
  });
});

describe("stampStroke / rasterizeBrushMask", () => {
  it("a hard dot fills its radius and nothing outside", () => {
    const r = rasterizeBrushMask({ ...DEFAULT_BRUSH_MASK, strokes: [dot(0.5, 0.5)] }, source);
    expect(at(r, 100, 50)).toBe(255);
    expect(at(r, 115, 50)).toBe(255);
    expect(at(r, 125, 50)).toBe(0);
    expect(at(r, 100, 25)).toBe(0);
  });

  it("a soft dot falls off towards the edge", () => {
    const r = rasterizeBrushMask(
      { ...DEFAULT_BRUSH_MASK, strokes: [dot(0.5, 0.5, { hardness: 0 })] },
      source,
    );
    // 画素の中心は円の中心から 0.7px ずれるので、硬さ 0 では 255 に僅かに届かない
    expect(at(r, 100, 50)).toBeGreaterThanOrEqual(250);
    const mid = at(r, 110, 50);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
    expect(at(r, 121, 50)).toBe(0);
  });

  it("a stroke between two points has no gap", () => {
    const stroke = dot(0.25, 0.5, {
      points: [
        { x: 0.25, y: 0.5 },
        { x: 0.75, y: 0.5 },
      ],
    });
    const r = rasterizeBrushMask({ ...DEFAULT_BRUSH_MASK, strokes: [stroke] }, source);
    for (let x = 50; x <= 150; x += 5) expect(at(r, x, 50)).toBe(255);
  });

  it("erase removes what a previous stroke added, in order", () => {
    const strokes = [dot(0.5, 0.5), dot(0.5, 0.5, { mode: "erase", size: 0.1 })];
    const r = rasterizeBrushMask({ ...DEFAULT_BRUSH_MASK, strokes }, source);
    expect(at(r, 100, 50)).toBe(0);
    expect(at(r, 115, 50)).toBe(255);
    // 順序が逆なら消すものが無い
    const reversed = rasterizeBrushMask(
      { ...DEFAULT_BRUSH_MASK, strokes: [...strokes].reverse() },
      source,
    );
    expect(at(reversed, 100, 50)).toBe(255);
  });

  it("invert flips the raster and feather softens the edge", () => {
    const inv = rasterizeBrushMask(
      { ...DEFAULT_BRUSH_MASK, strokes: [dot(0.5, 0.5)], invert: true },
      source,
    );
    expect(at(inv, 100, 50)).toBe(0);
    expect(at(inv, 10, 10)).toBe(255);
    const soft = rasterizeBrushMask(
      { ...DEFAULT_BRUSH_MASK, strokes: [dot(0.5, 0.5)], feather: 1 },
      source,
    );
    expect(at(soft, 115, 50)).toBeLessThan(255);
  });

  it("stampStroke draws into an existing raster (incremental preview)", () => {
    const r = createMaskRaster(source);
    stampStroke(r, dot(0.25, 0.5), 0);
    stampStroke(r, dot(0.75, 0.5), 0);
    expect(at(r, 50, 50)).toBe(255);
    expect(at(r, 150, 50)).toBe(255);
    expect(at(r, 100, 50)).toBe(0);
  });
});

describe("brushMaskValue (CPU 参照)", () => {
  it("agrees with the raster inside, outside and after an erase", () => {
    const mask = {
      ...DEFAULT_BRUSH_MASK,
      strokes: [dot(0.5, 0.5), dot(0.5, 0.5, { mode: "erase", size: 0.1 })],
    };
    expect(brushMaskValue({ x: 0.5, y: 0.5 }, mask, source)).toBe(0);
    expect(brushMaskValue({ x: 0.575, y: 0.5 }, mask, source)).toBe(1);
    expect(brushMaskValue({ x: 0.9, y: 0.5 }, mask, source)).toBe(0);
    expect(brushMaskValue({ x: 0.9, y: 0.5 }, { ...mask, invert: true }, source)).toBe(1);
  });

  it("measures distance to the segment, not only to the points", () => {
    const stroke = dot(0.25, 0.5, {
      points: [
        { x: 0.25, y: 0.5 },
        { x: 0.75, y: 0.5 },
      ],
    });
    const mask = { ...DEFAULT_BRUSH_MASK, strokes: [stroke] };
    expect(brushMaskValue({ x: 0.5, y: 0.5 }, mask, source)).toBe(1);
    expect(brushMaskValue({ x: 0.5, y: 0.5 + 0.25 }, mask, source)).toBe(0);
  });
});

describe("simplifyPoints", () => {
  it("drops points closer than the minimum distance but keeps the first and last", () => {
    const pts = [
      { x: 0.1, y: 0.1 },
      { x: 0.101, y: 0.1 },
      { x: 0.2, y: 0.1 },
      { x: 0.2005, y: 0.1 },
    ];
    expect(simplifyPoints(pts, 0.005)).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.1 },
      { x: 0.2005, y: 0.1 },
    ]);
  });

  it("caps the number of points", () => {
    const pts = Array.from({ length: 2000 }, (_, i) => ({ x: i / 2000, y: 0.5 }));
    expect(simplifyPoints(pts, 0, 512)).toHaveLength(512);
  });
});
