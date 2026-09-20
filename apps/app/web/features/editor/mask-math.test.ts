import { describe, expect, it } from "vitest";
import { DEFAULT_ELLIPSE_MASK, DEFAULT_GEOMETRY } from "@prismtone/shared/recipe";
import { canvasToImageUv, ellipseMaskValue, imageUvToCanvas } from "./mask-math.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const size = { width: 200, height: 100 };

describe("ellipseMaskValue", () => {
  const mask = { ...DEFAULT_ELLIPSE_MASK, cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2, feather: 0.5 };

  it("is 1 at the center and 0 outside the radius", () => {
    expect(ellipseMaskValue({ x: 0.5, y: 0.5 }, mask, size)).toBe(1);
    expect(ellipseMaskValue({ x: 0.5 + 0.11, y: 0.5 }, mask, size)).toBe(0);
    expect(ellipseMaskValue({ x: 0.5, y: 0.5 + 0.21 }, mask, size)).toBe(0);
  });

  it("is 1 inside the un-feathered core and in between across the feather band", () => {
    // feather 0.5 なら半径の 50% までが芯、そこから縁までなだらかに 0 へ
    expect(ellipseMaskValue({ x: 0.5 + 0.04, y: 0.5 }, mask, size)).toBe(1);
    const mid = ellipseMaskValue({ x: 0.5 + 0.075, y: 0.5 }, mask, size);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("has a hard edge when feather is 0", () => {
    const hard = { ...mask, feather: 0 };
    expect(ellipseMaskValue({ x: 0.5 + 0.099, y: 0.5 }, hard, size)).toBe(1);
    expect(ellipseMaskValue({ x: 0.5 + 0.101, y: 0.5 }, hard, size)).toBe(0);
  });

  it("inverts", () => {
    const inv = { ...mask, invert: true };
    expect(ellipseMaskValue({ x: 0.5, y: 0.5 }, inv, size)).toBe(0);
    expect(ellipseMaskValue({ x: 0.9, y: 0.9 }, inv, size)).toBe(1);
  });

  it("rotates in pixel space so a 90 degree turn swaps the pixel radii", () => {
    // rx 0.1 × 200px = 20px、ry 0.2 × 100px = 20px。回転しても円のまま
    const circle = { ...mask, rotation: 90 };
    expect(ellipseMaskValue({ x: 0.5 + 0.095, y: 0.5 }, circle, size)).toBeGreaterThan(0);
    // rx 0.1 × 200 = 20px、ry 0.05 × 100 = 5px の横長を 90 度回すと縦長 (x 方向は 5px = 0.025)
    const tall = { ...mask, ry: 0.05, rotation: 90 };
    expect(ellipseMaskValue({ x: 0.5 + 0.03, y: 0.5 }, tall, size)).toBe(0);
    expect(ellipseMaskValue({ x: 0.5, y: 0.5 + 0.15 }, tall, size)).toBeGreaterThan(0);
  });
});

describe("imageUvToCanvas / canvasToImageUv", () => {
  it("is the identity offset by nothing when geometry is default", () => {
    const p = imageUvToCanvas({ x: 0.25, y: 0.75 }, size, DEFAULT_GEOMETRY);
    expect(p).toEqual({ x: 50, y: 75 });
    const uv = canvasToImageUv(p, size, DEFAULT_GEOMETRY);
    expect(near(uv.x, 0.25) && near(uv.y, 0.75)).toBe(true);
  });

  it("maps the image's top-left corner to the canvas top-right after rotating 90 degrees", () => {
    // 200x100 を 90 度回すとキャンバスは 100x200。左上 (0,0) は右上 (100,0) へ
    const p = imageUvToCanvas({ x: 0, y: 0 }, size, { ...DEFAULT_GEOMETRY, rotation: 90 });
    expect(near(p.x, 100) && near(p.y, 0)).toBe(true);
  });

  it("mirrors x when flipped horizontally", () => {
    const p = imageUvToCanvas({ x: 0.25, y: 0.5 }, size, { ...DEFAULT_GEOMETRY, flipH: true });
    expect(near(p.x, 150) && near(p.y, 50)).toBe(true);
  });

  it("round-trips through rotation, straighten and flip", () => {
    const g = { ...DEFAULT_GEOMETRY, rotation: 270 as const, straighten: -7, flipH: true };
    for (const uv of [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.9 },
      { x: 0.5, y: 0.5 },
    ]) {
      const back = canvasToImageUv(imageUvToCanvas(uv, size, g), size, g);
      expect(near(back.x, uv.x) && near(back.y, uv.y)).toBe(true);
    }
  });
});
