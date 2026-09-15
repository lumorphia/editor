import type { AdjustV1, GeometryV1 } from "@prismtone/shared/recipe";

/** 補正項目の表示名。AdjustPanel と履歴の操作名で共有する */
export const ADJUST_LABELS: Readonly<Record<keyof AdjustV1, string>> = {
  exposure: "露光量",
  contrast: "コントラスト",
  highlights: "ハイライト",
  shadows: "シャドウ",
  temperature: "色温度",
  tint: "色かぶり",
  vibrance: "自然な彩度",
  saturation: "彩度",
};

const signed = (n: number, digits = 0) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

/** 履歴に残す操作名: 「露光量 +0.30」「コントラスト -20」 */
export function adjustLabel(key: keyof AdjustV1, value: number): string {
  return `${ADJUST_LABELS[key]} ${key === "exposure" ? signed(value, 2) : signed(value)}`;
}

/** 幾何の操作名: 変えた項目から決める。複数なら先頭だけ */
export function geometryLabel(patch: Partial<GeometryV1>): string {
  if (patch.rotation !== undefined) return `回転 ${patch.rotation}°`;
  if (patch.straighten !== undefined) return `水平 ${signed(patch.straighten, 1)}°`;
  if (patch.flipH !== undefined) return patch.flipH ? "左右反転" : "反転を戻す";
  if (patch.aspect !== undefined) return patch.aspect ? `縦横比 ${patch.aspect}` : "縦横比を解除";
  if (patch.crop !== undefined) return patch.crop ? "トリミング" : "トリミングを解除";
  return "幾何の変更";
}
