import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE } from "./schema.ts";
import { upgradeStoredRecipe } from "./upgrade.ts";

describe("upgradeStoredRecipe (#109 レシピの版上げ)", () => {
  it("brings a version 1 recipe saved before local adjustments up to the current version", () => {
    const { version: _v, localAdjustments: _l, ...v1 } = DEFAULT_RECIPE;
    expect(upgradeStoredRecipe({ ...v1, version: 1 })).toEqual(DEFAULT_RECIPE);
  });

  it("returns null for a recipe it cannot read instead of throwing", () => {
    expect(upgradeStoredRecipe({ version: 99 })).toBeNull();
    expect(upgradeStoredRecipe(undefined)).toBeNull();
  });

  it("keeps a current recipe as it is", () => {
    expect(upgradeStoredRecipe(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });
});
