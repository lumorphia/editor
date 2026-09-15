import type { AdjustV1 } from "@prismtone/shared/recipe";
import { ADJUST_LABELS } from "../labels.ts";
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
  { key: "exposure", label: ADJUST_LABELS.exposure, min: -5, max: 5, step: 0.05, ev: true },
  { key: "contrast", label: ADJUST_LABELS.contrast, min: -100, max: 100, step: 1 },
  { key: "highlights", label: ADJUST_LABELS.highlights, min: -100, max: 100, step: 1 },
  { key: "shadows", label: ADJUST_LABELS.shadows, min: -100, max: 100, step: 1 },
  { key: "temperature", label: ADJUST_LABELS.temperature, min: -100, max: 100, step: 1 },
  { key: "tint", label: ADJUST_LABELS.tint, min: -100, max: 100, step: 1 },
  { key: "vibrance", label: ADJUST_LABELS.vibrance, min: -100, max: 100, step: 1 },
  { key: "saturation", label: ADJUST_LABELS.saturation, min: -100, max: 100, step: 1 },
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
