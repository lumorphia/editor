import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, editRecipeSchema } from "./schema.ts";
import { migrateRecipe, RecipeMigrationError } from "./migrate.ts";
import { applyPreset, findPreset, PRESETS } from "./presets.ts";

describe("editRecipeSchema v1", () => {
  it("accepts the default recipe", () => {
    expect(editRecipeSchema.parse(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
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
  it("passes a valid v1 recipe through", () => {
    expect(migrateRecipe(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });

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
