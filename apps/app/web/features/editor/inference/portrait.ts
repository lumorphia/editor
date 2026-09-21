import {
  DEFAULT_LOCAL_ADJUST,
  type BitmapMaskV3,
  type PortraitPreset,
  type PortraitRole,
} from "@prismtone/shared/recipe";
import type { AutoLocalItem } from "../state.ts";
import { facePolygon, irisEllipses, type FaceResult } from "./face-masks.ts";
import type { NormalizedPoint } from "./face-masks.ts";

/**
 * 人物補正 (#175) の部分補正の組み立て (純関数)。顔検出と人物の切り抜きから、
 * 背景 → 人物 → 顔 → 瞳 の順に部分補正を作る (後の方が上に掛かる)。
 */

export const PORTRAIT_FULL =
  "部分補正の上限 (12 件) に届くので置けません。不要な部分補正を削除してください";

export const PORTRAIT_ROLE_NAMES: Record<PortraitRole, string> = {
  background: "背景",
  person: "人物",
  face: "顔",
  eyes: "瞳",
};

/** SAM に渡すタップ位置: 顔の外接矩形の中心 (人物全体のマスクは index 0) */
export function faceCenter(face: FaceResult): NormalizedPoint {
  return { x: (face.bbox[0] + face.bbox[2]) / 2, y: (face.bbox[1] + face.bbox[3]) / 2 };
}

export function buildPortraitItems(
  face: FaceResult,
  person: BitmapMaskV3,
  preset: PortraitPreset,
  effect: number,
): AutoLocalItem[] {
  const role = (r: PortraitRole) => ({
    adjust: { ...DEFAULT_LOCAL_ADJUST, ...preset.roles[r].adjust },
    amount: Math.round((preset.roles[r].amount * effect) / 100),
  });
  const eyes = irisEllipses(face);
  const openEyes = [
    ...(face.blink.left === null || face.blink.left < 0.5 ? ["左"] : []),
    ...(face.blink.right === null || face.blink.right < 0.5 ? ["右"] : []),
  ];
  return [
    {
      name: PORTRAIT_ROLE_NAMES.background,
      presetId: null,
      mask: { ...person, invert: true },
      ...role("background"),
    },
    { name: PORTRAIT_ROLE_NAMES.person, presetId: null, mask: person, ...role("person") },
    { name: PORTRAIT_ROLE_NAMES.face, presetId: "skin", mask: facePolygon(face), ...role("face") },
    ...eyes.map((mask, i) => ({
      name: `${PORTRAIT_ROLE_NAMES.eyes} (${openEyes[i]})`,
      presetId: "eyes" as const,
      mask,
      ...role("eyes"),
    })),
  ];
}
