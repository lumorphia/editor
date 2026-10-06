import { describe, expect, it } from "vitest";
import { dragCrop } from "./crop-drag.ts";

const full = { x: 0, y: 0, w: 1, h: 1 };
const mid = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

describe("dragCrop", () => {
  it("moves within bounds", () => {
    expect(dragCrop(mid, "move", 0.1, -0.1)).toEqual({ x: 0.35, y: 0.15, w: 0.5, h: 0.5 });
    expect(dragCrop(mid, "move", 1, 1)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it("resizes from the east edge without moving the west edge", () => {
    const r = dragCrop(mid, "e", 0.1, 0);
    expect(r.x).toBe(0.25);
    expect(r.w).toBeCloseTo(0.6);
  });

  it("keeps a minimum size", () => {
    const r = dragCrop(mid, "e", -1, 0);
    expect(r.w).toBeCloseTo(0.05);
  });

  it("locks ratio when resizing a corner", () => {
    const r = dragCrop(full, "se", -0.5, 0, 1);
    expect(r.w).toBeCloseTo(r.h);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("locked ratio never exceeds the canvas", () => {
    const r = dragCrop({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, "se", 0.5, 0.5, 1);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
  });
});
