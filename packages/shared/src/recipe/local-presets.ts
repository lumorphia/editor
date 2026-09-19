import {
  DEFAULT_LOCAL_ADJUST,
  type LocalAdjustV2,
  type LocalAdjustmentV2,
  type LocalPresetId,
} from "./schema.ts";

export type LocalPreset = {
  id: LocalPresetId;
  name: string;
  /** 何に使うかの一言 (UI のツールチップ) */
  hint: string;
  adjust: Partial<LocalAdjustV2>;
  amount: number;
};

// 部分補正のプリセット (#109)。数値は実画像で調整する。docs/design/04-edit-recipe.md §2.1
export const LOCAL_PRESETS: readonly LocalPreset[] = Object.freeze([
  {
    id: "eyes",
    name: "瞳強調",
    hint: "円形マスクを左右の目に置く。露光・彩度・コントラスト・シャープを弱く上げる",
    adjust: { exposure: 0.3, saturation: 15, contrast: 10, sharpen: 30 },
    amount: 100,
  },
  {
    id: "skin",
    name: "美肌",
    hint: "顔にマスクを置く。輪郭を残して滑らかにし、露光と色温度を弱く補正する",
    adjust: { smooth: 40, exposure: 0.15, temperature: 5 },
    amount: 100,
  },
  {
    id: "gear",
    name: "装備強調",
    hint: "見せたい装備をブラシで塗る。暗部を持ち上げ、質感と色を整える",
    adjust: { shadows: 30, contrast: 10, sharpen: 25, saturation: 5 },
    amount: 100,
  },
]);

export function findLocalPreset(id: string): LocalPreset | undefined {
  return LOCAL_PRESETS.find((p) => p.id === id);
}

/**
 * 部分補正にプリセットを適用した新しい部分補正を返す。元は変更しない。
 * adjust と amount を上書きし、マスクには触れない。
 */
export function applyLocalPreset(local: LocalAdjustmentV2, preset: LocalPreset): LocalAdjustmentV2 {
  return {
    ...local,
    presetId: preset.id,
    adjust: { ...DEFAULT_LOCAL_ADJUST, ...preset.adjust },
    amount: preset.amount,
  };
}
