import { describe, expect, it } from "vitest";
import { DEFAULT_GEOMETRY } from "@lumorphia/editor-recipe";
import {
  aspectRatio,
  canvasSize,
  centeredCrop,
  cropRect,
  exportScale,
  rotatedBounds,
} from "./geometry.ts";

describe("rotatedBounds", () => {
  it("swaps width and height at 90 degrees", () => {
    expect(rotatedBounds({ width: 1920, height: 1080 }, 90)).toEqual({ width: 1080, height: 1920 });
  });
  it("is unchanged at 0 and 180", () => {
    expect(rotatedBounds({ width: 1920, height: 1080 }, 0)).toEqual({ width: 1920, height: 1080 });
    expect(rotatedBounds({ width: 1920, height: 1080 }, 180)).toEqual({
      width: 1920,
      height: 1080,
    });
  });
  it("grows for small straighten angles", () => {
    const b = rotatedBounds({ width: 1000, height: 1000 }, 10);
    expect(b.width).toBeGreaterThan(1000);
    expect(b.height).toBeGreaterThan(1000);
  });
});

describe("canvasSize / cropRect", () => {
  const src = { width: 1920, height: 1080 };
  it("uses the whole canvas without crop", () => {
    expect(cropRect(canvasSize(src, DEFAULT_GEOMETRY), DEFAULT_GEOMETRY)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });
  it("converts normalized crop to pixels and clamps to the canvas", () => {
    const g = { ...DEFAULT_GEOMETRY, crop: { x: 0.5, y: 0.5, w: 0.75, h: 0.75 } };
    expect(cropRect(src, g)).toEqual({ x: 960, y: 540, width: 960, height: 540 });
  });
  it("never yields a zero-sized rect", () => {
    const g = { ...DEFAULT_GEOMETRY, crop: { x: 0, y: 0, w: 0, h: 0 } };
    const r = cropRect(src, g);
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe("aspect helpers", () => {
  it("parses ratios", () => {
    expect(aspectRatio("16:9")).toBeCloseTo(16 / 9);
    expect(aspectRatio("free")).toBeUndefined();
    expect(aspectRatio(null)).toBeUndefined();
  });
  it("centers a 1:1 crop inside a landscape canvas", () => {
    const c = centeredCrop({ width: 1920, height: 1080 }, 1);
    expect(c.h).toBe(1);
    expect(c.w).toBeCloseTo(1080 / 1920);
    expect(c.x).toBeCloseTo((1 - 1080 / 1920) / 2);
  });
  it("centers a 9:16 crop inside a landscape canvas", () => {
    const c = centeredCrop({ width: 1920, height: 1080 }, 9 / 16);
    expect(c.h).toBe(1);
    expect(c.w).toBeCloseTo(9 / 16 / (1920 / 1080));
  });
});

describe("exportScale", () => {
  it("does not upscale", () => expect(exportScale({ width: 100, height: 50 }, 4096)).toBe(1));
  it("scales the long edge to the max", () =>
    expect(exportScale({ width: 8192, height: 100 }, 4096)).toBe(0.5));
});
