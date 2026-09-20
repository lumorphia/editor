import { describe, expect, it } from "vitest";
import { DEFAULT_ELLIPSE_MASK, DEFAULT_LOCAL_ADJUSTMENT } from "@prismtone/shared/recipe";
import { adjustLabel, geometryLabel, localAdjustLabel, localAdjustmentsSummary } from "./labels.ts";

describe("operation labels", () => {
  it("補正は項目名と符号付きの値", () => {
    expect(adjustLabel("exposure", 0.3)).toBe("露光量 +0.30");
    expect(adjustLabel("contrast", -20)).toBe("コントラスト -20");
    expect(adjustLabel("saturation", 0)).toBe("彩度 0");
  });
  it("幾何は変えた項目から決める", () => {
    expect(geometryLabel({ rotation: 90 })).toBe("回転 90°");
    expect(geometryLabel({ straighten: -2.5 })).toBe("水平 -2.5°");
    expect(geometryLabel({ flipH: true })).toBe("左右反転");
    expect(geometryLabel({ aspect: "3:4" })).toBe("縦横比 3:4");
    expect(geometryLabel({ crop: null })).toBe("トリミングを解除");
    expect(geometryLabel({})).toBe("幾何の変更");
  });
});

describe("localAdjustLabel (#109)", () => {
  it("prefixes the item with 部分補正 and formats exposure to two decimals", () => {
    expect(localAdjustLabel("exposure", 0.35)).toBe("部分補正: 露光量 +0.35");
    expect(localAdjustLabel("shadows", -20)).toBe("部分補正: シャドウ -20");
  });
});

describe("localAdjustmentsSummary (#109)", () => {
  const local = (presetId: "eyes" | "skin" | "gear" | null) => ({
    ...DEFAULT_LOCAL_ADJUSTMENT,
    id: presetId ?? "free",
    mask: DEFAULT_ELLIPSE_MASK,
    presetId,
  });

  it("returns null when there are no local adjustments", () => {
    expect(localAdjustmentsSummary([])).toBeNull();
  });

  it("counts by preset in preset order and puts free-form ones last", () => {
    expect(
      localAdjustmentsSummary([local(null), local("skin"), local("eyes"), local("eyes")]),
    ).toBe("4 件 (瞳強調 ×2、美肌、その他 1)");
  });

  it("omits the breakdown when everything is free-form", () => {
    expect(localAdjustmentsSummary([local(null)])).toBe("1 件");
  });
});
