import { describe, expect, it } from "vitest";
import {
  BITMAP_MAX_EDGE,
  DEFAULT_ELLIPSE_MASK,
  DEFAULT_LOCAL_ADJUST,
  DEFAULT_LOCAL_ADJUSTMENT,
  DEFAULT_RECIPE,
  MAX_LOCAL_ADJUSTMENTS,
  MAX_POLYGON_POINTS,
  editRecipeInputSchema,
  editRecipeSchema,
  editRecipeSchemaV2,
  localAdjustmentSchema,
} from "./schema.ts";
import { encodeRle } from "./rle.ts";
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
  const v2 = (local: unknown[]) => ({
    version: 2,
    presetId: null,
    adjust: DEFAULT_RECIPE.adjust,
    geometry: DEFAULT_RECIPE.geometry,
    localAdjustments: local,
  });

  it("accepts an ellipse and a brush local adjustment", () => {
    expect(editRecipeSchemaV2.safeParse(v2([ellipse, brush])).success).toBe(true);
  });

  it("rejects a 9th local adjustment in v2 (v2 の上限は 8 のまま)", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...ellipse, id: `m${i}` }));
    expect(editRecipeSchemaV2.safeParse(v2(nine)).success).toBe(false);
    expect(editRecipeSchemaV2.safeParse(v2(nine.slice(0, 8))).success).toBe(true);
  });

  it("rejects smooth above 60 (美肌の上限)", () => {
    const bad = { ...ellipse, adjust: { ...ellipse.adjust, smooth: 61 } };
    expect(editRecipeSchemaV2.safeParse(v2([bad])).success).toBe(false);
  });

  it("rejects a brush stroke with more than 512 points", () => {
    const points = Array.from({ length: 513 }, () => ({ x: 0.5, y: 0.5 }));
    const bad = { ...brush, mask: { ...brush.mask, strokes: [{ ...stroke, points }] } };
    expect(editRecipeSchemaV2.safeParse(v2([bad])).success).toBe(false);
  });

  it("rejects an ellipse with zero radius", () => {
    const bad = { ...ellipse, mask: { ...ellipse.mask, rx: 0 } };
    expect(editRecipeSchemaV2.safeParse(v2([bad])).success).toBe(false);
  });

  it("rejects an unknown local preset id", () => {
    expect(editRecipeSchemaV2.safeParse(v2([{ ...ellipse, presetId: "nose" }])).success).toBe(
      false,
    );
  });

  it("rejects v3 masks (polygon) in a v2 recipe", () => {
    const poly = { ...ellipse, mask: polygonMask };
    expect(editRecipeSchemaV2.safeParse(v2([poly])).success).toBe(false);
  });
});

const polygonMask = {
  kind: "polygon",
  rings: [
    [
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.2 },
      { x: 0.5, y: 0.8 },
    ],
  ],
  strokes: [],
  feather: 0.1,
  invert: false,
} as const;

describe("editRecipeSchema v3 (#176 自動選択のマスク)", () => {
  const base = {
    id: "face",
    name: null,
    presetId: "skin",
    groupId: null,
    adjust: DEFAULT_LOCAL_ADJUST,
    amount: 100,
    visible: true,
  } as const;
  const bitmapMask = {
    kind: "bitmap",
    width: 4,
    height: 2,
    rle: encodeRle(Uint8Array.from([0, 1, 1, 0, 0, 1, 1, 0])),
    strokes: [],
    feather: 0,
    invert: false,
  } as const;
  const v3 = (local: unknown[]) => ({ ...DEFAULT_RECIPE, localAdjustments: local });

  it("the default recipe is version 3 with no local adjustments", () => {
    expect(DEFAULT_RECIPE.version).toBe(3);
    expect(DEFAULT_RECIPE.localAdjustments).toEqual([]);
    expect(editRecipeSchema.parse(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });

  it("accepts polygon and bitmap masks alongside ellipse and brush", () => {
    const list = [
      { ...base, mask: polygonMask },
      { ...base, id: "gear", presetId: "gear", mask: bitmapMask },
      { ...base, id: "eye", presetId: "eyes", mask: DEFAULT_ELLIPSE_MASK },
    ];
    expect(editRecipeSchema.safeParse(v3(list)).success).toBe(true);
  });

  it("allows up to 12 local adjustments (人物補正 1 人で 5 件使う)", () => {
    expect(MAX_LOCAL_ADJUSTMENTS).toBe(12);
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...base, id: `m${i}`, mask: DEFAULT_ELLIPSE_MASK }));
    expect(editRecipeSchema.safeParse(v3(many(12))).success).toBe(true);
    expect(editRecipeSchema.safeParse(v3(many(13))).success).toBe(false);
  });

  it("rejects a polygon ring with fewer than 3 points or more than the limit", () => {
    const two = { ...polygonMask, rings: [polygonMask.rings[0].slice(0, 2)] };
    expect(editRecipeSchema.safeParse(v3([{ ...base, mask: two }])).success).toBe(false);
    const ring = Array.from({ length: MAX_POLYGON_POINTS + 1 }, (_, i) => ({
      x: (i % 100) / 100,
      y: 0.5,
    }));
    expect(
      editRecipeSchema.safeParse(v3([{ ...base, mask: { ...polygonMask, rings: [ring] } }]))
        .success,
    ).toBe(false);
  });

  it("rejects a bitmap larger than the edge limit or with a mismatched rle", () => {
    const big = {
      ...bitmapMask,
      width: BITMAP_MAX_EDGE + 1,
      height: 1,
      rle: encodeRle(new Uint8Array(BITMAP_MAX_EDGE + 1)),
    };
    expect(editRecipeSchema.safeParse(v3([{ ...base, mask: big }])).success).toBe(false);
    const short = { ...bitmapMask, rle: encodeRle(Uint8Array.from([1, 1, 1])) };
    expect(editRecipeSchema.safeParse(v3([{ ...base, mask: short }])).success).toBe(false);
  });

  it("carries a groupId so a portrait's adjustments can be handled together", () => {
    const grouped = { ...base, groupId: "p1", mask: polygonMask };
    expect(editRecipeSchema.safeParse(v3([grouped])).success).toBe(true);
    expect(editRecipeSchema.safeParse(v3([{ ...grouped, groupId: "x".repeat(33) }])).success).toBe(
      false,
    );
  });
});

describe("migrateRecipe v2 -> v3", () => {
  const v2 = {
    version: 2,
    presetId: null,
    adjust: DEFAULT_RECIPE.adjust,
    geometry: DEFAULT_RECIPE.geometry,
    localAdjustments: [
      {
        id: "a",
        name: null,
        presetId: "eyes",
        mask: DEFAULT_ELLIPSE_MASK,
        adjust: DEFAULT_LOCAL_ADJUST,
        amount: 80,
        visible: true,
      },
    ],
  };

  it("adds groupId: null to each local adjustment and bumps the version", () => {
    const out = migrateRecipe(v2);
    expect(out.version).toBe(3);
    expect(out.localAdjustments[0]).toEqual({ ...v2.localAdjustments[0], groupId: null });
  });

  it("migrates v1 all the way to v3", () => {
    const v1 = {
      version: 1,
      presetId: null,
      adjust: DEFAULT_RECIPE.adjust,
      geometry: DEFAULT_RECIPE.geometry,
    };
    expect(migrateRecipe(v1)).toEqual({ ...v1, version: 3, localAdjustments: [] });
  });

  it("rejects a v2 recipe that already carries groupId", () => {
    const leaked = { ...v2, localAdjustments: [{ ...v2.localAdjustments[0], groupId: null }] };
    expect(() => migrateRecipe(leaked)).toThrow(RecipeMigrationError);
  });

  it("accepts v1, v2 and v3 through editRecipeInputSchema (API の入出力)", () => {
    expect(editRecipeInputSchema.safeParse(v2).success).toBe(true);
    expect(editRecipeInputSchema.safeParse(DEFAULT_RECIPE).success).toBe(true);
    expect(editRecipeInputSchema.safeParse({ ...DEFAULT_RECIPE, version: 4 }).success).toBe(false);
  });
});

describe("migrateRecipe v1 -> v2", () => {
  const v1 = {
    version: 1,
    presetId: "mono",
    adjust: { ...DEFAULT_RECIPE.adjust, saturation: -100 },
    geometry: { ...DEFAULT_RECIPE.geometry, rotation: 90 },
  };

  it("fills localAdjustments with an empty array (v2 の形) on the way to the current version", () => {
    expect(migrateRecipe(v1)).toEqual({ ...v1, version: 3, localAdjustments: [] });
  });

  it("passes a valid current recipe through unchanged", () => {
    expect(migrateRecipe(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });

  it("rejects a v1 recipe that already carries v2 fields", () => {
    expect(() => migrateRecipe({ ...v1, localAdjustments: [] })).toThrow(RecipeMigrationError);
  });

  it("accepts v1 through editRecipeInputSchema but not a v1 body labelled v3", () => {
    expect(editRecipeInputSchema.safeParse(v1).success).toBe(true);
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
