import { ASPECT_PRESETS, type GeometryV1 } from "@prismtone/shared/recipe";
import { Slider } from "./Slider.tsx";

type Props = {
  geometry: GeometryV1;
  cropping: boolean;
  onPreview: (patch: Partial<GeometryV1>) => void;
  onCommit: (patch: Partial<GeometryV1>) => void;
  onCropping: (on: boolean) => void;
  onAspect: (aspect: GeometryV1["aspect"]) => void;
};

const ASPECT_LABEL: Record<(typeof ASPECT_PRESETS)[number], string> = {
  free: "自由",
  "1:1": "1:1",
  "4:3": "4:3",
  "3:2": "3:2",
  "16:9": "16:9",
  "9:16": "9:16",
  "3:4": "3:4",
  "2:3": "2:3",
};

const btn =
  "rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900";

export function GeometryPanel({
  geometry,
  cropping,
  onPreview,
  onCommit,
  onCropping,
  onAspect,
}: Props) {
  const rotate = (delta: 90 | -90) => {
    const next = (((geometry.rotation + delta) % 360) + 360) % 360;
    onCommit({ rotation: next as GeometryV1["rotation"], crop: null });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => rotate(-90)}>
          左回転
        </button>
        <button type="button" className={btn} onClick={() => rotate(90)}>
          右回転
        </button>
        <button
          type="button"
          className={btn}
          aria-pressed={geometry.flipH}
          onClick={() => onCommit({ flipH: !geometry.flipH })}
        >
          左右反転
        </button>
      </div>
      <Slider
        label="水平"
        value={geometry.straighten}
        min={-45}
        max={45}
        step={0.5}
        format={(v) => `${v.toFixed(1)}°`}
        onPreview={(v) => onPreview({ straighten: v })}
        onCommit={(v) => onCommit({ straighten: v })}
        onReset={() => onCommit({ straighten: 0 })}
      />
      <div>
        <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">アスペクト比</p>
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_PRESETS.map((a) => (
            <button
              key={a}
              type="button"
              className={btn}
              aria-pressed={(geometry.aspect ?? "free") === a}
              onClick={() => onAspect(a)}
            >
              {ASPECT_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={btn}
          aria-pressed={cropping}
          onClick={() => onCropping(!cropping)}
        >
          {cropping ? "トリミング中" : "トリミング"}
        </button>
        {geometry.crop && (
          <button
            type="button"
            className={btn}
            onClick={() => onCommit({ crop: null, aspect: null })}
          >
            トリミング解除
          </button>
        )}
      </div>
    </div>
  );
}
