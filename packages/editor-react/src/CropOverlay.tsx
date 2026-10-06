import { useRef } from "react";
import type { GeometryV1 } from "@lumorphia/editor-recipe";
import { dragCrop, type Crop, type Handle } from "./crop-drag.ts";

type Props = {
  view: { x: number; y: number; width: number; height: number };
  crop: Crop;
  aspect: GeometryV1["aspect"];
  canvasRatio: number;
  onPreview: (crop: Crop) => void;
  onCommit: (crop: Crop) => void;
};

const HANDLES: { h: Handle; cls: string; cursor: string }[] = [
  { h: "nw", cls: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { h: "ne", cls: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { h: "sw", cls: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  { h: "se", cls: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
  { h: "n", cls: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { h: "s", cls: "left-1/2 -bottom-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { h: "w", cls: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { h: "e", cls: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

function ratioOf(aspect: GeometryV1["aspect"], canvasRatio: number): number | undefined {
  if (!aspect || aspect === "free") return undefined;
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return undefined;
  return w / h / canvasRatio;
}

/** DOM で描く crop 枠 (docs/design/08 §3.3)。ドラッグ中は onPreview、離したら onCommit。 */
export function CropOverlay({ view, crop, aspect, canvasRatio, onPreview, onCommit }: Props) {
  const drag = useRef<{ handle: Handle; start: Crop; sx: number; sy: number } | null>(null);
  const ratio = ratioOf(aspect, canvasRatio);

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, start: crop, sx: e.clientX, sy: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = dragCrop(
      d.start,
      d.handle,
      (e.clientX - d.sx) / view.width,
      (e.clientY - d.sy) / view.height,
      ratio,
    );
    onPreview(next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const next = dragCrop(
      d.start,
      d.handle,
      (e.clientX - d.sx) / view.width,
      (e.clientY - d.sy) / view.height,
      ratio,
    );
    onCommit(next);
  };

  const box = {
    left: view.x + crop.x * view.width,
    top: view.y + crop.y * view.height,
    width: crop.w * view.width,
    height: crop.h * view.height,
  };

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="crop-overlay">
      <div
        className="absolute"
        style={{
          left: view.x,
          top: view.y,
          width: view.width,
          height: view.height,
          boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0)",
        }}
      />
      <div
        className="pointer-events-auto absolute cursor-move outline outline-1 outline-white"
        style={{ ...box, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border border-white/60" />
          ))}
        </div>
        {HANDLES.map(({ h, cls, cursor }) => (
          <div
            key={h}
            className={"absolute h-3 w-3 rounded-sm bg-white " + cls}
            style={{ cursor }}
            onPointerDown={onPointerDown(h)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ))}
      </div>
    </div>
  );
}
