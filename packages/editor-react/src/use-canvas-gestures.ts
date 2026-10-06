import { useEffect, type RefObject } from "react";
import { dragPan, pinch, wheelZoomFactor, type Pt } from "./gesture.ts";

export type GestureTarget = {
  zoomBy: (factor: number, anchor?: Pt) => void;
  panBy: (dx: number, dy: number) => void;
};

/**
 * キャンバスのズームと移動 (docs/design/08 §3.3)。
 * - ホイール: カーソルを軸にズーム (Ctrl 付き = トラックパッドのピンチも同じ)
 * - ドラッグ: 移動。ツール (ブラシ・円形のハンドル・トリミング枠) の上では起きない。
 *   中ボタンと Space + ドラッグはツールの上でも移動
 * - 2 本指: ピンチでズーム、そのまま動かして移動。ブラシで描いている途中でも 2 本目が触れたらこちらに切り替え、
 *   描きかけのストロークは捨てる (pointercancel を送る)
 * ネイティブの capture でツールより先に見るので、React の onPointer* より前に判断できる
 */
export function useCanvasGestures(
  hostRef: RefObject<HTMLElement | null>,
  getTarget: () => GestureTarget | null,
  enabled: boolean,
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;

    const pointers = new Map<number, { pos: Pt; target: EventTarget | null }>();
    let mode: "none" | "pan" | "pinch" = "none";
    let last: Pt | null = null;
    let spaceDown = false;
    let cancelling = false;

    const pos = (e: PointerEvent): Pt => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    /** ツール (オーバーレイの要素) の上か。ホスト自身と canvas は素の場所 */
    const onTool = (target: EventTarget | null) =>
      target !== host && !(target instanceof HTMLCanvasElement);

    const onDown = (e: PointerEvent) => {
      const t = getTarget();
      if (!t) return;
      pointers.set(e.pointerId, { pos: pos(e), target: e.target });
      if (pointers.size === 2) {
        // 1 本目がツールに掴まれていたら、描きかけを捨てさせる。自分で送る cancel は onUp で数えない
        mode = "pinch";
        cancelling = true;
        for (const [id, p] of pointers) {
          if (id !== e.pointerId && p.target && onTool(p.target)) {
            p.target.dispatchEvent(
              new PointerEvent("pointercancel", { pointerId: id, bubbles: true, cancelable: true }),
            );
          }
        }
        cancelling = false;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (pointers.size > 2) {
        e.stopPropagation();
        return;
      }
      const panByDrag = e.button === 1 || spaceDown || (e.button === 0 && !onTool(e.target));
      if (panByDrag) {
        mode = "pan";
        last = pos(e);
        host.setPointerCapture(e.pointerId);
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onMove = (e: PointerEvent) => {
      const t = getTarget();
      const entry = pointers.get(e.pointerId);
      if (!t || !entry) return;
      const now = pos(e);
      if (mode === "pinch" && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const before = entry.pos;
        const other = a === entry ? b!.pos : a!.pos;
        // 動いた指が 1 本目なら (a, b) = (動いた, 止まった)、2 本目ならその逆で渡す
        const p = a === entry ? pinch(before, other, now, other) : pinch(other, before, other, now);
        if (p.factor !== 1) t.zoomBy(p.factor, p.anchor);
        if (p.pan.x !== 0 || p.pan.y !== 0) t.panBy(p.pan.x, p.pan.y);
        entry.pos = now;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (mode === "pan" && last) {
        const d = dragPan(last, now);
        t.panBy(d.x, d.y);
        last = now;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      entry.pos = now;
    };
    const onUp = (e: PointerEvent) => {
      if (cancelling || !pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (mode === "pinch") {
        // 片方を離しても、残った指で描き始めないよう次に全部離れるまで何もしない
        if (pointers.size === 0) mode = "none";
        e.stopPropagation();
        return;
      }
      if (mode === "pan") {
        mode = "none";
        last = null;
        if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
        e.stopPropagation();
      }
    };
    const onWheel = (e: WheelEvent) => {
      const t = getTarget();
      if (!t) return;
      e.preventDefault();
      t.zoomBy(wheelZoomFactor(e.deltaY, e.deltaMode), pos(e as unknown as PointerEvent));
    };
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target) && !e.repeat) {
        spaceDown = true;
        host.style.cursor = "grab";
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown = false;
        host.style.cursor = "";
      }
    };

    host.addEventListener("pointerdown", onDown, { capture: true });
    host.addEventListener("pointermove", onMove, { capture: true });
    host.addEventListener("pointerup", onUp, { capture: true });
    host.addEventListener("pointercancel", onUp, { capture: true });
    host.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      host.removeEventListener("pointerdown", onDown, { capture: true });
      host.removeEventListener("pointermove", onMove, { capture: true });
      host.removeEventListener("pointerup", onUp, { capture: true });
      host.removeEventListener("pointercancel", onUp, { capture: true });
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      host.style.cursor = "";
    };
  }, [hostRef, getTarget, enabled]);
}
