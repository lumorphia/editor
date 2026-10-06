import type { EllipseMaskV2, PolygonMaskV3 } from "@lumorphia/editor-recipe";

/**
 * 顔検出 (face.worker.ts) の結果から部分補正のマスクを組む純関数 (#176、ADR-0025)。
 * 座標は幾何を掛ける前の画像の正規化座標 (レシピのマスクと同じ)。
 */

export type NormalizedPoint = { x: number; y: number };

export type Iris = {
  cx: number;
  cy: number;
  /** 半径。rx は画像の幅、ry は高さに対する比 (楕円マスクと同じ) */
  rx: number;
  ry: number;
};

export type FaceResult = {
  /** 顔の輪郭の外接矩形 [x0, y0, x1, y1] */
  bbox: [number, number, number, number];
  /** 顔の輪郭 (36 点)。多角形の外周になる */
  oval: NormalizedPoint[];
  leftEye: NormalizedPoint[];
  rightEye: NormalizedPoint[];
  /** 唇の外側 */
  mouth: NormalizedPoint[];
  leftIris: Iris;
  rightIris: Iris;
  /** blendshape の eyeBlinkLeft / eyeBlinkRight (0..1)。無ければ null */
  blink: { left: number | null; right: number | null };
};

/** これ以上なら目を閉じているとみなして瞳は置かない */
export const BLINK_CLOSED = 0.5;
/** 虹彩に対する円形マスクの半径の比。虹彩より少し広く取って縁を柔らかくする */
const IRIS_SCALE = 1.3;
const IRIS_FEATHER = 0.5;
/** 顔の多角形のぼかし (0..1、長辺の 5% まで)。輪郭で補正が段にならない程度 */
const FACE_FEATHER = 0.2;

/** 一番大きい顔 (高さで比べる)。無ければ null */
export function pickMainFace(faces: readonly FaceResult[]): FaceResult | null {
  let best: FaceResult | null = null;
  for (const f of faces) {
    if (!best || f.bbox[3] - f.bbox[1] > best.bbox[3] - best.bbox[1]) best = f;
  }
  return best;
}

const irisEllipse = (iris: Iris): EllipseMaskV2 => ({
  kind: "ellipse",
  cx: iris.cx,
  cy: iris.cy,
  rx: iris.rx * IRIS_SCALE,
  ry: iris.ry * IRIS_SCALE,
  rotation: 0,
  feather: IRIS_FEATHER,
  invert: false,
});

/** 開いている目の虹彩に円形マスクを置く (左、右の順)。閉じている目は飛ばす */
export function irisEllipses(face: FaceResult): EllipseMaskV2[] {
  const open = (blink: number | null) => blink === null || blink < BLINK_CLOSED;
  return [
    ...(open(face.blink.left) ? [irisEllipse(face.leftIris)] : []),
    ...(open(face.blink.right) ? [irisEllipse(face.rightIris)] : []),
  ];
}

/** 顔の輪郭を外周、目と口を穴にした多角形 (美肌用)。点が足りない穴は入れない */
export function facePolygon(face: FaceResult): PolygonMaskV3 {
  const holes = [face.leftEye, face.rightEye, face.mouth].filter((ring) => ring.length >= 3);
  return {
    kind: "polygon",
    rings: [face.oval, ...holes],
    strokes: [],
    feather: FACE_FEATHER,
    invert: false,
  };
}
