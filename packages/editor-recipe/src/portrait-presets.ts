import {
  DEFAULT_LOCAL_ADJUST,
  type EditRecipe,
  type LocalAdjust,
  type LocalAdjustment,
} from "./schema.ts";

/**
 * 人物補正 (#175) のプリセット。1 人ぶんの「背景・人物・顔・瞳」の 4 役に対する部分補正の値と効果量。
 * 部分補正は groupId で束ね、役はマスクの形から決める (portraitRole)。レシピには結果の値だけが
 * 入るので、プリセットの定義が後から変わっても投稿済みの見え方は変わらない (04 §1.2 と同じ原則)。
 * 合成順は 背景 → 人物 → 顔 → 瞳 (後の方が上に掛かる)。
 */

export const PORTRAIT_ROLES = ["background", "person", "face", "eyes"] as const;
export type PortraitRole = (typeof PORTRAIT_ROLES)[number];

export const PORTRAIT_PRESET_IDS = ["natural", "bright", "dramatic", "soft", "eyes"] as const;
export type PortraitPresetId = (typeof PORTRAIT_PRESET_IDS)[number];

export type PortraitRoleSetting = { adjust: Partial<LocalAdjust>; amount: number };

export type PortraitPreset = {
  id: PortraitPresetId;
  name: string;
  hint: string;
  roles: Record<PortraitRole, PortraitRoleSetting>;
};

const eyesLight: PortraitRoleSetting = {
  adjust: { exposure: 0.3, saturation: 15, contrast: 10, sharpen: 30 },
  amount: 70,
};

// 数値は実画像で調整する。空間効果は背景・人物・顔の役に分け、1 パスに重い効果を重ねすぎない。
export const PORTRAIT_PRESETS: readonly PortraitPreset[] = Object.freeze([
  {
    id: "natural",
    name: "ナチュラル",
    hint: "顔を少し明るく、美肌と瞳強調を弱く。背景はわずかに落とす",
    roles: {
      background: {
        adjust: { exposure: -0.15, saturation: -10, contrast: -5, blur: 3, vignette: 10 },
        amount: 60,
      },
      person: { adjust: { shadows: 15, contrast: 5, sharpen: 10, clarity: 10 }, amount: 60 },
      face: { adjust: { exposure: 0.15, temperature: 5, smooth: 25, bloom: 8 }, amount: 80 },
      eyes: eyesLight,
    },
  },
  {
    id: "bright",
    name: "明るく",
    hint: "顔と人物の露光・シャドウを持ち上げる",
    roles: {
      background: { adjust: { exposure: -0.05, blur: 2, vignette: 5 }, amount: 40 },
      person: { adjust: { exposure: 0.2, shadows: 30, clarity: 5 }, amount: 80 },
      face: { adjust: { exposure: 0.35, shadows: 20, smooth: 20, bloom: 12 }, amount: 90 },
      eyes: eyesLight,
    },
  },
  {
    id: "dramatic",
    name: "ドラマチック",
    hint: "人物のコントラストを上げ、背景を暗く沈める",
    roles: {
      background: {
        adjust: { exposure: -0.5, saturation: -25, contrast: -10, blur: 4, vignette: 30 },
        amount: 90,
      },
      person: { adjust: { contrast: 20, shadows: -10, sharpen: 20, clarity: 35 }, amount: 90 },
      face: { adjust: { contrast: 10, smooth: 15 }, amount: 80 },
      eyes: { adjust: { contrast: 20, sharpen: 40, saturation: 10, bloom: 5 }, amount: 80 },
    },
  },
  {
    id: "soft",
    name: "やわらか",
    hint: "美肌を強めに、コントラストを抑えてやわらかく",
    roles: {
      background: {
        adjust: { contrast: -20, saturation: -10, blur: 6, vignette: 15 },
        amount: 70,
      },
      person: { adjust: { contrast: -10, highlights: -10 }, amount: 60 },
      face: {
        adjust: { smooth: 45, exposure: 0.1, temperature: 8, bloom: 20, clarity: -20 },
        amount: 90,
      },
      eyes: { adjust: { exposure: 0.2, sharpen: 10 }, amount: 50 },
    },
  },
  {
    id: "eyes",
    name: "瞳くっきり",
    hint: "両目の露光・彩度・シャープを中心に。他は控えめ",
    roles: {
      background: { adjust: { exposure: -0.1, blur: 2, vignette: 10 }, amount: 40 },
      person: { adjust: { sharpen: 10, clarity: 15 }, amount: 40 },
      face: { adjust: { smooth: 10 }, amount: 40 },
      eyes: {
        adjust: { exposure: 0.4, saturation: 25, contrast: 20, sharpen: 50, bloom: 8, clarity: 20 },
        amount: 100,
      },
    },
  },
]);

export function findPortraitPreset(id: string): PortraitPreset | undefined {
  return PORTRAIT_PRESETS.find((p) => p.id === id);
}

/** 部分補正の役をマスクの形から決める。反転したビットマップ = 背景、ビットマップ = 人物、多角形 = 顔、楕円 = 瞳 */
export function portraitRole(local: LocalAdjustment): PortraitRole {
  switch (local.mask.kind) {
    case "bitmap":
      return local.mask.invert ? "background" : "person";
    case "polygon":
      return "face";
    case "ellipse":
      return "eyes";
    case "brush":
      return "person";
  }
}

const roleAmount = (preset: PortraitPreset, role: PortraitRole, effect: number) =>
  Math.round((preset.roles[role].amount * effect) / 100);

/** グループの部分補正にプリセットを当てた新しいレシピ。effect は効果量 0..100。元は変更しない */
export function applyPortraitPreset(
  recipe: EditRecipe,
  groupId: string,
  preset: PortraitPreset,
  effect: number,
): EditRecipe {
  return {
    ...recipe,
    localAdjustments: recipe.localAdjustments.map((l) => {
      if (l.groupId !== groupId) return l;
      const role = portraitRole(l);
      return {
        ...l,
        adjust: { ...DEFAULT_LOCAL_ADJUST, ...preset.roles[role].adjust },
        amount: roleAmount(preset, role, effect),
      };
    }),
  };
}

/** グループの効果量だけを変えた新しいレシピ (役ごとのプリセットの効果量 × effect / 100) */
export function scalePortraitAmount(
  recipe: EditRecipe,
  groupId: string,
  preset: PortraitPreset,
  effect: number,
): EditRecipe {
  return {
    ...recipe,
    localAdjustments: recipe.localAdjustments.map((l) =>
      l.groupId === groupId ? { ...l, amount: roleAmount(preset, portraitRole(l), effect) } : l,
    ),
  };
}

/** グループの効果量 (0..100) を読み戻す。役の中で効果量の基準が最大のものから逆算する */
export function portraitAmount(
  recipe: EditRecipe,
  groupId: string,
  preset: PortraitPreset,
): number {
  let best: { base: number; amount: number } | null = null;
  for (const l of recipe.localAdjustments) {
    if (l.groupId !== groupId) continue;
    const base = preset.roles[portraitRole(l)].amount;
    if (base > 0 && (!best || base > best.base)) best = { base, amount: l.amount };
  }
  if (!best) return 100;
  return Math.min(100, Math.round((best.amount / best.base) * 100));
}
