import { PORTRAIT_PRESETS, type PortraitPresetId } from "@lumorphia/editor-recipe";
import type { FaceResult } from "@lumorphia/editor-engine";
import type { InferenceStatus } from "@lumorphia/editor-engine";
import { Slider } from "./Slider.tsx";
import { useEditorI18n } from "./EditorI18n.tsx";

type Props = {
  faces: readonly FaceResult[] | null;
  selectedFace: number;
  groupId: string | null;
  presetId: PortraitPresetId | null;
  /** グループの効果量 0..100 */
  amount: number;
  inference: InferenceStatus;
  notice: string | null;
  onDetect: () => void;
  onSelectFace: (index: number) => void;
  onApply: (presetId: PortraitPresetId) => void;
  onAmountPreview: (value: number) => void;
  onAmountCommit: (value: number) => void;
  /** 部分補正タブへ (自動で置いた 5 件を個別に直す) */
  onGoLocal: () => void;
};

const btn =
  "rounded border border-line-soft px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * 人物補正 (#175): 人物を検出 → (複数なら) 選ぶ → プリセット → 効果量。
 * 中身は部分補正 5 件 (背景・人物・顔・瞳 ×2) で、部分補正タブで個別に直せる
 */
export function PortraitPanel(p: Props) {
  const { t, tx } = useEditorI18n();
  const busy = p.inference.status !== "idle";
  const faces = p.faces ?? [];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-ink-muted">
        {t(
          "人物を認識して、顔・瞳・人物・背景をまとめて整えます。認識も補正もこの端末の中だけで行います。",
          "Detect a person and adjust their face, eyes, body, and background together. Detection and editing stay on this device.",
        )}
      </p>
      {p.faces === null ? (
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={p.onDetect}
          data-testid="portrait-detect"
        >
          {t("人物を認識する", "Detect people")}
        </button>
      ) : faces.length === 0 ? (
        <p className="text-xs text-ink-muted" role="status" data-testid="portrait-notice">
          {p.notice
            ? tx(p.notice)
            : t(
                "自動選択できませんでした。手動で範囲を指定できます",
                "Automatic selection failed. You can select an area manually.",
              )}
          <button type="button" className={btn + " ml-2"} onClick={p.onGoLocal}>
            {t("部分補正で手で置く", "Select manually")}
          </button>
        </p>
      ) : (
        <>
          {faces.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" data-testid="portrait-faces">
              <span className="text-xs text-ink-muted">{t("補正する人物:", "Person:")}</span>
              {faces.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={btn + " aria-pressed:bg-accent aria-pressed:text-accent-ink"}
                  aria-pressed={i === p.selectedFace}
                  onClick={() => p.onSelectFace(i)}
                >
                  {i + 1}
                </button>
              ))}
              <span className="text-xs text-ink-muted">
                {t(
                  "(画像の番号をタップしても選べます)",
                  "(You can also tap a number on the image)",
                )}
              </span>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs text-ink-muted">
              {p.groupId
                ? t("プリセットを切り替える", "Switch preset")
                : t("プリセットを選ぶと補正を置きます", "Choose a preset to apply adjustments")}
            </p>
            <div className="grid grid-cols-2 gap-2" data-testid="portrait-presets">
              {PORTRAIT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    "rounded border px-3 py-2 text-left text-sm transition-colors " +
                    (preset.id === p.presetId
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line-soft hover:bg-surface-hover disabled:opacity-40")
                  }
                  aria-pressed={preset.id === p.presetId}
                  title={tx(preset.hint)}
                  disabled={busy}
                  onClick={() => p.onApply(preset.id)}
                >
                  {tx(preset.name)}
                </button>
              ))}
            </div>
          </div>
          {p.groupId && (
            <div className="space-y-2" data-testid="portrait-amount">
              <Slider
                label={t("効果量", "Amount")}
                value={p.amount}
                min={0}
                max={100}
                step={1}
                onPreview={p.onAmountPreview}
                onCommit={p.onAmountCommit}
                onReset={() => p.onAmountCommit(100)}
              />
              <p className="text-xs text-ink-muted">
                {t(
                  "顔・瞳・人物・背景のマスクは",
                  "Edit the face, eyes, person, and background masks under",
                )}{" "}
                <button type="button" className="underline" onClick={p.onGoLocal}>
                  {t("部分補正", "Local adjustments")}
                </button>
                {t(
                  "で個別に直せます (ブラシで足す / 消す、値の調整)。",
                  " (paint, erase, or adjust individual values).",
                )}
              </p>
            </div>
          )}
        </>
      )}
      {busy && (
        <p className="text-xs text-ink-muted" role="status" data-testid="portrait-status">
          {p.inference.status === "loading" && p.inference.progress
            ? t(
                `認識用のデータを読み込んでいます (${Math.round((p.inference.progress.loaded / p.inference.progress.total) * 100)}%)`,
                `Loading detection data (${Math.round((p.inference.progress.loaded / p.inference.progress.total) * 100)}%)`,
              )
            : p.inference.status === "loading"
              ? t("認識の準備をしています…", "Preparing detection…")
              : t("人物を認識しています…", "Detecting people…")}
        </p>
      )}
      {p.notice && !busy && faces.length > 0 && (
        <p className="text-xs text-ink-muted" role="status" data-testid="portrait-notice">
          {tx(p.notice)}
        </p>
      )}
    </div>
  );
}
