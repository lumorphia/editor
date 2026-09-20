import { useRef, useState } from "react";
import type { BrushStrokeV2, GeometryV1 } from "@prismtone/shared/recipe";
import { simplifyPoints } from "../brush-raster.ts";
import { canvasToImageUv, type Point } from "../mask-math.ts";
import type { Size } from "../render/geometry.ts";
import type { BrushSettings } from "../state.ts";

type View = { x: number; y: number; width: number; height: number; scale: number };

type Props = {
  view: View;
  source: Size;
  geometry: GeometryV1;
  brush: BrushSettings;
  /** 描画中: 直前の点から今の点までの線分をマスクに足す (レシピには入れない) */
  onPreview: (segment: BrushStrokeV2) => void;
  /** 離したとき: 間引いたストロークをレシピに積む */
  onCommit: (stroke: BrushStrokeV2) => void;
  /** 押している間 true。範囲の赤い重ねを出すために使う */
  onDrawing: (on: boolean) => void;
  /** 描きかけを捨てる (ピンチに切り替わったとき)。プレビューで足した分を消すためにレシピを描き直す */
  onCancel: () => void;
};

/** ポインタの移動をこれ未満 (画像の長辺に対する比) なら捨てる。レシピの点数を抑える */
const MIN_POINT_DISTANCE = 0.005;

/**
 * ブラシマスクの DOM オーバーレイ (#109)。キャンバス全体でポインタを受け、画像座標の点列にする。
 * 描画中は 1 線分ずつ renderer に足して即時に見せ、離したときに 1 ストロークとして履歴に積む。
 */
export function BrushOverlay({
  view,
  source,
  geometry,
  brush,
  onPreview,
  onCommit,
  onDrawing,
  onCancel,
}: Props) {
  const points = useRef<Point[] | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const toUv = (e: React.PointerEvent): Point => {
    const host = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const canvas = {
      x: (e.clientX - host.left - view.x) / view.scale,
      y: (e.clientY - host.top - view.y) / view.scale,
    };
    const uv = canvasToImageUv(canvas, source, geometry);
    return { x: Math.min(1, Math.max(0, uv.x)), y: Math.min(1, Math.max(0, uv.y)) };
  };
  const stroke = (pts: Point[]): BrushStrokeV2 => ({
    mode: brush.mode,
    size: brush.size,
    hardness: brush.hardness,
    points: pts,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toUv(e);
    points.current = [p];
    onDrawing(true);
    onPreview(stroke([p]));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const host = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCursor({ x: e.clientX - host.left, y: e.clientY - host.top });
    const pts = points.current;
    if (!pts) return;
    const p = toUv(e);
    const last = pts[pts.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_POINT_DISTANCE) return;
    pts.push(p);
    onPreview(stroke([last, p]));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const pts = points.current;
    points.current = null;
    if (!pts) return;
    onDrawing(false);
    const p = toUv(e);
    const all = simplifyPoints([...pts, p], MIN_POINT_DISTANCE);
    onCommit(stroke(all));
  };
  /** 2 本目の指が触れた (ピンチに切り替わった) など。描きかけは捨てる */
  const onPointerCancel = () => {
    if (!points.current) return;
    points.current = null;
    onDrawing(false);
    onCancel();
  };

  // ブラシの円 (画面 px)。直径 = size × 長辺 × 表示倍率
  const diameter = brush.size * Math.max(source.width, source.height) * view.scale;

  return (
    <div
      className="absolute inset-0 cursor-crosshair touch-none"
      data-testid="brush-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => setCursor(null)}
    >
      {cursor && (
        <div
          aria-hidden="true"
          className={
            "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border " +
            (brush.mode === "add" ? "border-white" : "border-red-400 border-dashed")
          }
          style={{
            left: cursor.x,
            top: cursor.y,
            width: diameter,
            height: diameter,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      )}
    </div>
  );
}
