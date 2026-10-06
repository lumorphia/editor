import { describe, expect, it } from "vitest";
import {
  clampPan,
  DEFAULT_VIEWPORT,
  fitScale,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  place,
  zoomAt,
} from "./viewport.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const canvas = { width: 1000, height: 2000 };
const host = { width: 800, height: 600 };

describe("viewport", () => {
  it("fit places the image centered with a 4% margin", () => {
    const p = place(canvas, host, DEFAULT_VIEWPORT);
    expect(near(p.scale, (600 / 2000) * 0.96)).toBe(true);
    expect(near(p.x, (800 - 1000 * p.scale) / 2)).toBe(true);
    expect(near(p.y, (600 - 2000 * p.scale) / 2)).toBe(true);
  });

  it("zoomAt keeps the image point under the anchor fixed", () => {
    const anchor = { x: 500, y: 200 };
    const before = place(canvas, host, DEFAULT_VIEWPORT);
    const ix = (anchor.x - before.x) / before.scale;
    const iy = (anchor.y - before.y) / before.scale;
    const vp = zoomAt(canvas, host, DEFAULT_VIEWPORT, 2, anchor);
    const after = place(canvas, host, vp);
    expect(near(after.x + ix * after.scale, anchor.x)).toBe(true);
    expect(near(after.y + iy * after.scale, anchor.y)).toBe(true);
    expect(near(after.scale, fitScale(canvas, host) * 2)).toBe(true);
  });

  it("clamps zoom to the allowed range", () => {
    expect(zoomAt(canvas, host, DEFAULT_VIEWPORT, 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(canvas, host, DEFAULT_VIEWPORT, 0.01).zoom).toBe(MIN_ZOOM);
  });

  it("lets a small image shrink to actual size even below the usual minimum", () => {
    const small = { width: 200, height: 100 };
    const fit = fitScale(small, host); // > 1
    const vp = zoomAt(small, host, DEFAULT_VIEWPORT, 1 / fit);
    expect(near(place(small, host, vp).scale, 1)).toBe(true);
    expect(zoomAt(small, host, DEFAULT_VIEWPORT, 0.001).zoom).toBeCloseTo(1 / fit, 6);
  });

  it("pan cannot push the image completely out of the host", () => {
    const vp = panBy(canvas, host, { zoom: 2, pan: { x: 0, y: 0 } }, 100_000, -100_000);
    const p = place(canvas, host, vp);
    // 画像の左端はホストの中央より右に行かず、下端は中央より上に行かない
    expect(p.x).toBeLessThanOrEqual(host.width / 2 + 1e-6);
    expect(p.y + canvas.height * p.scale).toBeGreaterThanOrEqual(host.height / 2 - 1e-6);
  });

  it("clampPan leaves a viewport that already fits untouched", () => {
    const vp = clampPan(canvas, host, DEFAULT_VIEWPORT);
    expect(vp).toEqual(DEFAULT_VIEWPORT);
  });
});
