import {
  LOCAL_PRESETS,
  MAX_LOCAL_ADJUSTMENTS,
  type LocalAdjustV2,
  type LocalAdjustmentV2,
  type LocalPresetId,
} from "@prismtone/shared/recipe";
import { LOCAL_ADJUST_LABELS } from "../labels.ts";
import { Slider } from "./Slider.tsx";

type Props = {
  list: readonly LocalAdjustmentV2[];
  selectedId: string | null;
  showMask: boolean;
  onAdd: (presetId?: LocalPresetId) => void;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onPreset: (id: string, presetId: LocalPresetId) => void;
  onAmountPreview: (id: string, value: number) => void;
  onAmountCommit: (id: string, value: number) => void;
  onAdjustPreview: (id: string, key: keyof LocalAdjustV2, value: number) => void;
  onAdjustCommit: (id: string, key: keyof LocalAdjustV2, value: number) => void;
  onShowMask: (on: boolean) => void;
};

const ROWS: { key: keyof LocalAdjustV2; min: number; max: number; step: number; ev?: boolean }[] = [
  { key: "exposure", min: -5, max: 5, step: 0.05, ev: true },
  { key: "contrast", min: -100, max: 100, step: 1 },
  { key: "highlights", min: -100, max: 100, step: 1 },
  { key: "shadows", min: -100, max: 100, step: 1 },
  { key: "temperature", min: -100, max: 100, step: 1 },
  { key: "tint", min: -100, max: 100, step: 1 },
  { key: "saturation", min: -100, max: 100, step: 1 },
  // シャープと美肌 (smooth、上限 MAX_LOCAL_SMOOTH) は描画が入る PR3 でここに足す
];

const btn =
  "rounded border border-line-soft px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent";

function localName(l: LocalAdjustmentV2, index: number): string {
  if (l.name) return l.name;
  const preset = LOCAL_PRESETS.find((p) => p.id === l.presetId);
  const kind = l.mask.kind === "ellipse" ? "円形" : "ブラシ";
  return preset ? `${preset.name} (${kind})` : `部分補正 ${index + 1} (${kind})`;
}

/** 部分補正のパネル (#109): 一覧、追加、プリセット、効果量とスライダー。ブラシの追加は PR3 */
export function LocalPanel(p: Props) {
  const selected = p.list.find((l) => l.id === p.selectedId) ?? null;
  const full = p.list.length >= MAX_LOCAL_ADJUSTMENTS;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn}
          disabled={full}
          onClick={() => p.onAdd()}
          data-testid="local-add-ellipse"
        >
          円形を追加
        </button>
        <span className="text-xs text-ink-muted">
          {p.list.length} / {MAX_LOCAL_ADJUSTMENTS}
        </span>
        <label className="ml-auto flex items-center gap-1 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={p.showMask}
            onChange={(e) => p.onShowMask(e.currentTarget.checked)}
          />
          範囲を表示
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
      <div>
        <p className="mb-1 text-xs text-ink-muted">
          {selected ? "選択中の範囲に適用" : "新しい円形マスクを追加して適用"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LOCAL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={btn + " aria-pressed:bg-accent aria-pressed:text-accent-ink"}
              aria-pressed={selected?.presetId === preset.id}
              title={preset.hint}
              disabled={!selected && full}
              onClick={() => (selected ? p.onPreset(selected.id, preset.id) : p.onAdd(preset.id))}
            >
              {preset.name}
            </button>
          ))}
        </div>
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
