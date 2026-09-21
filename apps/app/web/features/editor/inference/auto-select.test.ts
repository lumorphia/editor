import { describe, expect, it } from "vitest";
import { AUTO_SELECT_FAILED, planFaceSelection } from "./auto-select.ts";
import type { FaceResult } from "./face-masks.ts";

const square = (cx: number, cy: number, r: number) => [
  { x: cx - r, y: cy - r },
  { x: cx + r, y: cy - r },
  { x: cx + r, y: cy + r },
  { x: cx - r, y: cy + r },
];
const face = (overrides: Partial<FaceResult> = {}): FaceResult => ({
  bbox: [0.3, 0.2, 0.7, 0.8],
  oval: square(0.5, 0.5, 0.25),
  leftEye: square(0.4, 0.4, 0.03),
  rightEye: square(0.6, 0.4, 0.03),
  mouth: square(0.5, 0.65, 0.05),
  leftIris: { cx: 0.4, cy: 0.4, rx: 0.01, ry: 0.02 },
  rightIris: { cx: 0.6, cy: 0.4, rx: 0.01, ry: 0.02 },
  blink: { left: 0.05, right: 0.1 },
  ...overrides,
});

describe("planFaceSelection", () => {
  it("瞳: puts two ellipses on the main face's irises in one step", () => {
    const plan = planFaceSelection("eyes", [face()]);
    expect(plan.items).toHaveLength(2);
    expect(plan.items.every((i) => i.presetId === "eyes" && i.mask.kind === "ellipse")).toBe(true);
    expect(plan.label).toBe("瞳強調 (自動)");
    expect(plan.notice).toBeNull();
  });

  it("美肌: puts one polygon with holes on the main face", () => {
    const plan = planFaceSelection("skin", [face()]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.presetId).toBe("skin");
    expect(plan.items[0]!.mask.kind).toBe("polygon");
    expect(plan.label).toBe("美肌 (自動)");
  });

  it("says so without guessing why when no face was found", () => {
    const plan = planFaceSelection("eyes", []);
    expect(plan.items).toHaveLength(0);
    expect(plan.notice).toBe(AUTO_SELECT_FAILED);
  });

  it("瞳: tells when the eyes are closed and places only the open one", () => {
    const one = planFaceSelection("eyes", [face({ blink: { left: 0.9, right: 0.1 } })]);
    expect(one.items).toHaveLength(1);
    expect(one.notice).toMatch(/閉じている/);
    const none = planFaceSelection("eyes", [face({ blink: { left: 0.9, right: 0.8 } })]);
    expect(none.items).toHaveLength(0);
    expect(none.notice).toMatch(/閉じている/);
  });

  it("uses the largest face when there are several", () => {
    const small = face({
      bbox: [0.1, 0.1, 0.2, 0.25],
      leftIris: { cx: 0.12, cy: 0.15, rx: 0.003, ry: 0.005 },
    });
    const plan = planFaceSelection("eyes", [small, face()]);
    expect(plan.items[0]!.mask).toMatchObject({ cx: 0.4 });
  });
});
