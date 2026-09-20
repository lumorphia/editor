import { describe, expect, it } from "vitest";
import { dragPan, pinch, wheelZoomFactor } from "./gesture.ts";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("pinch", () => {
  it("spreading two fingers doubles the factor around their midpoint", () => {
    const p = pinch({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 });
    expect(near(p.factor, 2)).toBe(true);
    expect(p.anchor).toEqual({ x: 150, y: 100 });
    expect(p.pan).toEqual({ x: 0, y: 0 });
  });

  it("moving both fingers together pans by the midpoint delta without zooming", () => {
    const p = pinch({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 130, y: 140 }, { x: 230, y: 140 });
    expect(near(p.factor, 1)).toBe(true);
    expect(p.pan).toEqual({ x: 30, y: 40 });
  });

  it("does not blow up when the fingers overlap", () => {
    const p = pinch({ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 100 }, { x: 150, y: 100 });
    expect(p.factor).toBe(1);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in when scrolling away and out when scrolling towards, symmetrically", () => {
    const zoomIn = wheelZoomFactor(-100, 0);
    const zoomOut = wheelZoomFactor(100, 0);
    expect(zoomIn).toBeGreaterThan(1);
    expect(near(zoomIn * zoomOut, 1)).toBe(true);
  });

  it("treats line-mode deltas like a few pixels of scrolling", () => {
    expect(near(wheelZoomFactor(-3, 1), wheelZoomFactor(-48, 0))).toBe(true);
  });
});

describe("dragPan", () => {
  it("is the pointer delta", () => {
    expect(dragPan({ x: 10, y: 20 }, { x: 15, y: 10 })).toEqual({ x: 5, y: -10 });
  });
});
