import { describe, expect, it } from "vitest";
import { adjustLabel, geometryLabel } from "./labels.ts";

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
