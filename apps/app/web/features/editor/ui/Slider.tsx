import { useId } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
  onReset?: () => void;
};

/**
 * 補正用スライダー。ドラッグ中は onPreview、離したら onCommit (docs/design/04 §3)。
 * キーボード操作は矢印で step、Shift+矢印で 10 step (docs/design/08 §6)。
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onPreview,
  onCommit,
  onReset,
}: Props) {
  const id = useId();
  const text = format ? format(value) : String(value);
  return (
    <div className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-sm">
      <label
        htmlFor={id}
        className="truncate text-zinc-600 dark:text-zinc-400"
        onDoubleClick={onReset}
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        className="accent-zinc-900 dark:accent-zinc-100"
        onChange={(e) => onPreview(Number(e.currentTarget.value))}
        onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
        onKeyDown={(e) => {
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            return;
          if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            const dir = e.key === "ArrowRight" ? 1 : -1;
            const next = Math.min(max, Math.max(min, value + dir * step * 10));
            onCommit(next);
          }
        }}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          ) {
            onCommit(Number(e.currentTarget.value));
          }
        }}
      />
      <output htmlFor={id} className="text-right tabular-nums">
        {text}
      </output>
    </div>
  );
}
