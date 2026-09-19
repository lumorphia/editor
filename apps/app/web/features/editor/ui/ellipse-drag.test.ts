import { describe, expect, it } from "vitest";
import { DEFAULT_ELLIPSE_MASK } from "@prismtone/shared/recipe";
import { dragEllipse, ellipseHandles } from "./ellipse-drag.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const size = { width: 200, height: 100 };
const mask = { ...DEFAULT_ELLIPSE_MASK, cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2, rotation: 0 };

describe("dragEllipse", () => {
  it("move shifts the center by the pointer delta and clamps to the image", () => {
    const out = dragEllipse(mask, "move", { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.45 }, size);
    expect(near(out.cx, 0.6) && near(out.cy, 0.45)).toBe(true);
    const far = dragEllipse(mask, "move", { x: 0.5, y: 0.5 }, { x: 2, y: -1 }, size);
    expect(far.cx).toBe(1);
    expect(far.cy).toBe(0);
  });

  it("rx handle sets the horizontal radius from the pointer distance", () => {
    const out = dragEllipse(mask, "rx", { x: 0.6, y: 0.5 }, { x: 0.75, y: 0.5 }, size);
    expect(near(out.rx, 0.25)).toBe(true);
    expect(out.ry).toBe(mask.ry);
  });

  it("ry handle sets the vertical radius, and radii never go below the minimum", () => {
    const out = dragEllipse(mask, "ry", { x: 0.5, y: 0.3 }, { x: 0.5, y: 0.4 }, size);
    expect(near(out.ry, 0.1)).toBe(true);
    const tiny = dragEllipse(mask, "ry", { x: 0.5, y: 0.3 }, { x: 0.5, y: 0.5 }, size);
    expect(tiny.ry).toBeGreaterThan(0);
  });

  it("radius handles measure along the rotated axes", () => {
    // 90 度回した楕円の rx 軸は画面の縦方向。縦に 30px 離れた点で rx = 30 / 200
    const rotated = { ...mask, rotation: 90 };
    const out = dragEllipse(rotated, "rx", { x: 0.5, y: 0.3 }, { x: 0.5, y: 0.2 }, size);
    expect(near(out.rx, 0.15)).toBe(true);
  });

  it("rotate handle sets the angle from the pointer around the center", () => {
    // 回転ハンドルは楕円の上 (-ry 方向)。真右へ持っていけば 90 度
    const out = dragEllipse(mask, "rotate", { x: 0.5, y: 0.3 }, { x: 0.7, y: 0.5 }, size);
    expect(near(out.rotation, 90, 1e-6)).toBe(true);
    const left = dragEllipse(mask, "rotate", { x: 0.5, y: 0.3 }, { x: 0.3, y: 0.5 }, size);
    expect(near(left.rotation, -90, 1e-6)).toBe(true);
  });
});

describe("ellipseHandles", () => {
  it("places rx / ry / rotate handles on the rotated axes in image uv", () => {
    const h = ellipseHandles(mask, size);
    expect(near(h.rx.x, 0.6) && near(h.rx.y, 0.5)).toBe(true);
    expect(near(h.ry.x, 0.5) && near(h.ry.y, 0.3)).toBe(true);
    expect(h.rotate.y).toBeLessThan(h.ry.y);
    const r = ellipseHandles({ ...mask, rotation: 90 }, size);
    // rx 軸 (20px) が縦になる: 20px / 100 = 0.2 下
    expect(near(r.rx.x, 0.5) && near(r.rx.y, 0.7)).toBe(true);
  });
});
