import { useRef } from "react";
import type { EllipseMaskV2, GeometryV1 } from "@prismtone/shared/recipe";
import { canvasToImageUv, imageUvToCanvas, type Point } from "../mask-math.ts";
import { totalRotationDeg, type Size } from "../render/geometry.ts";
import {
  dragEllipse,
  ellipseHandles,
  ROTATE_HANDLE_OFFSET_PX,
  type EllipseHandle,
} from "./ellipse-drag.ts";

type View = { x: number; y: number; width: number; height: number; scale: number };

type Props = {
  view: View;
  source: Size;
  geometry: GeometryV1;
  mask: EllipseMaskV2;
  onPreview: (mask: EllipseMaskV2) => void;
  onCommit: (mask: EllipseMaskV2) => void;
  /** ドラッグしている間 true。範囲の赤い重ねを出すために使う */
  onDrawing: (on: boolean) => void;
};

/**
 * 円形マスクの DOM オーバーレイ (#109)。CropOverlay と同じ作りで、ドラッグ中は onPreview、離したら onCommit。
 * マスクは幾何を掛ける前の画像座標で持つので、画面 (view) との往復は mask-math の変換を通す。
 * 楕円の輪郭は SVG に「画像 px → 画面 px」の行列を掛けて描く (回転・反転にそのまま追従する)。
 */
export function EllipseMaskOverlay({
  view,
  source,
  geometry,
  mask,
  onPreview,
  onCommit,
  onDrawing,
}: Props) {
  const drag = useRef<{ handle: EllipseHandle; start: EllipseMaskV2; from: Point } | null>(null);

  const viewToUv = (clientX: number, clientY: number, host: DOMRect): Point => {
    const canvas = {
      x: (clientX - host.left - view.x) / view.scale,
      y: (clientY - host.top - view.y) / view.scale,
    };
    return canvasToImageUv(canvas, source, geometry);
  };
  const uvToView = (uv: Point) => {
    const c = imageUvToCanvas(uv, source, geometry);
    return { x: view.x + c.x * view.scale, y: view.y + c.y * view.scale };
  };
  const hostRect = (e: React.PointerEvent) =>
    (e.currentTarget as HTMLElement).closest("[data-testid=canvas-host]")!.getBoundingClientRect();

  const onPointerDown = (handle: EllipseHandle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, start: mask, from: viewToUv(e.clientX, e.clientY, hostRect(e)) };
    onDrawing(true);
  };
  const next = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return null;
    return dragEllipse(
      d.start,
      d.handle,
      d.from,
      viewToUv(e.clientX, e.clientY, hostRect(e)),
      source,
    );
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const m = next(e);
    if (m) onPreview(m);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const m = next(e);
    drag.current = null;
    onDrawing(false);
    if (m) onCommit(m);
  };

  // 画像 px → 画面 px: translate(view) scale(s) translate(center) rotate(θ) scale(flip, 1) translate(-W/2, -H/2)
  const center = imageUvToCanvas({ x: 0.5, y: 0.5 }, source, geometry);
  const matrix = [
    `translate(${view.x} ${view.y})`,
    `scale(${view.scale})`,
    `translate(${center.x} ${center.y})`,
    `rotate(${totalRotationDeg(geometry)})`,
    `scale(${geometry.flipH ? -1 : 1} 1)`,
    `translate(${-source.width / 2} ${-source.height / 2})`,
  ].join(" ");
  const handles = ellipseHandles(mask, source, ROTATE_HANDLE_OFFSET_PX / view.scale);
  const cx = mask.cx * source.width;
  const cy = mask.cy * source.height;
  const handleDot = (name: Exclude<EllipseHandle, "move">, cursor: string, label: string) => {
    const p = uvToView(handles[name]);
    return (
      <button
        type="button"
        aria-label={label}
        className="pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/70 bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
        style={{ left: p.x, top: p.y, cursor }}
        data-testid={`ellipse-handle-${name}`}
        onPointerDown={onPointerDown(name)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    );
  };
  const centerView = uvToView({ x: mask.cx, y: mask.cy });

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="ellipse-overlay">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {/* 明るい背景でも暗い背景でも見えるよう、暗い太線の上に白い細線を重ねる */}
        <g transform={matrix}>
          {[
            { stroke: "rgba(0,0,0,0.7)", width: 3.5 },
            { stroke: "white", width: 1.5 },
          ].map((l) => (
            <g key={l.stroke} fill="none" stroke={l.stroke} strokeWidth={l.width / view.scale}>
              <ellipse
                cx={cx}
                cy={cy}
                rx={mask.rx * source.width}
                ry={mask.ry * source.height}
                transform={`rotate(${mask.rotation} ${cx} ${cy})`}
              />
              <line
                x1={handles.ry.x * source.width}
                y1={handles.ry.y * source.height}
                x2={handles.rotate.x * source.width}
                y2={handles.rotate.y * source.height}
              />
            </g>
          ))}
        </g>
      </svg>
      <button
        type="button"
        aria-label="マスクを動かす"
        className="pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-accent shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
        style={{ left: centerView.x, top: centerView.y }}
        data-testid="ellipse-handle-move"
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {handleDot("rx", "ew-resize", "横の半径")}
      {handleDot("ry", "ns-resize", "縦の半径")}
      {handleDot("rotate", "grab", "回転")}
    </div>
  );
}
