import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { EditRecipe } from "@prismtone/shared/recipe";
import { editorReducer, initialEditorState } from "../state.ts";
import { canRedo, canUndo } from "../history.ts";
import { ImageLoadError, loadImageFile } from "../load-image.ts";
import { addPendingExport, saveDraft } from "../drafts.ts";
import { aspectRatio, centeredCrop } from "../render/geometry.ts";
import type { EditorRenderer } from "../render/editor-renderer.ts";
import { AdjustPanel } from "./AdjustPanel.tsx";
import { PresetPanel } from "./PresetPanel.tsx";
import { GeometryPanel } from "./GeometryPanel.tsx";
import { CropOverlay } from "./CropOverlay.tsx";

const ERROR_TEXT: Record<string, string> = {
  too_large: "30MB を超える画像は読み込めません。",
  unsupported_format: "PNG または JPEG の画像を選んでください。",
  decode_failed: "画像を読み込めませんでした。",
  webgl: "このブラウザでは編集機能を使えません (WebGL が無効です)。",
};

const tabBtn =
  "px-3 py-1.5 text-sm border-b-2 border-transparent aria-selected:border-zinc-900 dark:aria-selected:border-zinc-100";
const toolBtn =
  "rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-800 dark:hover:bg-zinc-900";

/** Playwright からレシピ適用結果の画素を読むためのフック。E2E フラグがあるときだけ露出する。 */
function installTestHook(renderer: EditorRenderer) {
  const w = window as Window & { __PRISMTONE_E2E__?: boolean; __prismtoneEditor?: unknown };
  if (!w.__PRISMTONE_E2E__) return;
  w.__prismtoneEditor = {
    async exportPixels(recipe: EditRecipe, points: { x: number; y: number }[]) {
      const blob = await renderer.export(recipe, { format: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        type: blob.type,
        pixels: points.map((p) => Array.from(ctx.getImageData(p.x, p.y, 1, 1).data).slice(0, 3)),
      };
    },
  };
}

export function EditorPage() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<EditorRenderer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, width: 1, height: 1, scale: 1 });
  const [ready, setReady] = useState(false);

  const recipe = state.history.present;

  // PixiJS は SSR 不可なので動的 import (docs/design/08 §1)
  useEffect(() => {
    let disposed = false;
    let renderer: EditorRenderer | null = null;
    (async () => {
      const host = hostRef.current;
      if (!host) return;
      try {
        const { EditorRenderer } = await import("../render/editor-renderer.ts");
        renderer = await EditorRenderer.create(host);
        if (disposed) {
          renderer.destroy();
          return;
        }
        rendererRef.current = renderer;
        setReady(true);
        installTestHook(renderer);
      } catch {
        dispatch({ type: "ui/error", error: ERROR_TEXT.webgl ?? "WebGL error" });
      }
    })();
    return () => {
      disposed = true;
      rendererRef.current = null;
      renderer?.destroy();
    };
  }, []);

  // レシピ変更をレンダラへ反映
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !state.source) return;
    r.setRecipe(recipe);
    setView(r.viewRect);
  }, [recipe, state.source]);

  useEffect(() => {
    rendererRef.current?.setCompare(state.ui.comparing);
  }, [state.ui.comparing]);

  // リサイズで枠位置を追従
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const r = rendererRef.current;
      if (r && state.source) setView(r.viewRect);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [state.source]);

  // 下書きを自動保存 (レシピ確定ごと)
  useEffect(() => {
    if (!state.source || !state.draftId) return;
    const { source, draftId } = state;
    void saveDraft({
      id: draftId,
      name: source.name,
      blob: source.blob,
      recipe,
      updatedAt: Date.now(),
    });
  }, [state.source, state.draftId, recipe, state]);

  const openFile = useCallback(async (file: File) => {
    try {
      const image = await loadImageFile(file);
      const draftId = crypto.randomUUID();
      const r = rendererRef.current;
      dispatch({ type: "image/loaded", image, draftId });
      if (r) {
        r.setImage(image.bitmap, initialEditorState.history.present);
        setView(r.viewRect);
      }
    } catch (e) {
      const reason = e instanceof ImageLoadError ? e.reason : "decode_failed";
      dispatch({ type: "image/failed", error: ERROR_TEXT[reason] ?? reason });
    }
  }, []);

  // 画像が後から来た場合 (レンダラ初期化前に読み込んだ) の反映
  useEffect(() => {
    const r = rendererRef.current;
    if (ready && r && state.source) {
      r.setImage(state.source.bitmap, recipe);
      setView(r.viewRect);
    }
    // recipe は setRecipe 側の effect で追従するため依存に含めない
  }, [ready, state.source]);

  const exportBlob = useCallback(async (r: EditRecipe) => {
    const renderer = rendererRef.current;
    if (!renderer) throw new Error("renderer not ready");
    dispatch({ type: "ui/exporting", on: true });
    try {
      return await renderer.export(r);
    } finally {
      dispatch({ type: "ui/exporting", on: false });
    }
  }, []);

  const onSave = async () => {
    if (!state.source) return;
    try {
      const blob = await exportBlob(recipe);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const base = state.source.name.replace(/\.[^.]+$/, "");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-prismtone.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      dispatch({ type: "ui/error", error: "書き出しに失敗しました。" });
    }
  };

  const onPost = async () => {
    if (!state.source || !state.draftId) return;
    try {
      const blob = await exportBlob(recipe);
      await addPendingExport({ draftId: state.draftId, blob, recipe, createdAt: Date.now() });
      void navigate("/edit/post");
    } catch (error) {
      dispatch({
        type: "ui/error",
        error: error instanceof Error ? error.message : "書き出しに失敗しました。",
      });
    }
  };

  const onAspect = (aspect: EditRecipe["geometry"]["aspect"]) => {
    const r = rendererRef.current;
    const ratio = aspectRatio(aspect);
    const crop = ratio && r ? centeredCrop(r.canvasSize, ratio) : recipe.geometry.crop;
    dispatch({
      type: "geometry/commit",
      patch: { aspect, crop: aspect === "free" ? recipe.geometry.crop : crop },
    });
    if (aspect !== "free") dispatch({ type: "ui/cropping", on: true });
  };

  const startCropping = (on: boolean) => {
    if (on && !recipe.geometry.crop) {
      dispatch({ type: "geometry/commit", patch: { crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } } });
    }
    dispatch({ type: "ui/cropping", on });
  };

  // キーボード: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "history/undo" });
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        dispatch({ type: "history/redo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasImage = Boolean(state.source);
  const canvasRatio = rendererRef.current
    ? rendererRef.current.canvasSize.width / rendererRef.current.canvasSize.height
    : 1;

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col gap-3 lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void openFile(f);
              e.currentTarget.value = "";
            }}
          />
          <button type="button" className={toolBtn} onClick={() => fileInput.current?.click()}>
            画像を開く
          </button>
          <button
            type="button"
            className={toolBtn}
            disabled={!hasImage}
            onPointerDown={() => dispatch({ type: "ui/compare", on: true })}
            onPointerUp={() => dispatch({ type: "ui/compare", on: false })}
            onPointerLeave={() => dispatch({ type: "ui/compare", on: false })}
          >
            比較 (長押し)
          </button>
          <button
            type="button"
            className={toolBtn}
            disabled={!canUndo(state.history)}
            onClick={() => dispatch({ type: "history/undo" })}
          >
            取り消し
          </button>
          <button
            type="button"
            className={toolBtn}
            disabled={!canRedo(state.history)}
            onClick={() => dispatch({ type: "history/redo" })}
          >
            やり直し
          </button>
          <button
            type="button"
            className={toolBtn}
            disabled={!hasImage}
            onClick={() => dispatch({ type: "recipe/reset" })}
          >
            全リセット
          </button>
          <span className="flex-1" />
          <button
            type="button"
            className={toolBtn}
            disabled={!hasImage || state.ui.exporting}
            onClick={onSave}
            data-testid="save"
          >
            {state.ui.exporting ? "書き出し中..." : "端末に保存"}
          </button>
          <button
            type="button"
            className={toolBtn + " bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"}
            disabled={!hasImage || state.ui.exporting}
            onClick={onPost}
          >
            投稿へ
          </button>
        </div>
        {state.ui.error && (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {state.ui.error}
          </p>
        )}
        <div
          ref={hostRef}
          data-testid="canvas-host"
          className="relative min-h-0 flex-1 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-900"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void openFile(f);
          }}
        >
          {!hasImage && (
            <p className="absolute inset-0 grid place-items-center text-sm text-zinc-500">
              PNG / JPEG をドロップするか「画像を開く」を押してください
            </p>
          )}
          {hasImage && state.ui.cropping && recipe.geometry.crop && (
            <CropOverlay
              view={view}
              crop={recipe.geometry.crop}
              aspect={recipe.geometry.aspect}
              canvasRatio={canvasRatio}
              onPreview={(crop) => dispatch({ type: "geometry/preview", patch: { crop } })}
              onCommit={(crop) => dispatch({ type: "geometry/commit", patch: { crop } })}
            />
          )}
        </div>
      </section>

      <aside className="w-full shrink-0 space-y-3 lg:w-80">
        <div role="tablist" className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(
            [
              ["presets", "プリセット"],
              ["adjust", "補正"],
              ["geometry", "幾何"],
            ] as const
          ).map(([tool, label]) => (
            <button
              key={tool}
              role="tab"
              type="button"
              aria-selected={state.ui.tool === tool}
              className={tabBtn}
              onClick={() => dispatch({ type: "ui/tool", tool })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={hasImage ? "" : "pointer-events-none opacity-40"}>
          {state.ui.tool === "presets" && (
            <PresetPanel
              activeId={recipe.presetId}
              onApply={(id) => dispatch({ type: "preset/apply", id })}
            />
          )}
          {state.ui.tool === "adjust" && (
            <AdjustPanel
              adjust={recipe.adjust}
              onPreview={(key, value) => dispatch({ type: "adjust/preview", key, value })}
              onCommit={(key, value) => dispatch({ type: "adjust/commit", key, value })}
            />
          )}
          {state.ui.tool === "geometry" && (
            <GeometryPanel
              geometry={recipe.geometry}
              cropping={state.ui.cropping}
              onPreview={(patch) => dispatch({ type: "geometry/preview", patch })}
              onCommit={(patch) => dispatch({ type: "geometry/commit", patch })}
              onCropping={startCropping}
              onAspect={onAspect}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
