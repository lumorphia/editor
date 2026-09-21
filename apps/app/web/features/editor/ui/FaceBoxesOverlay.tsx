import type { GeometryV1 } from "@prismtone/shared/recipe";
import type { FaceResult } from "../inference/face-masks.ts";
import { imageUvToCanvas } from "../mask-math.ts";
import type { Size } from "../render/geometry.ts";

type View = { x: number; y: number; width: number; height: number; scale: number };

type Props = {
  view: View;
  source: Size;
  geometry: GeometryV1;
  faces: readonly FaceResult[];
  selected: number;
  onSelect: (index: number) => void;
};

/** 人物補正 (#175) で複数の顔があるとき、番号付きの枠を重ねて選ばせる。幾何 (回転・反転) を追う */
export function FaceBoxesOverlay({ view, source, geometry, faces, selected, onSelect }: Props) {
  const toScreen = (x: number, y: number) => {
    const c = imageUvToCanvas({ x, y }, source, geometry);
    return { x: view.x + c.x * view.scale, y: view.y + c.y * view.scale };
  };
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="face-boxes">
      {faces.map((f, i) => {
        const [x0, y0, x1, y1] = f.bbox;
        // 回転しても囲えるように 4 隅を写してから外接矩形を取る
        const corners = [toScreen(x0, y0), toScreen(x1, y0), toScreen(x1, y1), toScreen(x0, y1)];
        const left = Math.min(...corners.map((c) => c.x));
        const top = Math.min(...corners.map((c) => c.y));
        const right = Math.max(...corners.map((c) => c.x));
        const bottom = Math.max(...corners.map((c) => c.y));
        const active = i === selected;
        return (
          <button
            key={i}
            type="button"
            aria-label={`人物 ${i + 1} を選ぶ`}
            aria-pressed={active}
            onClick={() => onSelect(i)}
            className={
              "pointer-events-auto absolute rounded border-2 text-xs font-medium " +
              (active ? "border-accent" : "border-white/70 hover:border-white")
            }
            style={{ left, top, width: right - left, height: bottom - top }}
          >
            <span
              className={
                "absolute -top-3 -left-0.5 rounded px-1.5 " +
                (active ? "bg-accent text-accent-ink" : "bg-black/60 text-white")
              }
            >
              {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
