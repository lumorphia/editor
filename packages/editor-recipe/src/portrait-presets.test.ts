import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELLIPSE_MASK,
  DEFAULT_LOCAL_ADJUST,
  DEFAULT_LOCAL_ADJUSTMENT,
  DEFAULT_RECIPE,
  editRecipeSchema,
  localAdjustSchemaV4,
  type EditRecipe,
  type LocalAdjustment,
} from "./schema.ts";
import { encodeRle } from "./rle.ts";
import {
  PORTRAIT_PRESETS,
  PORTRAIT_ROLES,
  applyPortraitPreset,
  findPortraitPreset,
  portraitAmount,
  portraitRole,
  scalePortraitAmount,
} from "./portrait-presets.ts";

const bitmap = (invert: boolean) => ({
  kind: "bitmap" as const,
  width: 2,
  height: 1,
  rle: encodeRle(Uint8Array.from([1, 0])),
  strokes: [],
  feather: 0.1,
  invert,
});
const polygon = {
  kind: "polygon" as const,
  rings: [
    [
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.2 },
      { x: 0.5, y: 0.8 },
    ],
  ],
  strokes: [],
  feather: 0.2,
  invert: false,
};
const local = (
  id: string,
  mask: LocalAdjustment["mask"],
  extra: Partial<LocalAdjustment> = {},
): LocalAdjustment => ({
  ...DEFAULT_LOCAL_ADJUSTMENT,
  id,
  mask,
  groupId: "p1",
  ...extra,
});
const group: EditRecipe = {
  ...DEFAULT_RECIPE,
  localAdjustments: [
    local("bg", bitmap(true)),
    local("person", bitmap(false)),
    local("face", polygon, { presetId: "skin" }),
    local("eyeL", DEFAULT_ELLIPSE_MASK, { presetId: "eyes" }),
    local("other", DEFAULT_ELLIPSE_MASK, { groupId: null }),
  ],
};

describe("PORTRAIT_PRESETS", () => {
  it("has the five presets and every role's adjust is a valid local adjust", () => {
    expect(PORTRAIT_PRESETS.map((p) => p.id)).toEqual([
      "natural",
      "bright",
      "dramatic",
      "soft",
      "eyes",
    ]);
    for (const preset of PORTRAIT_PRESETS) {
      for (const role of PORTRAIT_ROLES) {
        const r = preset.roles[role];
        expect(
          localAdjustSchemaV4.safeParse({ ...DEFAULT_LOCAL_ADJUST, ...r.adjust }).success,
        ).toBe(true);
        expect(r.amount).toBeGreaterThanOrEqual(0);
        expect(r.amount).toBeLessThanOrEqual(100);
      }
    }
    expect(findPortraitPreset("nope")).toBeUndefined();
  });

  it("uses at least one v4 effect in every portrait preset", () => {
    const keys = ["blur", "bloom", "vignette", "clarity"] as const;
    for (const preset of PORTRAIT_PRESETS) {
      expect(
        PORTRAIT_ROLES.some((role) =>
          keys.some((key) => preset.roles[role].adjust[key] !== undefined),
        ),
      ).toBe(true);
    }
  });
});

describe("portraitRole", () => {
  it("derives the role from the mask: inverted bitmap = 背景, bitmap = 人物, polygon = 顔, ellipse = 瞳", () => {
    expect(group.localAdjustments.slice(0, 4).map(portraitRole)).toEqual([
      "background",
      "person",
      "face",
      "eyes",
    ]);
  });
});

describe("applyPortraitPreset", () => {
  it("rewrites adjust and amount of the group's adjustments by role, leaving others alone", () => {
    const dramatic = findPortraitPreset("dramatic")!;
    const out = applyPortraitPreset(group, "p1", dramatic, 100);
    const bg = out.localAdjustments[0]!;
    expect(bg.adjust).toEqual({ ...DEFAULT_LOCAL_ADJUST, ...dramatic.roles.background.adjust });
    expect(bg.amount).toBe(dramatic.roles.background.amount);
    expect(out.localAdjustments[4]).toBe(group.localAdjustments[4]);
    expect(editRecipeSchema.safeParse(out).success).toBe(true);
    expect(group.localAdjustments[0]!.amount).toBe(100);
  });

  it("keeps presetId on the face and eyes for the panel's labels", () => {
    const out = applyPortraitPreset(group, "p1", findPortraitPreset("natural")!, 100);
    expect(out.localAdjustments[2]!.presetId).toBe("skin");
    expect(out.localAdjustments[3]!.presetId).toBe("eyes");
  });
});

describe("scalePortraitAmount / portraitAmount", () => {
  it("scales each role's amount by the group's effect and reads it back", () => {
    const natural = findPortraitPreset("natural")!;
    const half = scalePortraitAmount(group, "p1", natural, 50);
    expect(half.localAdjustments[0]!.amount).toBe(Math.round(natural.roles.background.amount / 2));
    expect(portraitAmount(half, "p1", natural)).toBe(50);
    expect(portraitAmount(scalePortraitAmount(group, "p1", natural, 0), "p1", natural)).toBe(0);
  });
});
