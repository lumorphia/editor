import {
  LOCAL_PRESETS,
  type AdjustV1,
  type GeometryV1,
  type LocalAdjustV2,
  type LocalAdjustment,
} from "@prismtone/shared/recipe";

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

/** 部分補正の項目名 (#109)。全体と同じ名前に、シャープと美肌を足す */
export const LOCAL_ADJUST_LABELS: Readonly<Record<keyof LocalAdjustV2, string>> = {
  exposure: "露光量",
  contrast: "コントラスト",
  highlights: "ハイライト",
  shadows: "シャドウ",
  temperature: "色温度",
  tint: "色かぶり",
  saturation: "彩度",
  sharpen: "シャープ",
  smooth: "美肌",
};

const signed = (n: number, digits = 0) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

/** 履歴に残す操作名: 「露光量 +0.30」「コントラスト -20」 */
export function adjustLabel(key: keyof AdjustV1, value: number): string {
  return `${ADJUST_LABELS[key]} ${key === "exposure" ? signed(value, 2) : signed(value)}`;
}

/** 部分補正の操作名: 「部分補正: 露光量 +0.30」 */
export function localAdjustLabel(key: keyof LocalAdjustV2, value: number): string {
  const v = key === "exposure" ? signed(value, 2) : signed(value);
  return `部分補正: ${LOCAL_ADJUST_LABELS[key]} ${v}`;
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

/**
 * 投稿詳細の「編集レシピ」に出す部分補正の要約: 「4 件 (瞳強調 ×2、美肌、その他 1)」。
 * プリセットの並び順で数え、プリセット無しは「その他」。無ければ null
 */
export function localAdjustmentsSummary(list: readonly LocalAdjustment[]): string | null {
  if (list.length === 0) return null;
  const parts = LOCAL_PRESETS.flatMap((preset) => {
    const n = list.filter((l) => l.presetId === preset.id).length;
    return n === 0 ? [] : [n === 1 ? preset.name : `${preset.name} ×${n}`];
  });
  const free = list.filter((l) => l.presetId === null).length;
  if (free > 0 && parts.length > 0) parts.push(`その他 ${free}`);
  const head = `${list.length} 件`;
  return parts.length === 0 ? head : `${head} (${parts.join("、")})`;
}
