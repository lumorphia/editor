import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADJUST,
  DEFAULT_BRUSH_MASK,
  DEFAULT_ELLIPSE_MASK,
  DEFAULT_LOCAL_ADJUST,
  DEFAULT_LOCAL_ADJUSTMENT,
  DEFAULT_RECIPE,
} from "@prismtone/shared/recipe";
import {
  applyAdjust,
  applyLocalAdjust,
  applyRecipeAt,
  linearToSrgb,
  srgbToLinear,
  type RGB,
} from "./adjust-math.ts";

const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

describe("applyAdjust", () => {
  it("is identity with default adjust", () => {
    for (const px of [
      [0.2, 0.5, 0.8],
      [0, 0, 0],
      [1, 1, 1],
      [0.5, 0.5, 0.5],
    ] as RGB[]) {
      const out = applyAdjust(px, DEFAULT_ADJUST);
      out.forEach((v, i) => expect(near(v, px[i]!)).toBe(true));
    }
  });

  it("exposure +1 EV doubles linear light on mid tones", () => {
    const px: RGB = [0.3, 0.3, 0.3];
    const out = applyAdjust(px, { ...DEFAULT_ADJUST, exposure: 1 });
    expect(near(srgbToLinear(out[0]), srgbToLinear(px[0]) * 2, 1e-3)).toBe(true);
  });

  it("saturation -100 produces neutral gray", () => {
    const out = applyAdjust([0.9, 0.2, 0.4], { ...DEFAULT_ADJUST, saturation: -100 });
    expect(near(out[0], out[1])).toBe(true);
    expect(near(out[1], out[2])).toBe(true);
  });

  it("warm temperature raises red and lowers blue", () => {
    const px: RGB = [0.5, 0.5, 0.5];
    const out = applyAdjust(px, { ...DEFAULT_ADJUST, temperature: 100 });
    expect(out[0]).toBeGreaterThan(px[0]);
    expect(out[2]).toBeLessThan(px[2]);
    expect(near(out[1], px[1])).toBe(true);
  });

  it("positive contrast pushes values away from mid gray", () => {
    const dark = applyAdjust([0.3, 0.3, 0.3], { ...DEFAULT_ADJUST, contrast: 100 });
    const light = applyAdjust([0.7, 0.7, 0.7], { ...DEFAULT_ADJUST, contrast: 100 });
    expect(dark[0]).toBeLessThan(0.3);
    expect(light[0]).toBeGreaterThan(0.7);
  });

  it("shadows lift dark pixels more than bright ones", () => {
    const dark = applyAdjust([0.1, 0.1, 0.1], { ...DEFAULT_ADJUST, shadows: 100 });
    const bright = applyAdjust([0.9, 0.9, 0.9], { ...DEFAULT_ADJUST, shadows: 100 });
    expect(dark[0] - 0.1).toBeGreaterThan(bright[0] - 0.9);
  });

  it("vibrance affects low-saturation pixels more than saturated ones", () => {
    const pale: RGB = [0.55, 0.5, 0.5];
    const vivid: RGB = [1, 0, 0];
    const paleOut = applyAdjust(pale, { ...DEFAULT_ADJUST, vibrance: 100 });
    const vividOut = applyAdjust(vivid, { ...DEFAULT_ADJUST, vibrance: 100 });
    expect(paleOut[0] - paleOut[1]).toBeGreaterThan(pale[0] - pale[1]);
    expect(near(vividOut[0], 1)).toBe(true);
  });

  it("always returns values within 0..1", () => {
    const out = applyAdjust([1, 1, 1], {
      ...DEFAULT_ADJUST,
      exposure: 5,
      contrast: 100,
      saturation: 100,
    });
    out.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});

describe("srgb conversions", () => {
  it("round-trips", () => {
    for (const v of [0, 0.01, 0.2, 0.5, 0.9, 1]) {
      expect(near(linearToSrgb(srgbToLinear(v)), v, 1e-6)).toBe(true);
    }
  });
});

describe("applyRecipeAt (部分補正の CPU 参照、#109)", () => {
  const eye = {
    ...DEFAULT_LOCAL_ADJUSTMENT,
    id: "eye",
    mask: { ...DEFAULT_ELLIPSE_MASK, cx: 0.25, cy: 0.5, rx: 0.1, ry: 0.2, feather: 0 },
    adjust: { ...DEFAULT_LOCAL_ADJUST, exposure: 1 },
  };
  const size = { width: 200, height: 100 };
  const px: RGB = [0.3, 0.3, 0.3];

  it("applies the local adjustment fully inside the mask and not at all outside", () => {
    const recipe = { ...DEFAULT_RECIPE, localAdjustments: [eye] };
    const inside = applyRecipeAt(px, { x: 0.25, y: 0.5 }, recipe, size);
    const outside = applyRecipeAt(px, { x: 0.75, y: 0.5 }, recipe, size);
    expect(inside).toEqual(applyLocalAdjust(px, eye.adjust));
    expect(outside).toEqual(px);
  });

  it("blends by amount and skips hidden adjustments", () => {
    const half = { ...DEFAULT_RECIPE, localAdjustments: [{ ...eye, amount: 50 }] };
    const out = applyRecipeAt(px, { x: 0.25, y: 0.5 }, half, size);
    const full = applyLocalAdjust(px, eye.adjust);
    expect(near(out[0], (px[0] + full[0]) / 2)).toBe(true);
    const hidden = { ...DEFAULT_RECIPE, localAdjustments: [{ ...eye, visible: false }] };
    expect(applyRecipeAt(px, { x: 0.25, y: 0.5 }, hidden, size)).toEqual(px);
  });

  it("applies the global adjust first, then local adjustments in order", () => {
    const recipe = {
      ...DEFAULT_RECIPE,
      adjust: { ...DEFAULT_ADJUST, saturation: -100 },
      localAdjustments: [eye],
    };
    const out = applyRecipeAt([0.9, 0.2, 0.4], { x: 0.25, y: 0.5 }, recipe, size);
    const expected = applyLocalAdjust(applyAdjust([0.9, 0.2, 0.4], recipe.adjust), eye.adjust);
    expect(out).toEqual(expected);
  });

  it("applyLocalAdjust matches applyAdjust with the same values and no vibrance", () => {
    const local = { ...DEFAULT_LOCAL_ADJUST, exposure: 0.5, contrast: 20, temperature: -30 };
    expect(applyLocalAdjust(px, local)).toEqual(
      applyAdjust(px, { ...DEFAULT_ADJUST, exposure: 0.5, contrast: 20, temperature: -30 }),
    );
  });

  it("evaluates a brush mask through the stroke geometry", () => {
    const brush = {
      ...eye,
      id: "gear",
      mask: {
        ...DEFAULT_BRUSH_MASK,
        strokes: [{ mode: "add" as const, size: 0.2, hardness: 1, points: [{ x: 0.75, y: 0.5 }] }],
      },
    };
    const recipe = { ...DEFAULT_RECIPE, localAdjustments: [brush] };
    expect(applyRecipeAt(px, { x: 0.75, y: 0.5 }, recipe, size)).toEqual(
      applyLocalAdjust(px, eye.adjust),
    );
    expect(applyRecipeAt(px, { x: 0.25, y: 0.5 }, recipe, size)).toEqual(px);
  });
});
