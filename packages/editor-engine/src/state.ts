import {
  DEFAULT_BRUSH_MASK,
  DEFAULT_ELLIPSE_MASK,
  DEFAULT_LOCAL_ADJUSTMENT,
  DEFAULT_RECIPE,
  MAX_BRUSH_STROKES,
  MAX_LOCAL_ADJUSTMENTS,
  applyLocalPreset,
  applyPortraitPreset,
  applyPreset,
  findLocalPreset,
  findPortraitPreset,
  findPreset,
  portraitAmount,
  scalePortraitAmount,
  type PortraitPresetId,
  type AdjustV1,
  type BrushStrokeV2,
  type EditRecipe,
  type GeometryV1,
  type LocalAdjust,
  type LocalAdjustment,
  type LocalPresetId,
  type Mask,
} from "@lumorphia/editor-recipe";
import type { SegmentSelectionKind } from "./inference/auto-select.ts";
import type { FaceResult } from "./inference/face-masks.ts";
import { commit, createHistory, preview, redo, undo, type History } from "./history.ts";
import { adjustLabel, geometryLabel, localAdjustLabel } from "@lumorphia/editor-recipe/labels";
import type { LoadedImage } from "./load-image.ts";

export type Tool = "adjust" | "geometry" | "presets" | "local" | "portrait";

/** 円形マスクの初期配置 (今見えている範囲の中央に置くため) */
export type EllipsePlacement = { cx: number; cy: number; rx: number; ry: number };

/** ブラウザ内の認識 (#176) の進み具合。loading はモデルの取得、running は検出中 */
export type InferenceStatus = {
  readonly status: "idle" | "loading" | "running";
  readonly progress: { loaded: number; total: number } | null;
};

/** 自動選択で一度に足す部分補正 */
export type AutoLocalItem = {
  readonly mask: Mask;
  /** null ならプリセット無し (キャラクター / 背景の範囲だけ) */
  readonly presetId: LocalPresetId | null;
  readonly name?: string | undefined;
  /** 与えればプリセットの値の代わりに使う (人物補正の役ごとの値、#175) */
  readonly adjust?: LocalAdjust | undefined;
  readonly amount?: number | undefined;
};

export type BrushSettings = {
  readonly mode: BrushStrokeV2["mode"];
  /** 直径。画像の長辺に対する比 */
  readonly size: number;
  readonly hardness: number;
};

export type EditorState = {
  readonly source: LoadedImage | null;
  readonly draftId: string | null;
  readonly history: History;
  /** スライダーのドラッグ開始時点のレシピ。commit 時にこれを履歴に積む。 */
  readonly dragBase: EditRecipe | null;
  readonly ui: {
    readonly tool: Tool;
    readonly comparing: boolean;
    /** 比較スライダーの境界 (0..1)。左が元画像、右が現像後 */
    readonly comparePosition: number;
    readonly cropping: boolean;
    readonly exporting: boolean;
    readonly error: string | null;
    /** 部分補正 (#109) の UI 状態。selectedId はレシピに無い id を指すことがある (undo 後) ので、使う側で引き直す */
    readonly local: {
      readonly selectedId: string | null;
      /** 「範囲を表示」を常時オンにするか。オフでも描いている間 (drawing) は見せる */
      readonly showMask: boolean;
      /** ブラシで塗っている・円形をドラッグしている間 */
      readonly drawing: boolean;
      /** 円形の輪郭とハンドルを出すか。仕上がりを見たいときにオフにする (オフの間は動かせない) */
      readonly showHandles: boolean;
      /** ブラシの設定。ストロークごとにレシピへ写す */
      readonly brush: BrushSettings;
      readonly inference: InferenceStatus;
      /** 自動選択の結果の一言 (失敗、目を閉じている、など)。次の操作で消える */
      readonly notice: string | null;
      /** タップで切る (#177) 待ち。null なら通常 */
      readonly tap: SegmentSelectionKind | null;
      /** 直近のタップの 3 段の候補。粒度の切り替えに使う。その部分補正が消えたら捨てる */
      readonly segment: { readonly localId: string; readonly masks: readonly Mask[] } | null;
    };
    /** 人物補正 (#175)。検出した顔と選んだ人物、今のグループとプリセット */
    readonly portrait: {
      /** null は未検出。空配列は検出したが顔が無い */
      readonly faces: readonly FaceResult[] | null;
      readonly selectedFace: number;
      /** 直近に当てたグループ。レシピに残っているかは activePortraitGroup で見る (undo / redo で消えたり戻ったりする) */
      readonly groupId: string | null;
      readonly presetId: PortraitPresetId | null;
    };
  };
};

export type EditorAction =
  | { type: "image/loaded"; image: LoadedImage; draftId: string; recipe?: EditRecipe }
  | { type: "image/failed"; error: string }
  | { type: "adjust/preview"; key: keyof AdjustV1; value: number }
  | { type: "adjust/commit"; key: keyof AdjustV1; value: number }
  | { type: "geometry/commit"; patch: Partial<GeometryV1> }
  | { type: "geometry/preview"; patch: Partial<GeometryV1> }
  | { type: "preset/apply"; id: string }
  | { type: "recipe/reset" }
  | {
      type: "local/add";
      kind: "ellipse" | "brush";
      presetId?: LocalPresetId | undefined;
      /** 円形の初期位置 (画像の正規化座標)。省くと画像の中央 */
      at?: EllipsePlacement | undefined;
    }
  | {
      /** 自動選択 (#176 / #177): 複数の部分補正を 1 手で足す。入り切らなければ何もしない */
      type: "local/add-auto";
      items: readonly AutoLocalItem[];
      label: string;
      groupId?: string | undefined;
      /** タップの 3 段の候補 (#177)。先頭の部分補正に紐づけて粒度を切り替えられるようにする */
      candidates?: readonly Mask[] | undefined;
    }
  | { type: "local/remove"; id: string }
  | { type: "local/select"; id: string | null }
  | { type: "local/toggle-visible"; id: string }
  | { type: "local/adjust-preview"; id: string; key: keyof LocalAdjust; value: number }
  | { type: "local/adjust-commit"; id: string; key: keyof LocalAdjust; value: number }
  | { type: "local/amount-preview"; id: string; value: number }
  | { type: "local/amount-commit"; id: string; value: number }
  | { type: "local/mask-preview"; id: string; mask: Mask }
  | { type: "local/mask-commit"; id: string; mask: Mask; label?: string | undefined }
  | { type: "local/preset"; id: string; presetId: LocalPresetId }
  | { type: "local/stroke-commit"; id: string; stroke: BrushStrokeV2 }
  | { type: "ui/show-mask"; on: boolean }
  | { type: "ui/drawing"; on: boolean }
  | { type: "ui/show-handles"; on: boolean }
  | { type: "ui/brush"; brush: BrushSettings }
  | { type: "ui/inference"; inference: InferenceStatus }
  | { type: "ui/notice"; notice: string | null }
  | { type: "portrait/faces"; faces: readonly FaceResult[] }
  | { type: "portrait/select-face"; index: number }
  | {
      /** 検出と切り抜きの結果を 1 手で足し、グループとして覚える */
      type: "portrait/apply";
      items: readonly AutoLocalItem[];
      presetId: PortraitPresetId;
    }
  | { type: "portrait/preset"; presetId: PortraitPresetId }
  | { type: "portrait/amount-preview"; value: number }
  | { type: "portrait/amount-commit"; value: number }
  | { type: "ui/tap"; tap: SegmentSelectionKind | null }
  | { type: "ui/segment"; segment: EditorState["ui"]["local"]["segment"] }
  | { type: "history/undo" }
  | { type: "history/redo" }
  | { type: "ui/tool"; tool: Tool }
  | { type: "ui/compare"; on: boolean }
  | { type: "ui/compare-position"; position: number }
  | { type: "ui/cropping"; on: boolean }
  | { type: "ui/exporting"; on: boolean }
  | { type: "ui/error"; error: string | null };

export const initialEditorState: EditorState = {
  source: null,
  draftId: null,
  history: createHistory(DEFAULT_RECIPE),
  dragBase: null,
  ui: {
    tool: "presets",
    comparing: false,
    comparePosition: 0.5,
    cropping: false,
    exporting: false,
    error: null,
    local: {
      selectedId: null,
      showMask: false,
      drawing: false,
      showHandles: true,
      brush: { mode: "add", size: 0.08, hardness: 0.7 },
      inference: { status: "idle", progress: null },
      notice: null,
      tap: null,
      segment: null,
    },
    portrait: { faces: null, selectedFace: 0, groupId: null, presetId: null },
  },
};

const DEFAULT_PORTRAIT_UI = initialEditorState.ui.portrait;

const withAdjust = (r: EditRecipe, key: keyof AdjustV1, value: number): EditRecipe => ({
  ...r,
  presetId: null,
  adjust: { ...r.adjust, [key]: value },
});

const withGeometry = (r: EditRecipe, patch: Partial<GeometryV1>): EditRecipe => ({
  ...r,
  geometry: { ...r.geometry, ...patch },
});

/** 指定 id の部分補正だけ差し替えたレシピ。無ければ null */
function withLocal(
  r: EditRecipe,
  id: string,
  update: (local: LocalAdjustment) => LocalAdjustment,
): EditRecipe | null {
  const index = r.localAdjustments.findIndex((l) => l.id === id);
  if (index < 0) return null;
  return {
    ...r,
    localAdjustments: r.localAdjustments.map((l, i) => (i === index ? update(l) : l)),
  };
}

/** 手で値を変えたらプリセットの表示は外す (全体の補正と同じ原則) */
const withLocalValue =
  (key: keyof LocalAdjust, value: number) =>
  (l: LocalAdjustment): LocalAdjustment => ({
    ...l,
    presetId: null,
    adjust: { ...l.adjust, [key]: value },
  });

const withLocalAmount =
  (value: number) =>
  (l: LocalAdjustment): LocalAdjustment => ({ ...l, amount: value });

const withLocalMask =
  (mask: Mask) =>
  (l: LocalAdjustment): LocalAdjustment => ({ ...l, mask });

let localSeq = 0;
/** レシピ内で一意ならよい。時刻 + 連番で、下書きから戻したものとぶつからないようにする */
function newLocalId(): string {
  localSeq = (localSeq + 1) % 1000;
  return `l${Date.now().toString(36)}${localSeq.toString(36)}`;
}
function newGroupId(): string {
  return `p${Date.now().toString(36)}${(localSeq++ % 1000).toString(36)}`;
}

/** 自動選択の部分補正を組み立てる (local/add-auto と portrait/apply で共通) */
function buildAutoLocals(
  items: readonly AutoLocalItem[],
  groupId: string | null,
): LocalAdjustment[] {
  return items.map((item) => {
    const preset = item.presetId ? findLocalPreset(item.presetId) : undefined;
    const base: LocalAdjustment = {
      ...DEFAULT_LOCAL_ADJUSTMENT,
      id: newLocalId(),
      name: item.name ?? null,
      groupId,
      mask: item.mask,
    };
    const withPreset = preset ? applyLocalPreset(base, preset) : base;
    return {
      ...withPreset,
      ...(item.adjust ? { adjust: item.adjust } : {}),
      ...(item.amount !== undefined ? { amount: item.amount } : {}),
    };
  });
}

/** ドラッグ中の preview / 終了時の commit を部分補正に適用する共通処理 */
function localPreview(
  state: EditorState,
  id: string,
  update: (l: LocalAdjustment) => LocalAdjustment,
): EditorState {
  const next = withLocal(state.history.present, id, update);
  if (!next) return state;
  return {
    ...state,
    dragBase: state.dragBase ?? state.history.present,
    history: preview(state.history, next),
  };
}

function localCommit(
  state: EditorState,
  id: string,
  update: (l: LocalAdjustment) => LocalAdjustment,
  label: string,
): EditorState {
  const base = state.dragBase ?? state.history.present;
  const next = withLocal(base, id, update);
  if (!next) return state;
  return {
    ...state,
    dragBase: null,
    history: commit({ ...state.history, present: base }, next, label),
  };
}

function selectLocal(state: EditorState, selectedId: string | null): EditorState {
  return { ...state, ui: { ...state.ui, local: { ...state.ui.local, selectedId } } };
}

function withNotice(state: EditorState, notice: string | null): EditorState {
  if (state.ui.local.notice === notice) return state;
  return { ...state, ui: { ...state.ui, local: { ...state.ui.local, notice } } };
}

/** 選択中の id・切り抜きの候補・人物補正のグループがレシピから消えていたら外す (undo / 削除 / リセット後) */
function reconcileSelection(state: EditorState): EditorState {
  const { selectedId, segment } = state.ui.local;
  const list = state.history.present.localAdjustments;
  const has = (id: string) => list.some((l) => l.id === id);
  let next = state;
  if (selectedId && !has(selectedId)) next = selectLocal(next, null);
  if (segment && !has(segment.localId)) {
    next = { ...next, ui: { ...next.ui, local: { ...next.ui.local, segment: null } } };
  }
  return next;
}

/** 人物補正のグループが今のレシピにあるか。undo で消え、redo で戻るので、ui の groupId は消さずにここで見る */
export function activePortraitGroup(state: EditorState): string | null {
  const { groupId } = state.ui.portrait;
  if (!groupId) return null;
  return state.history.present.localAdjustments.some((l) => l.groupId === groupId) ? groupId : null;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { history } = state;
  switch (action.type) {
    case "image/loaded":
      return {
        ...state,
        source: action.image,
        draftId: action.draftId,
        history: createHistory(action.recipe ?? DEFAULT_RECIPE),
        dragBase: null,
        ui: { ...state.ui, error: null, cropping: false, portrait: DEFAULT_PORTRAIT_UI },
      };
    case "image/failed":
      return { ...state, ui: { ...state.ui, error: action.error } };
    case "adjust/preview":
      return {
        ...state,
        dragBase: state.dragBase ?? history.present,
        history: preview(history, withAdjust(history.present, action.key, action.value)),
      };
    case "adjust/commit": {
      // ドラッグ中の preview は履歴に積まない。ドラッグ開始時点 (dragBase) を積む
      const base = state.dragBase ?? history.present;
      const next = withAdjust(base, action.key, action.value);
      return {
        ...state,
        dragBase: null,
        history: commit({ ...history, present: base }, next, adjustLabel(action.key, action.value)),
      };
    }
    case "geometry/preview":
      return {
        ...state,
        dragBase: state.dragBase ?? history.present,
        history: preview(history, withGeometry(history.present, action.patch)),
      };
    case "geometry/commit": {
      const base = state.dragBase ?? history.present;
      const next = withGeometry(base, action.patch);
      return {
        ...state,
        dragBase: null,
        history: commit({ ...history, present: base }, next, geometryLabel(action.patch)),
      };
    }
    case "preset/apply": {
      const preset = findPreset(action.id);
      if (!preset) return state;
      return {
        ...state,
        history: commit(
          history,
          applyPreset(history.present, preset),
          `プリセット: ${preset.name}`,
        ),
      };
    }
    case "recipe/reset":
      return reconcileSelection({
        ...state,
        history: commit(history, DEFAULT_RECIPE, "全リセット"),
      });
    case "history/undo":
      return reconcileSelection({ ...state, history: undo(history) });
    case "history/redo":
      return reconcileSelection({ ...state, history: redo(history) });
    case "local/add": {
      if (history.present.localAdjustments.length >= MAX_LOCAL_ADJUSTMENTS) return state;
      const preset = action.presetId ? findLocalPreset(action.presetId) : undefined;
      const base: LocalAdjustment = {
        ...DEFAULT_LOCAL_ADJUSTMENT,
        id: newLocalId(),
        mask:
          action.kind === "ellipse"
            ? { ...DEFAULT_ELLIPSE_MASK, ...action.at }
            : DEFAULT_BRUSH_MASK,
      };
      const local = preset ? applyLocalPreset(base, preset) : base;
      const next = {
        ...history.present,
        localAdjustments: [...history.present.localAdjustments, local],
      };
      const label = preset ? `部分補正を追加: ${preset.name}` : "部分補正を追加";
      return {
        ...selectLocal(state, local.id),
        history: commit(history, next, label),
        ui: {
          ...state.ui,
          tool: "local",
          local: { ...state.ui.local, selectedId: local.id, notice: null },
        },
      };
    }
    case "local/add-auto": {
      const room = MAX_LOCAL_ADJUSTMENTS - history.present.localAdjustments.length;
      if (action.items.length === 0 || action.items.length > room) return state;
      const added = buildAutoLocals(action.items, action.groupId ?? null);
      const next = {
        ...history.present,
        localAdjustments: [...history.present.localAdjustments, ...added],
      };
      return {
        ...state,
        history: commit(history, next, action.label),
        ui: {
          ...state.ui,
          tool: "local",
          local: {
            ...state.ui.local,
            selectedId: added[0]!.id,
            notice: null,
            tap: null,
            segment: action.candidates
              ? { localId: added[0]!.id, masks: action.candidates }
              : state.ui.local.segment,
          },
        },
      };
    }
    case "local/remove": {
      const list = history.present.localAdjustments;
      const index = list.findIndex((l) => l.id === action.id);
      if (index < 0) return state;
      const rest = list.filter((l) => l.id !== action.id);
      const next = { ...history.present, localAdjustments: rest };
      const neighbour = rest[Math.min(index, rest.length - 1)]?.id ?? null;
      return reconcileSelection(
        selectLocal(
          { ...state, history: commit(history, next, "部分補正を削除") },
          state.ui.local.selectedId === action.id ? neighbour : state.ui.local.selectedId,
        ),
      );
    }
    case "local/select":
      return selectLocal(state, action.id);
    case "local/toggle-visible": {
      const target = history.present.localAdjustments.find((l) => l.id === action.id);
      if (!target) return state;
      return localCommit(
        state,
        action.id,
        (l) => ({ ...l, visible: !l.visible }),
        target.visible ? "部分補正を隠す" : "部分補正を表示",
      );
    }
    case "local/adjust-preview":
      return localPreview(state, action.id, withLocalValue(action.key, action.value));
    case "local/adjust-commit":
      return localCommit(
        state,
        action.id,
        withLocalValue(action.key, action.value),
        localAdjustLabel(action.key, action.value),
      );
    case "local/amount-preview":
      return localPreview(state, action.id, withLocalAmount(action.value));
    case "local/amount-commit":
      return localCommit(state, action.id, withLocalAmount(action.value), `効果量 ${action.value}`);
    case "local/mask-preview":
      return localPreview(state, action.id, withLocalMask(action.mask));
    case "local/mask-commit":
      return localCommit(
        state,
        action.id,
        withLocalMask(action.mask),
        action.label ?? "マスクを動かす",
      );
    case "local/preset": {
      const preset = findLocalPreset(action.presetId);
      if (!preset) return state;
      return localCommit(
        state,
        action.id,
        (l) => applyLocalPreset(l, preset),
        `部分補正: ${preset.name}`,
      );
    }
    case "local/stroke-commit": {
      // ブラシ・多角形・ビットマップ (strokes を持つマスク) にストロークを足す。自動で置いたマスクもブラシで直せる
      const target = history.present.localAdjustments.find((l) => l.id === action.id);
      if (!target || target.mask.kind === "ellipse") return state;
      if (target.mask.strokes.length >= MAX_BRUSH_STROKES) return state;
      const mask = target.mask;
      return localCommit(
        state,
        action.id,
        (l) => ({ ...l, mask: { ...mask, strokes: [...mask.strokes, action.stroke] } }),
        action.stroke.mode === "add" ? "ブラシ" : "消しゴム",
      );
    }
    case "ui/brush":
      return { ...state, ui: { ...state.ui, local: { ...state.ui.local, brush: action.brush } } };
    case "ui/inference":
      return {
        ...state,
        ui: { ...state.ui, local: { ...state.ui.local, inference: action.inference } },
      };
    case "ui/notice":
      return withNotice(state, action.notice);
    case "portrait/faces":
      return {
        ...state,
        ui: {
          ...state.ui,
          portrait: { ...state.ui.portrait, faces: action.faces, selectedFace: 0 },
        },
      };
    case "portrait/select-face":
      return {
        ...state,
        ui: { ...state.ui, portrait: { ...state.ui.portrait, selectedFace: action.index } },
      };
    case "portrait/apply": {
      const room = MAX_LOCAL_ADJUSTMENTS - history.present.localAdjustments.length;
      const preset = findPortraitPreset(action.presetId);
      if (!preset || action.items.length === 0 || action.items.length > room) return state;
      const groupId = newGroupId();
      const next = {
        ...history.present,
        localAdjustments: [
          ...history.present.localAdjustments,
          ...buildAutoLocals(action.items, groupId),
        ],
      };
      return {
        ...state,
        history: commit(history, next, `人物補正: ${preset.name}`),
        ui: {
          ...state.ui,
          tool: "portrait",
          local: { ...state.ui.local, notice: null },
          portrait: { ...state.ui.portrait, groupId, presetId: action.presetId },
        },
      };
    }
    case "portrait/preset": {
      const groupId = activePortraitGroup(state);
      const { presetId } = state.ui.portrait;
      const preset = findPortraitPreset(action.presetId);
      const current = presetId ? findPortraitPreset(presetId) : undefined;
      if (!groupId || !preset || !current) return state;
      const effect = portraitAmount(history.present, groupId, current);
      return {
        ...state,
        history: commit(
          history,
          applyPortraitPreset(history.present, groupId, preset, effect),
          `人物補正: ${preset.name}`,
        ),
        ui: { ...state.ui, portrait: { ...state.ui.portrait, presetId: action.presetId } },
      };
    }
    case "portrait/amount-preview": {
      const groupId = activePortraitGroup(state);
      const { presetId } = state.ui.portrait;
      const preset = presetId ? findPortraitPreset(presetId) : undefined;
      if (!groupId || !preset) return state;
      return {
        ...state,
        dragBase: state.dragBase ?? history.present,
        history: preview(
          history,
          scalePortraitAmount(history.present, groupId, preset, action.value),
        ),
      };
    }
    case "portrait/amount-commit": {
      const groupId = activePortraitGroup(state);
      const { presetId } = state.ui.portrait;
      const preset = presetId ? findPortraitPreset(presetId) : undefined;
      if (!groupId || !preset) return state;
      const base = state.dragBase ?? history.present;
      return {
        ...state,
        dragBase: null,
        history: commit(
          { ...history, present: base },
          scalePortraitAmount(base, groupId, preset, action.value),
          `人物補正の効果量 ${action.value}`,
        ),
      };
    }
    case "ui/tap":
      return { ...state, ui: { ...state.ui, local: { ...state.ui.local, tap: action.tap } } };
    case "ui/segment":
      return {
        ...state,
        ui: { ...state.ui, local: { ...state.ui.local, segment: action.segment } },
      };
    case "ui/show-handles":
      return {
        ...state,
        ui: { ...state.ui, local: { ...state.ui.local, showHandles: action.on } },
      };
    case "ui/drawing":
      return { ...state, ui: { ...state.ui, local: { ...state.ui.local, drawing: action.on } } };
    case "ui/show-mask":
      return { ...state, ui: { ...state.ui, local: { ...state.ui.local, showMask: action.on } } };
    case "ui/tool":
      return { ...state, ui: { ...state.ui, tool: action.tool } };
    case "ui/compare":
      return { ...state, ui: { ...state.ui, comparing: action.on } };
    case "ui/compare-position":
      return {
        ...state,
        ui: { ...state.ui, comparePosition: Math.min(1, Math.max(0, action.position)) },
      };
    case "ui/cropping":
      // 切り抜き中は座標が合わないので比較を切る (docs: #40)
      return { ...state, ui: { ...state.ui, cropping: action.on, comparing: false } };
    case "ui/exporting":
      return { ...state, ui: { ...state.ui, exporting: action.on } };
    case "ui/error":
      return { ...state, ui: { ...state.ui, error: action.error } };
  }
}
