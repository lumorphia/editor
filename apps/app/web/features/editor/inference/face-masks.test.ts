import { describe, expect, it } from "vitest";
import type { EllipseMaskV2 } from "@lumorphia/editor-recipe";
import { facePolygon, irisEllipses, pickMainFace, type FaceResult } from "./face-masks.ts";

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

describe("pickMainFace", () => {
  it("picks the tallest face (一番大きい顔)", () => {
    const small = face({ bbox: [0.1, 0.1, 0.2, 0.25] });
    const big = face();
    expect(pickMainFace([small, big])).toBe(big);
    expect(pickMainFace([])).toBeNull();
  });
});

describe("irisEllipses", () => {
  it("places an ellipse on each iris, 1.3 times the iris radius, with a soft edge", () => {
    const [l, r] = irisEllipses(face()) as [EllipseMaskV2, EllipseMaskV2];
    expect(l).toMatchObject({ kind: "ellipse", cx: 0.4, cy: 0.4, rotation: 0, invert: false });
    expect(l.rx).toBeCloseTo(0.013);
    expect(l.ry).toBeCloseTo(0.026);
    expect(l.feather).toBe(0.5);
    expect(r.cx).toBe(0.6);
  });

  it("skips an eye that is closed (eyeBlink 0.5 以上)", () => {
    const closedLeft = face({ blink: { left: 0.8, right: 0.1 } });
    expect(irisEllipses(closedLeft)).toHaveLength(1);
    expect(irisEllipses(closedLeft)[0]!.cx).toBe(0.6);
    expect(irisEllipses(face({ blink: { left: 0.9, right: 0.7 } }))).toHaveLength(0);
    // blendshape が無ければ開いているとみなす
    expect(irisEllipses(face({ blink: { left: null, right: null } }))).toHaveLength(2);
  });
});

describe("facePolygon", () => {
  it("uses the face oval as the outer ring and cuts holes for the eyes and mouth", () => {
    const m = facePolygon(face());
    expect(m.kind).toBe("polygon");
    expect(m.rings).toHaveLength(4);
    expect(m.rings[0]).toEqual(square(0.5, 0.5, 0.25));
    expect(m.rings[3]).toEqual(square(0.5, 0.65, 0.05));
    expect(m.strokes).toEqual([]);
    expect(m.invert).toBe(false);
    expect(m.feather).toBeGreaterThan(0);
  });

  it("leaves out a hole that has too few points", () => {
    const m = facePolygon(face({ mouth: [] }));
    expect(m.rings).toHaveLength(3);
  });
});
