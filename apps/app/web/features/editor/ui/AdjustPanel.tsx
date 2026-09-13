import type { AdjustV1 } from "@prismtone/shared/recipe";
import { Slider } from "./Slider.tsx";

type Props = {
  adjust: AdjustV1;
  onPreview: (key: keyof AdjustV1, value: number) => void;
  onCommit: (key: keyof AdjustV1, value: number) => void;
};

const ROWS: {
  key: keyof AdjustV1;
  label: string;
  min: number;
  max: number;
  step: number;
  ev?: boolean;
}[] = [
  { key: "exposure", label: "露光量", min: -5, max: 5, step: 0.05, ev: true },
  { key: "contrast", label: "コントラスト", min: -100, max: 100, step: 1 },
  { key: "highlights", label: "ハイライト", min: -100, max: 100, step: 1 },
  { key: "shadows", label: "シャドウ", min: -100, max: 100, step: 1 },
  { key: "temperature", label: "色温度", min: -100, max: 100, step: 1 },
  { key: "tint", label: "色かぶり", min: -100, max: 100, step: 1 },
  { key: "vibrance", label: "自然な彩度", min: -100, max: 100, step: 1 },
  { key: "saturation", label: "彩度", min: -100, max: 100, step: 1 },
];

export function AdjustPanel({ adjust, onPreview, onCommit }: Props) {
  return (
    <div className="space-y-2">
      {ROWS.map((r) => (
        <Slider
          key={r.key}
          label={r.label}
          value={adjust[r.key]}
          min={r.min}
          max={r.max}
          step={r.step}
          format={
            r.ev ? (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}` : (v) => `${v > 0 ? "+" : ""}${v}`
          }
          onPreview={(v) => onPreview(r.key, v)}
          onCommit={(v) => onCommit(r.key, v)}
          onReset={() => onCommit(r.key, 0)}
        />
      ))}
    </div>
  );
}
