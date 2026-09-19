import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELLIPSE_MASK,
  DEFAULT_LOCAL_ADJUST,
  DEFAULT_LOCAL_ADJUSTMENT,
  DEFAULT_RECIPE,
  editRecipeInputSchema,
  editRecipeSchema,
  localAdjustmentSchema,
} from "./schema.ts";
import { migrateRecipe, RecipeMigrationError } from "./migrate.ts";
import { applyPreset, findPreset, PRESETS } from "./presets.ts";
import { applyLocalPreset, LOCAL_PRESETS } from "./local-presets.ts";

describe("editRecipeSchema v1", () => {
  it("rejects a version 1 recipe as the current schema", () => {
    expect(editRecipeSchema.safeParse({ ...DEFAULT_RECIPE, version: 1 }).success).toBe(false);
  });

  it("rejects out-of-range values instead of clamping", () => {
    const bad = { ...DEFAULT_RECIPE, adjust: { ...DEFAULT_RECIPE.adjust, exposure: 6 } };
    expect(editRecipeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-right-angle rotation", () => {
    const bad = { ...DEFAULT_RECIPE, geometry: { ...DEFAULT_RECIPE.geometry, rotation: 45 } };
    expect(editRecipeSchema.safeParse(bad).success).toBe(false);
  });
});

describe("migrateRecipe", () => {
  it("throws on unknown version", () => {
    expect(() => migrateRecipe({ ...DEFAULT_RECIPE, version: 99 })).toThrow(RecipeMigrationError);
  });

  it("throws on input without version", () => {
    expect(() => migrateRecipe({})).toThrow(RecipeMigrationError);
    expect(() => migrateRecipe(null)).toThrow(RecipeMigrationError);
  });
});

describe("presets", () => {
  it("has 10 presets with unique ids", () => {
    expect(PRESETS).toHaveLength(10);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(10);
  });

  it("every preset produces a valid recipe", () => {
    for (const preset of PRESETS) {
      expect(editRecipeSchema.safeParse(applyPreset(DEFAULT_RECIPE, preset)).success).toBe(true);
    }
  });

  it("applyPreset does not mutate the input and keeps geometry", () => {
    const before = structuredClone(DEFAULT_RECIPE);
    const cropped = {
      ...DEFAULT_RECIPE,
      geometry: { ...DEFAULT_RECIPE.geometry, rotation: 90 as const },
    };
    const mono = findPreset("mono");
    if (!mono) throw new Error("mono preset missing");
    const out = applyPreset(cropped, mono);
    expect(out.adjust.saturation).toBe(-100);
    expect(out.geometry.rotation).toBe(90);
    expect(out.presetId).toBe("mono");
    expect(DEFAULT_RECIPE).toEqual(before);
  });
});

describe("editRecipeSchema v2 (#109 部分補正)", () => {
  const ellipse = {
    id: "eye-l",
    name: null,
    presetId: "eyes",
    mask: {
      kind: "ellipse",
      cx: 0.4,
      cy: 0.3,
      rx: 0.05,
      ry: 0.04,
      rotation: 0,
      feather: 0.3,
      invert: false,
    },
    adjust: { ...DEFAULT_LOCAL_ADJUST, exposure: 0.3, sharpen: 30 },
    amount: 100,
    visible: true,
  } as const;
  const stroke = { mode: "add", size: 0.05, hardness: 0.8, points: [{ x: 0.5, y: 0.5 }] } as const;
  const brush = {
    ...ellipse,
    id: "gear",
    presetId: null,
    mask: { kind: "brush", strokes: [stroke], feather: 0, invert: false },
  } as const;
  const v2 = (local: unknown[]) => ({ ...DEFAULT_RECIPE, version: 2, localAdjustments: local });

  it("accepts the default recipe as version 2 with no local adjustments", () => {
    expect(DEFAULT_RECIPE.version).toBe(2);
    expect(DEFAULT_RECIPE.localAdjustments).toEqual([]);
    expect(editRecipeSchema.parse(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });

  it("accepts an ellipse and a brush local adjustment", () => {
    expect(editRecipeSchema.safeParse(v2([ellipse, brush])).success).toBe(true);
  });

  it("rejects a 9th local adjustment", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...ellipse, id: `m${i}` }));
    expect(editRecipeSchema.safeParse(v2(nine)).success).toBe(false);
    expect(editRecipeSchema.safeParse(v2(nine.slice(0, 8))).success).toBe(true);
  });

  it("rejects smooth above 60 (美肌の上限)", () => {
    const bad = { ...ellipse, adjust: { ...ellipse.adjust, smooth: 61 } };
    expect(editRecipeSchema.safeParse(v2([bad])).success).toBe(false);
  });

  it("rejects a brush stroke with more than 512 points", () => {
    const points = Array.from({ length: 513 }, () => ({ x: 0.5, y: 0.5 }));
    const bad = { ...brush, mask: { ...brush.mask, strokes: [{ ...stroke, points }] } };
    expect(editRecipeSchema.safeParse(v2([bad])).success).toBe(false);
  });

  it("rejects an ellipse with zero radius", () => {
    const bad = { ...ellipse, mask: { ...ellipse.mask, rx: 0 } };
    expect(editRecipeSchema.safeParse(v2([bad])).success).toBe(false);
  });

  it("rejects an unknown local preset id", () => {
    expect(editRecipeSchema.safeParse(v2([{ ...ellipse, presetId: "nose" }])).success).toBe(false);
  });
});

describe("migrateRecipe v1 -> v2", () => {
  const v1 = {
    version: 1,
    presetId: "mono",
    adjust: { ...DEFAULT_RECIPE.adjust, saturation: -100 },
    geometry: { ...DEFAULT_RECIPE.geometry, rotation: 90 },
  };

  it("fills localAdjustments with an empty array and bumps the version", () => {
    expect(migrateRecipe(v1)).toEqual({ ...v1, version: 2, localAdjustments: [] });
  });

  it("passes a valid v2 recipe through unchanged", () => {
    expect(migrateRecipe(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });

  it("rejects a v1 recipe that already carries v2 fields", () => {
    expect(() => migrateRecipe({ ...v1, localAdjustments: [] })).toThrow(RecipeMigrationError);
  });

  it("accepts either version through editRecipeInputSchema (API の入出力)", () => {
    expect(editRecipeInputSchema.safeParse(v1).success).toBe(true);
    expect(editRecipeInputSchema.safeParse(DEFAULT_RECIPE).success).toBe(true);
    expect(editRecipeInputSchema.safeParse({ ...v1, version: 3 }).success).toBe(false);
  });
});

describe("local presets", () => {
  it("has eyes / skin / gear and each produces a valid adjustment", () => {
    expect(LOCAL_PRESETS.map((p) => p.id)).toEqual(["eyes", "skin", "gear"]);
    for (const preset of LOCAL_PRESETS) {
      const local = applyLocalPreset(
        { ...DEFAULT_LOCAL_ADJUSTMENT, id: "x", mask: DEFAULT_ELLIPSE_MASK },
        preset,
      );
      expect(localAdjustmentSchema.safeParse(local).success).toBe(true);
      expect(local.presetId).toBe(preset.id);
    }
  });

  it("applyLocalPreset keeps the mask and does not mutate the input", () => {
    const input = {
      ...DEFAULT_LOCAL_ADJUSTMENT,
      id: "x",
      mask: { ...DEFAULT_ELLIPSE_MASK, cx: 0.2 },
    };
    const before = structuredClone(input);
    const out = applyLocalPreset(input, LOCAL_PRESETS[0]!);
    expect(out.mask).toEqual(input.mask);
    expect(input).toEqual(before);
  });
});
