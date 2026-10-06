import { ASPECT_PRESETS, type GeometryV1 } from "@lumorphia/editor-recipe";
import { Slider } from "./Slider.tsx";
import { useEditorI18n } from "./EditorI18n.tsx";

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
  "rounded border border-line-soft px-3 py-1.5 text-sm hover:bg-surface-hover aria-pressed:bg-accent aria-pressed:text-accent-ink";

export function GeometryPanel({
  geometry,
  cropping,
  onPreview,
  onCommit,
  onCropping,
  onAspect,
}: Props) {
  const { t } = useEditorI18n();
  const rotate = (delta: 90 | -90) => {
    const next = (((geometry.rotation + delta) % 360) + 360) % 360;
    onCommit({ rotation: next as GeometryV1["rotation"], crop: null });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => rotate(-90)}>
          {t("左回転", "Rotate left")}
        </button>
        <button type="button" className={btn} onClick={() => rotate(90)}>
          {t("右回転", "Rotate right")}
        </button>
        <button
          type="button"
          className={btn}
          aria-pressed={geometry.flipH}
          onClick={() => onCommit({ flipH: !geometry.flipH })}
        >
          {t("左右反転", "Flip horizontal")}
        </button>
      </div>
      <Slider
        label={t("水平", "Straighten")}
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
        <p className="mb-1 text-sm text-ink-muted">{t("アスペクト比", "Aspect ratio")}</p>
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_PRESETS.map((a) => (
            <button
              key={a}
              type="button"
              className={btn}
              aria-pressed={(geometry.aspect ?? "free") === a}
              onClick={() => onAspect(a)}
            >
              {a === "free" ? t("自由", "Free") : ASPECT_LABEL[a]}
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
          {cropping ? t("トリミング中", "Cropping") : t("トリミング", "Crop")}
        </button>
        {geometry.crop && (
          <button
            type="button"
            className={btn}
            onClick={() => onCommit({ crop: null, aspect: null })}
          >
            {t("トリミング解除", "Remove crop")}
          </button>
        )}
      </div>
    </div>
  );
}
