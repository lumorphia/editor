import { PRESETS } from "@lumorphia/editor-recipe";
import { useEditorI18n } from "./EditorI18n.tsx";

type Props = {
  activeId: string | null;
  onApply: (id: string) => void;
};

export function PresetPanel({ activeId, onApply }: Props) {
  const { tx } = useEditorI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      {PRESETS.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={active}
            onClick={() => onApply(p.id)}
            className={
              "rounded border px-3 py-2 text-left text-sm transition-colors " +
              (active
                ? "border-accent bg-accent text-accent-ink"
                : "border-line-soft hover:bg-surface-hover")
            }
          >
            {tx(p.name)}
          </button>
        );
      })}
    </div>
  );
}
