import type { BitmapMaskV3, LocalPresetId } from "@lumorphia/editor-recipe";
import type { AutoLocalItem } from "../state.ts";
import { facePolygon, irisEllipses, pickMainFace, type FaceResult } from "./face-masks.ts";
import { GEAR_LEVEL, PERSON_LEVEL } from "./segment-masks.ts";

/**
 * 自動選択 (#176) の計画: 検出結果から「何を足すか」と「利用者に伝える一言」を決める純関数。
 * 文言は理由を断定しない (#175): 横顔・種族・小ささのどれで外れたかは分からない
 */

export const AUTO_SELECT_FAILED = "自動選択できませんでした。手動で範囲を指定できます";
export const EYES_CLOSED = "目を閉じているようです。手動で範囲を指定できます";
export const ONE_EYE_CLOSED = "片方の目は閉じているようなので、開いている方だけに置きました";

export type FaceSelectionKind = Extract<LocalPresetId, "eyes" | "skin">;

export type SelectionPlan = {
  readonly items: readonly AutoLocalItem[];
  readonly label: string;
  readonly notice: string | null;
};

export function planFaceSelection(
  kind: FaceSelectionKind,
  faces: readonly FaceResult[],
): SelectionPlan {
  const face = pickMainFace(faces);
  if (!face) return { items: [], label: "", notice: AUTO_SELECT_FAILED };
  if (kind === "skin") {
    return {
      items: [{ presetId: "skin", mask: facePolygon(face) }],
      label: "美肌 (自動)",
      notice: null,
    };
  }
  const ellipses = irisEllipses(face);
  if (ellipses.length === 0) return { items: [], label: "", notice: EYES_CLOSED };
  return {
    items: ellipses.map((mask) => ({ presetId: "eyes", mask })),
    label: "瞳強調 (自動)",
    notice: ellipses.length === 1 ? ONE_EYE_CLOSED : null,
  };
}

/** タップで切る対象 (#177)。gear は装備強調、person / background はプリセット無しの範囲 */
export type SegmentSelectionKind = "gear" | "person" | "background";

export const SEGMENT_KIND_LABELS: Record<SegmentSelectionKind, string> = {
  gear: "装備強調 (自動)",
  person: "キャラクター",
  background: "背景",
};

/** SAM の 3 段のマスクから何を足すか。gear は index 1 (装備 1 点)、person / background は index 0 (全体) */
export function planSegmentSelection(
  kind: SegmentSelectionKind,
  masks: readonly BitmapMaskV3[],
): SelectionPlan {
  const level = kind === "gear" ? GEAR_LEVEL : PERSON_LEVEL;
  const mask = masks[level];
  if (!mask) return { items: [], label: "", notice: AUTO_SELECT_FAILED };
  if (kind === "gear") {
    return { items: [{ presetId: "gear", mask }], label: SEGMENT_KIND_LABELS.gear, notice: null };
  }
  const name = SEGMENT_KIND_LABELS[kind];
  return {
    items: [
      { presetId: null, name, mask: kind === "background" ? { ...mask, invert: true } : mask },
    ],
    label: `${name}を選択`,
    notice: null,
  };
}
