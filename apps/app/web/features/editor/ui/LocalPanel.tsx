import {
  LOCAL_PRESETS,
  MAX_LOCAL_ADJUSTMENTS,
  MAX_LOCAL_SMOOTH,
  type LocalAdjustV2,
  type LocalAdjustment,
  type LocalPresetId,
} from "@prismtone/shared/recipe";
import { LOCAL_ADJUST_LABELS } from "../labels.ts";
import type { BrushSettings, EditorState, InferenceStatus } from "../state.ts";
import type { SegmentSelectionKind } from "../inference/auto-select.ts";
import { SAM_LEVELS } from "../inference/segment-masks.ts";
import { Slider } from "./Slider.tsx";

type Props = {
  list: readonly LocalAdjustment[];
  selectedId: string | null;
  showMask: boolean;
  showHandles: boolean;
  brush: BrushSettings;
  inference: InferenceStatus;
  notice: string | null;
  /** タップ待ち (#177) と、直近のタップの 3 段の候補 */
  tap: SegmentSelectionKind | null;
  segment: EditorState["ui"]["local"]["segment"];
  onAdd: (kind: "ellipse" | "brush", presetId?: LocalPresetId) => void;
  /** 瞳・美肌は顔を検出して置く (#176)、装備・キャラクター・背景はタップで切る (#177)。無ければ手動の追加に落ちる */
  onAuto?: ((kind: "eyes" | "skin" | SegmentSelectionKind) => void) | undefined;
  onCancelTap?: (() => void) | undefined;
  /** 切り抜きの粒度を切り替える (segment の候補の index) */
  onSegmentLevel?: ((localId: string, index: number) => void) | undefined;
  onBrush: (brush: BrushSettings) => void;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onPreset: (id: string, presetId: LocalPresetId) => void;
  onAmountPreview: (id: string, value: number) => void;
  onAmountCommit: (id: string, value: number) => void;
  onAdjustPreview: (id: string, key: keyof LocalAdjustV2, value: number) => void;
  onAdjustCommit: (id: string, key: keyof LocalAdjustV2, value: number) => void;
  onShowMask: (on: boolean) => void;
  onShowHandles: (on: boolean) => void;
};

const ROWS: { key: keyof LocalAdjustV2; min: number; max: number; step: number; ev?: boolean }[] = [
  { key: "exposure", min: -5, max: 5, step: 0.05, ev: true },
  { key: "contrast", min: -100, max: 100, step: 1 },
  { key: "highlights", min: -100, max: 100, step: 1 },
  { key: "shadows", min: -100, max: 100, step: 1 },
  { key: "temperature", min: -100, max: 100, step: 1 },
  { key: "tint", min: -100, max: 100, step: 1 },
  { key: "saturation", min: -100, max: 100, step: 1 },
  { key: "sharpen", min: 0, max: 100, step: 1 },
  { key: "smooth", min: 0, max: MAX_LOCAL_SMOOTH, step: 1 },
];

const btn =
  "rounded border border-line-soft px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent";

const MASK_KIND_LABELS: Record<LocalAdjustment["mask"]["kind"], string> = {
  ellipse: "円形",
  brush: "ブラシ",
  polygon: "多角形",
  bitmap: "切り抜き",
};

/** 粒度の切り替えで下地だけ差し替えるので、反転やストロークが違っても同じ候補なら同じとみなす */
function isSameBitmap(a: LocalAdjustment["mask"], b: LocalAdjustment["mask"] | undefined): boolean {
  return a.kind === "bitmap" && b?.kind === "bitmap" && a.rle === b.rle;
}

function localName(l: LocalAdjustment, index: number): string {
  if (l.name) return l.name;
  const preset = LOCAL_PRESETS.find((p) => p.id === l.presetId);
  const kind = MASK_KIND_LABELS[l.mask.kind];
  return preset ? `${preset.name} (${kind})` : `部分補正 ${index + 1} (${kind})`;
}

/** 部分補正のパネル (#109): 一覧、追加 (円形 / ブラシ)、ブラシの設定、プリセット、効果量とスライダー */
export function LocalPanel(p: Props) {
  const selected = p.list.find((l) => l.id === p.selectedId) ?? null;
  const full = p.list.length >= MAX_LOCAL_ADJUSTMENTS;
  const busy = p.inference.status !== "idle";
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn}
          disabled={full}
          onClick={() => p.onAdd("ellipse")}
          data-testid="local-add-ellipse"
        >
          円形を追加
        </button>
        <button
          type="button"
          className={btn}
          disabled={full}
          onClick={() => p.onAdd("brush")}
          data-testid="local-add-brush"
        >
          ブラシを追加
        </button>
        <span className="text-xs text-ink-muted">
          {p.list.length} / {MAX_LOCAL_ADJUSTMENTS}
        </span>
        <span className="flex-1" />
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={p.showMask}
            onChange={(e) => p.onShowMask(e.currentTarget.checked)}
          />
          範囲を表示
        </label>
        <label
          className="flex items-center gap-1 text-xs text-ink-muted"
          title="円形の輪郭とハンドル。オフの間は動かせない"
        >
          <input
            type="checkbox"
            checked={p.showHandles}
            onChange={(e) => p.onShowHandles(e.currentTarget.checked)}
          />
          枠を表示
        </label>
      </div>
      {p.list.length === 0 ? (
        <p className="text-xs text-ink-muted">
          範囲を選んで、そこだけに補正を掛けます。「円形を追加」で始めるか、プリセットを選んでください。
        </p>
      ) : (
        <ul
          className="divide-y divide-line-soft rounded border border-line-soft"
          data-testid="local-list"
        >
          {p.list.map((l, i) => (
            <li
              key={l.id}
              className={
                "flex items-center gap-2 px-2 py-1 " +
                (l.id === p.selectedId ? "bg-surface-hover" : "")
              }
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                aria-pressed={l.id === p.selectedId}
                onClick={() => p.onSelect(l.id)}
              >
                {localName(l, i)}
              </button>
              <button
                type="button"
                className={btn}
                aria-pressed={l.visible}
                title={l.visible ? "隠す" : "表示する"}
                onClick={() => p.onToggleVisible(l.id)}
              >
                {l.visible ? "表示中" : "非表示"}
              </button>
              <button
                type="button"
                className={btn}
                aria-label={`${localName(l, i)} を削除`}
                onClick={() => p.onRemove(l.id)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && selected.mask.kind !== "ellipse" && (
        <div className="space-y-2 rounded border border-line-soft p-2" data-testid="brush-settings">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">キャンバスをなぞって範囲を塗る</span>
            <span className="flex-1" />
            {(
              [
                ["add", "塗る"],
                ["erase", "消す"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={btn + " aria-pressed:bg-accent aria-pressed:text-accent-ink"}
                aria-pressed={p.brush.mode === mode}
                onClick={() => p.onBrush({ ...p.brush, mode })}
              >
                {label}
              </button>
            ))}
          </div>
          <Slider
            label="サイズ"
            value={Math.round(p.brush.size * 100)}
            min={1}
            max={50}
            step={1}
            format={(v) => `${v}%`}
            onPreview={(v) => p.onBrush({ ...p.brush, size: v / 100 })}
            onCommit={(v) => p.onBrush({ ...p.brush, size: v / 100 })}
          />
          <Slider
            label="硬さ"
            value={Math.round(p.brush.hardness * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onPreview={(v) => p.onBrush({ ...p.brush, hardness: v / 100 })}
            onCommit={(v) => p.onBrush({ ...p.brush, hardness: v / 100 })}
          />
        </div>
      )}
      <div>
        <p className="mb-1 text-xs text-ink-muted">
          {selected
            ? "選択中の範囲に適用"
            : p.onAuto
              ? "瞳・美肌は顔を認識して置き、装備は画像をタップして切り抜きます"
              : "新しいマスクを追加して適用 (瞳・美肌は円形、装備はブラシ)"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LOCAL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={btn + " aria-pressed:bg-accent aria-pressed:text-accent-ink"}
              aria-pressed={selected?.presetId === preset.id}
              title={preset.hint}
              disabled={(!selected && full) || busy}
              onClick={() => {
                if (selected) return p.onPreset(selected.id, preset.id);
                if (p.onAuto) return p.onAuto(preset.id);
                p.onAdd(preset.id === "gear" ? "brush" : "ellipse", preset.id);
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
        {p.onAuto && !selected && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">タップで範囲だけ選ぶ:</span>
            <button
              type="button"
              className={btn}
              disabled={full || busy}
              onClick={() => p.onAuto?.("person")}
              data-testid="local-auto-person"
            >
              キャラクター
            </button>
            <button
              type="button"
              className={btn}
              disabled={full || busy}
              onClick={() => p.onAuto?.("background")}
              data-testid="local-auto-background"
            >
              背景
            </button>
          </div>
        )}
        {p.tap && (
          <p className="mt-1 text-xs text-ink-muted" role="status" data-testid="tap-status">
            画像の中の{p.tap === "gear" ? "装備" : "キャラクター"}をタップしてください
            <button type="button" className={btn + " ml-2"} onClick={() => p.onCancelTap?.()}>
              やめる
            </button>
          </p>
        )}
        {selected && p.segment?.localId === selected.id && p.onSegmentLevel && (
          <div className="mt-2 flex items-center gap-2" data-testid="segment-levels">
            <span className="text-xs text-ink-muted">切り抜きの範囲:</span>
            {SAM_LEVELS.map((level) => (
              <button
                key={level.index}
                type="button"
                className={btn + " aria-pressed:bg-accent aria-pressed:text-accent-ink"}
                title={level.hint}
                aria-pressed={isSameBitmap(selected.mask, p.segment?.masks[level.index])}
                onClick={() => p.onSegmentLevel?.(selected.id, level.index)}
              >
                {level.label}
              </button>
            ))}
          </div>
        )}
        {busy && (
          <p className="mt-1 text-xs text-ink-muted" role="status" data-testid="inference-status">
            {p.inference.status === "loading" && p.inference.progress
              ? `認識用のデータを読み込んでいます (${Math.round((p.inference.progress.loaded / p.inference.progress.total) * 100)}%)`
              : p.inference.status === "loading"
                ? "認識の準備をしています…"
                : "画像を読み取っています…"}
          </p>
        )}
        {p.notice && !busy && (
          <p className="mt-1 text-xs text-ink-muted" role="status" data-testid="local-notice">
            {p.notice}
          </p>
        )}
      </div>
      {selected && (
        <div className="space-y-2" data-testid="local-sliders">
          <Slider
            label="効果量"
            value={selected.amount}
            min={0}
            max={100}
            step={1}
            onPreview={(v) => p.onAmountPreview(selected.id, v)}
            onCommit={(v) => p.onAmountCommit(selected.id, v)}
            onReset={() => p.onAmountCommit(selected.id, 100)}
          />
          {ROWS.map((r) => (
            <Slider
              key={r.key}
              label={LOCAL_ADJUST_LABELS[r.key]}
              value={selected.adjust[r.key]}
              min={r.min}
              max={r.max}
              step={r.step}
              format={
                r.ev
                  ? (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`
                  : (v) => `${v > 0 ? "+" : ""}${v}`
              }
              onPreview={(v) => p.onAdjustPreview(selected.id, r.key, v)}
              onCommit={(v) => p.onAdjustCommit(selected.id, r.key, v)}
              onReset={() => p.onAdjustCommit(selected.id, r.key, 0)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
