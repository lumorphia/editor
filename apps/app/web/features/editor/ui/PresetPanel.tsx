import { PRESETS } from "@prismtone/shared/recipe";

type Props = {
  activeId: string | null;
  onApply: (id: string) => void;
};

export function PresetPanel({ activeId, onApply }: Props) {
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
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900")
            }
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
