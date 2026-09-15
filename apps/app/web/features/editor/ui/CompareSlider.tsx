import { useRef } from "react";

type View = { x: number; y: number; width: number; height: number };

/**
 * before / after の境界を左右にドラッグする。左が元画像、右が現像後。
 * ドラッグに加えて透明な range で矢印キーでも動かせる (ジェスチャーだけにしない)。
 */
export function CompareSlider({
  view,
  position,
  onChange,
}: {
  view: View;
  position: number;
  onChange: (position: number) => void;
}) {
  const dragging = useRef(false);
  const toPosition = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };
  const x = view.x + view.width * position;
  return (
    <div
      className="absolute"
      style={{ left: view.x, top: view.y, width: view.width, height: view.height }}
      data-testid="compare-slider"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(toPosition(e.clientX, e.currentTarget));
      }}
      onPointerMove={(e) => {
        if (dragging.current) onChange(toPosition(e.clientX, e.currentTarget));
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <span
        className="pointer-events-none absolute top-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-xs text-white"
        aria-hidden="true"
      >
        元画像
      </span>
      <span
        className="pointer-events-none absolute top-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-xs text-white"
        aria-hidden="true"
      >
        現像後
      </span>
      <div
        className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{ left: x - view.x - 1 }}
        aria-hidden="true"
      >
        <span className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs text-black shadow">
          ⇔
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(position * 1000)}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 1000)}
        aria-label="比較の境界 (左が元画像、右が現像後)"
        className="absolute inset-x-0 bottom-0 h-6 w-full cursor-ew-resize opacity-0"
        data-testid="compare-range"
      />
    </div>
  );
}
