import { describe, expect, it } from "vitest";
import { encodeRle, findPortraitPreset, type BitmapMaskV3 } from "@lumorphia/editor-recipe";
import type { FaceResult } from "./face-masks.ts";
import { buildPortraitItems, faceCenter } from "./portrait.ts";

const square = (cx: number, cy: number, r: number) => [
  { x: cx - r, y: cy - r },
  { x: cx + r, y: cy - r },
  { x: cx + r, y: cy + r },
  { x: cx - r, y: cy + r },
];
const face: FaceResult = {
  bbox: [0.3, 0.2, 0.7, 0.8],
  oval: square(0.5, 0.5, 0.25),
  leftEye: square(0.4, 0.4, 0.03),
  rightEye: square(0.6, 0.4, 0.03),
  mouth: square(0.5, 0.65, 0.05),
  leftIris: { cx: 0.4, cy: 0.4, rx: 0.01, ry: 0.02 },
  rightIris: { cx: 0.6, cy: 0.4, rx: 0.01, ry: 0.02 },
  blink: { left: 0.05, right: 0.1 },
};
const person: BitmapMaskV3 = {
  kind: "bitmap",
  width: 2,
  height: 1,
  rle: encodeRle(Uint8Array.from([1, 0])),
  strokes: [],
  feather: 0.1,
  invert: false,
};

describe("buildPortraitItems", () => {
  it("builds 背景 → 人物 → 顔 → 瞳 ×2 with the preset's values scaled by the effect", () => {
    const natural = findPortraitPreset("natural")!;
    const items = buildPortraitItems(face, person, natural, 50);
    expect(items.map((i) => i.name)).toEqual(["背景", "人物", "顔", "瞳 (左)", "瞳 (右)"]);
    expect(items[0]!.mask).toMatchObject({ kind: "bitmap", invert: true });
    expect(items[1]!.mask).toBe(person);
    expect(items[2]!.mask.kind).toBe("polygon");
    expect(items[2]!.presetId).toBe("skin");
    expect(items[3]!.presetId).toBe("eyes");
    expect(items[0]!.amount).toBe(Math.round(natural.roles.background.amount / 2));
    expect(items[2]!.adjust?.smooth).toBe(natural.roles.face.adjust.smooth);
  });

  it("leaves out closed eyes", () => {
    const closed = { ...face, blink: { left: 0.9, right: 0.1 } };
    const items = buildPortraitItems(closed, person, findPortraitPreset("eyes")!, 100);
    expect(items.map((i) => i.name)).toEqual(["背景", "人物", "顔", "瞳 (右)"]);
  });
});

describe("faceCenter", () => {
  it("is the centre of the face box (SAM のタップ位置)", () => {
    expect(faceCenter(face)).toEqual({ x: 0.5, y: 0.5 });
  });
});
