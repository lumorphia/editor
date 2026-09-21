import { useEffect } from "react";
import type { GeometryV1 } from "@prismtone/shared/recipe";
import { canvasToImageUv, type Point } from "../mask-math.ts";
import type { Size } from "../render/geometry.ts";

type View = { x: number; y: number; width: number; height: number; scale: number };

type Props = {
  view: View;
  source: Size;
  geometry: GeometryV1;
  /** 何を切るかの一言 (「切りたい装備をタップ」など) */
  hint: string;
  /** タップ位置 (幾何を掛ける前の画像の正規化座標) */
  onTap: (uv: Point) => void;
  /** Esc か「やめる」 */
  onCancel: () => void;
};

/**
 * タップで切る (#177) の DOM オーバーレイ。キャンバス全体でクリックを 1 回受けて画像座標にする。
 * 画像の外をタップしたら無視する
 */
export function TapOverlay({ view, source, geometry, hint, onTap, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      data-testid="tap-overlay"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const host = e.currentTarget.getBoundingClientRect();
        const canvas = {
          x: (e.clientX - host.left - view.x) / view.scale,
          y: (e.clientY - host.top - view.y) / view.scale,
        };
        const uv = canvasToImageUv(canvas, source, geometry);
        if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return;
        onTap(uv);
      }}
    >
      <p
        className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm text-white"
        role="status"
      >
        {hint} (Esc でやめる)
      </p>
    </div>
  );
}
