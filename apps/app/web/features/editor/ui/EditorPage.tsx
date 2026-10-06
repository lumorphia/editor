import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DEFAULT_ELLIPSE_MASK, type EditRecipe } from "@prismtone/shared/recipe";
import { activePortraitGroup, editorReducer, initialEditorState } from "../state.ts";
import { canRedo, canUndo, redoLabel, undoLabel } from "../history.ts";
import { ImageLoadError, loadImageFile, type LoadedImage } from "../load-image.ts";
import { addPendingExport, editorDrafts } from "../../post-form/work-in-progress.ts";
import { sendEditorEvent } from "../usage.ts";
import { aspectRatio, centeredCrop } from "../render/geometry.ts";
import type { EditorRenderer } from "../render/editor-renderer.ts";
import { AdjustPanel } from "./AdjustPanel.tsx";
import { PresetPanel } from "./PresetPanel.tsx";
import { GeometryPanel } from "./GeometryPanel.tsx";
import { ZOOM_STEP } from "../render/viewport.ts";
import { useCanvasGestures } from "./use-canvas-gestures.ts";
import { CropOverlay } from "./CropOverlay.tsx";
import { EllipseMaskOverlay } from "./EllipseMaskOverlay.tsx";
import { BrushOverlay } from "./BrushOverlay.tsx";
import { LocalPanel } from "./LocalPanel.tsx";
import {
  AUTO_SELECT_FAILED,
  planFaceSelection,
  planSegmentSelection,
  type SegmentSelectionKind,
} from "../inference/auto-select.ts";
import type { FaceResult } from "../inference/face-masks.ts";
import { SAM_LEVELS } from "../inference/segment-masks.ts";
import { TapOverlay } from "./TapOverlay.tsx";
import type { Point } from "../mask-math.ts";
import { PortraitPanel } from "./PortraitPanel.tsx";
import { FaceBoxesOverlay } from "./FaceBoxesOverlay.tsx";
import { PORTRAIT_FULL, buildPortraitItems, faceCenter } from "../inference/portrait.ts";
import {
  MAX_LOCAL_ADJUSTMENTS,
  findPortraitPreset,
  portraitAmount,
  type PortraitPresetId,
} from "@prismtone/shared/recipe";
import { CompareSlider } from "./CompareSlider.tsx";
import { useI18n } from "../../i18n/I18nProvider.tsx";

const ERROR_TEXT: Record<string, string> = {
  too_large: "30MB を超える画像は読み込めません。",
  unsupported_format: "PNG または JPEG の画像を選んでください。",
  decode_failed: "画像を読み込めませんでした。",
  webgl: "このブラウザでは編集機能を使えません (WebGL が無効です)。",
};

const tabBtn =
  "shrink-0 whitespace-nowrap px-2 py-1.5 text-sm border-b-2 border-transparent aria-selected:border-accent";
const toolBtn =
  "rounded border border-line-soft px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent";

/** Playwright からレシピ適用結果の画素を読むためのフック。E2E フラグがあるときだけ露出する。 */
function installTestHook(renderer: EditorRenderer, getRecipe: () => EditRecipe) {
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
    benchmark(recipe: EditRecipe, frames?: number) {
      return renderer.benchmark(recipe, frames);
    },
    viewRect() {
      return renderer.viewRect;
    },
    previewPixels(points: { x: number; y: number }[]) {
      return renderer.previewPixels(points);
    },
    currentRecipe() {
      return getRecipe();
    },
  };
}

export function EditorPage() {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<EditorRenderer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, width: 1, height: 1, scale: 1 });
  // 編集画面の使われ方 (#344)。開いたことを 1 回だけ送る (StrictMode の 2 回目の effect では送らない)
  const openReported = useRef(false);
  useEffect(() => {
    if (openReported.current) return;
    openReported.current = true;
    sendEditorEvent("open");
  }, []);
  const [ready, setReady] = useState(false);

  const recipe = state.history.present;
  const recipeRef = useRef(recipe);
  recipeRef.current = recipe;

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
        // 置き直し (fit / zoom / resize) はすべてここを通る。オーバーレイの位置の唯一の出どころ
        renderer.onView = setView;
        setReady(true);
        installTestHook(renderer, () => recipeRef.current);
      } catch (e) {
        // 原因を飲み込まない (CSP や WebGL の不調を切り分けられるように)
        console.error("editor renderer failed", e);
        dispatch({ type: "ui/error", error: ERROR_TEXT.webgl ?? "WebGL error" });
      }
    })();
    return () => {
      disposed = true;
      rendererRef.current = null;
      renderer?.destroy();
    };
  }, []);

  // レシピ変更をレンダラへ反映 (view は renderer.onView で追従する)
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !state.source) return;
    r.setRecipe(recipe);
  }, [recipe, state.source]);

  useEffect(() => {
    rendererRef.current?.setCompare(state.ui.comparing, state.ui.comparePosition);
  }, [state.ui.comparing, state.ui.comparePosition]);

  // 部分補正 (#109): 部分補正タブで選択中の範囲を赤で重ねる
  const selectedLocal =
    recipe.localAdjustments.find((l) => l.id === state.ui.local.selectedId) ?? null;
  // 赤い重ねは、描いている間 (ブラシ・円形のドラッグ中) か「範囲を表示」をオンにしたときだけ。
  // 常時だと補正の効きが赤に埋もれて見えない
  const maskPreviewId =
    state.ui.tool === "local" &&
    (state.ui.local.showMask || state.ui.local.drawing) &&
    !state.ui.comparing
      ? (selectedLocal?.id ?? null)
      : null;
  useEffect(() => {
    rendererRef.current?.setMaskPreview(maskPreviewId);
  }, [maskPreviewId, state.source]);

  // ズームと移動 (docs/design/08 §3.3): ホイールでズーム、ドラッグで移動、2 本指でピンチ
  const gestureTarget = useCallback(
    () => (state.source ? rendererRef.current : null),
    [state.source],
  );
  useCanvasGestures(hostRef, gestureTarget, Boolean(state.source));

  /**
   * 新しい円形を今見えている範囲の中央に置く。半径は見えている範囲の短辺の 1/4 (拡大中は小さく)、
   * 既定 (画像の 12%) を上限にする
   */
  const ellipseAtView = () => {
    const r = rendererRef.current;
    if (!r || !state.source) return undefined;
    const { uv, visible } = r.visibleCenter;
    const short = Math.min(visible.width, visible.height) / 4;
    return {
      cx: uv.x,
      cy: uv.y,
      rx: Math.min(DEFAULT_ELLIPSE_MASK.rx, short / state.source.bitmap.width),
      ry: Math.min(DEFAULT_ELLIPSE_MASK.ry, short / state.source.bitmap.height),
    };
  };

  // 自動選択 (#176): 顔の検出結果は画像 (draftId) ごとに 1 回だけ取り、瞳・美肌で使い回す。
  // 検出のライブラリ (WASM) は押したときに動的 import する (現像の初期表示に載せない)
  const facesRef = useRef<{ draftId: string; faces: FaceResult[] } | null>(null);
  /** 顔の検出 (画像ごとに 1 回)。失敗は null (文言は呼ぶ側で出す) */
  const detectFacesOnce = async (
    source: LoadedImage,
    draftId: string,
  ): Promise<FaceResult[] | null> => {
    if (facesRef.current?.draftId === draftId) return facesRef.current.faces;
    dispatch({ type: "ui/inference", inference: { status: "loading", progress: null } });
    try {
      const { detectFaces } = await import("../inference/face.ts");
      const faces = await detectFaces(source.bitmap, {
        onProgress: (progress) =>
          dispatch({ type: "ui/inference", inference: { status: "loading", progress } }),
      });
      facesRef.current = { draftId, faces };
      return faces;
    } catch (e) {
      console.error("face detection failed", e);
      return null;
    } finally {
      dispatch({ type: "ui/inference", inference: { status: "idle", progress: null } });
    }
  };
  /** 画像の埋め込み (SAM、画像ごとに 1 回)。失敗は false */
  const prepareSegmenterOnce = async (source: LoadedImage): Promise<boolean> => {
    dispatch({ type: "ui/inference", inference: { status: "loading", progress: null } });
    try {
      const { prepareSegmenter } = await import("../inference/segment.ts");
      await prepareSegmenter(source.bitmap, {
        onProgress: (progress) =>
          dispatch({ type: "ui/inference", inference: { status: "loading", progress } }),
      });
      return true;
    } catch (e) {
      console.error("segmenter failed", e);
      return false;
    } finally {
      dispatch({ type: "ui/inference", inference: { status: "idle", progress: null } });
    }
  };

  // 人物補正 (#175): 検出 → 人物を選ぶ → プリセットで 5 件 (背景・人物・顔・瞳 ×2) を 1 手で置く
  const portraitDetect = async () => {
    const source = state.source;
    const draftId = state.draftId;
    if (!source || !draftId || state.ui.local.inference.status !== "idle") return;
    const faces = await detectFacesOnce(source, draftId);
    if (!faces) {
      dispatch({ type: "portrait/faces", faces: [] });
      dispatch({ type: "ui/notice", notice: AUTO_SELECT_FAILED });
      return;
    }
    dispatch({ type: "portrait/faces", faces });
    if (faces.length === 0) dispatch({ type: "ui/notice", notice: AUTO_SELECT_FAILED });
  };
  const portraitApply = async (presetId: PortraitPresetId) => {
    const source = state.source;
    const faces = state.ui.portrait.faces;
    const face = faces?.[state.ui.portrait.selectedFace];
    if (!source || !face || state.ui.local.inference.status !== "idle") return;
    if (activePortraitGroup(state)) {
      dispatch({ type: "portrait/preset", presetId });
      return;
    }
    const preset = findPortraitPreset(presetId);
    if (!preset) return;
    // 1 人で最大 5 件 (背景・人物・顔・瞳 ×2) 使う。入り切らなければ先に伝える
    if (MAX_LOCAL_ADJUSTMENTS - recipe.localAdjustments.length < 5) {
      dispatch({ type: "ui/notice", notice: PORTRAIT_FULL });
      return;
    }
    if (!(await prepareSegmenterOnce(source))) {
      dispatch({ type: "ui/notice", notice: AUTO_SELECT_FAILED });
      return;
    }
    dispatch({ type: "ui/inference", inference: { status: "running", progress: null } });
    try {
      const { segmentAt } = await import("../inference/segment.ts");
      const center = faceCenter(face);
      const { masks } = await segmentAt(center.x, center.y);
      const person = masks[0];
      if (!person || person.kind !== "bitmap") throw new Error("no person mask");
      dispatch({
        type: "portrait/apply",
        items: buildPortraitItems(face, person, preset, 100),
        presetId,
      });
    } catch (e) {
      console.error("portrait failed", e);
      dispatch({ type: "ui/notice", notice: AUTO_SELECT_FAILED });
    } finally {
      dispatch({ type: "ui/inference", inference: { status: "idle", progress: null } });
    }
  };
  const portraitGroupId = activePortraitGroup(state);
  const portraitEffect = (() => {
    const { presetId } = state.ui.portrait;
    const preset = presetId ? findPortraitPreset(presetId) : undefined;
    return portraitGroupId && preset ? portraitAmount(recipe, portraitGroupId, preset) : 100;
  })();

  const autoSelect = async (kind: "eyes" | "skin" | SegmentSelectionKind) => {
    const source = state.source;
    const draftId = state.draftId;
    if (!source || !draftId || state.ui.local.inference.status !== "idle") return;
    if (kind === "gear" || kind === "person" || kind === "background") {
      // タップで切る (#177): 画像の埋め込み (初回は数秒) を済ませてからタップを待つ
      if (!(await prepareSegmenterOnce(source))) {
        dispatch({ type: "ui/notice", notice: AUTO_SELECT_FAILED });
        return;
      }
      dispatch({ type: "ui/tap", tap: kind });
      return;
    }
    const faces = await detectFacesOnce(source, draftId);
    if (!faces) {
      dispatch({ type: "ui/notice", notice: AUTO_SELECT_FAILED });
      return;
    }
    const plan = planFaceSelection(kind, faces);
    if (plan.items.length > 0) {
      dispatch({ type: "local/add-auto", items: plan.items, label: plan.label });
    }
    if (plan.notice) dispatch({ type: "ui/notice", notice: plan.notice });
  };

  const onTap = async (uv: Point) => {
    const kind = state.ui.local.tap;
    if (!kind) return;
    dispatch({ type: "ui/inference", inference: { status: "running", progress: null } });
    try {
      const { segmentAt } = await import("../inference/segment.ts");
      const { masks } = await segmentAt(uv.x, uv.y);
      const plan = planSegmentSelection(kind, masks);
      dispatch({ type: "ui/inference", inference: { status: "idle", progress: null } });
      if (plan.items.length > 0) {
        dispatch({
          type: "local/add-auto",
          items: plan.items,
          label: plan.label,
          candidates: masks,
        });
      } else {
        dispatch({ type: "ui/tap", tap: null });
      }
      if (plan.notice) dispatch({ type: "ui/notice", notice: plan.notice });
    } catch (e) {
      console.error("segmentation failed", e);
      dispatch({ type: "ui/inference", inference: { status: "idle", progress: null } });
      dispatch({ type: "ui/tap", tap: null });
      dispatch({ type: "ui/notice", notice: AUTO_SELECT_FAILED });
    }
  };
  const onSegmentLevel = (localId: string, index: number) => {
    const candidate = state.ui.local.segment?.masks[index];
    const target = recipe.localAdjustments.find((l) => l.id === localId);
    if (!candidate || !target || target.mask.kind !== "bitmap") return;
    // 反転 (背景) と塗り足したストロークは保ったまま、下地だけ差し替える
    const mask = {
      ...candidate,
      ...(candidate.kind === "bitmap"
        ? { invert: target.mask.invert, strokes: target.mask.strokes }
        : {}),
    };
    dispatch({
      type: "local/mask-commit",
      id: localId,
      mask,
      label: `切り抜き: ${SAM_LEVELS[index]?.label ?? index}`,
    });
  };

  const zoomBy = (factor: number) => rendererRef.current?.zoomBy(factor);
  const zoomFit = () => rendererRef.current?.resetView();
  const zoomActual = () => rendererRef.current?.zoomToActual();
  // 表示倍率 (元画像の px に対して)。デバイスの px ではなく CSS px
  const zoomPercent = Math.round(view.scale * 100);

  // 下書きを自動保存 (レシピ確定ごと)
  useEffect(() => {
    if (!state.source || !state.draftId) return;
    const { source, draftId } = state;
    void editorDrafts.save({
      id: draftId,
      name: source.name,
      blob: source.blob,
      recipe,
      updatedAt: Date.now(),
    });
  }, [state.source, state.draftId, recipe, state]);

  const openFile = useCallback(async (file: File, draft?: { id: string; recipe: EditRecipe }) => {
    try {
      const image = await loadImageFile(file);
      const draftId = draft?.id ?? crypto.randomUUID();
      const r = rendererRef.current;
      dispatch({
        type: "image/loaded",
        image,
        draftId,
        ...(draft ? { recipe: draft.recipe } : {}),
      });
      r?.setImage(image.bitmap, draft?.recipe ?? initialEditorState.history.present);
    } catch (e) {
      const reason = e instanceof ImageLoadError ? e.reason : "decode_failed";
      dispatch({ type: "image/failed", error: ERROR_TEXT[reason] ?? reason });
    }
  }, []);

  // /edit?draft=<id>: 投稿設定の「現像をやり直す」(#64)。下書きの原本とレシピを開き直し、同じ draftId で書き出す
  const requestedDraft = searchParams.get("draft");
  useEffect(() => {
    if (!requestedDraft) return;
    let cancelled = false;
    void editorDrafts.load(requestedDraft).then((draft) => {
      if (cancelled) return;
      // 1 回きり。リロードで再適用されないよう URL から外す
      setSearchParams(
        (sp) => {
          sp.delete("draft");
          return sp;
        },
        { replace: true },
      );
      if (!draft) {
        dispatch({
          type: "ui/error",
          error: "元の画像が端末に残っていないため、もう一度画像を選んでください。",
        });
        return;
      }
      void openFile(new File([draft.blob], draft.name, { type: draft.blob.type }), {
        id: draft.id,
        recipe: draft.recipe,
      });
    });
    return () => {
      cancelled = true;
    };
    // openFile は安定、setSearchParams は毎回変わるので依存から外す (react-hooks の lint は入れていない)
  }, [requestedDraft]);

  // 画像が後から来た場合 (レンダラ初期化前に読み込んだ) の反映
  useEffect(() => {
    const r = rendererRef.current;
    if (ready && r && state.source) r.setImage(state.source.bitmap, recipe);
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
      sendEditorEvent("save");
    } catch {
      dispatch({ type: "ui/error", error: t("書き出しに失敗しました。", "Export failed.") });
    }
  };

  const onPost = async () => {
    if (!state.source || !state.draftId) return;
    try {
      const blob = await exportBlob(recipe);
      await addPendingExport({ draftId: state.draftId, blob, recipe, createdAt: Date.now() });
      sendEditorEvent("to_post");
      void navigate("/edit/post");
    } catch (error) {
      dispatch({
        type: "ui/error",
        error:
          error instanceof Error ? error.message : t("書き出しに失敗しました。", "Export failed."),
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
  // 書き出しはレンダラが要る。画像の読み込みより WebGL の初期化が遅れることがある (CI の headless で顕著) ので、
  // 準備できるまで押せない
  const canExport = hasImage && ready && !state.ui.exporting;
  const lastOp = undoLabel(state.history);
  const nextOp = redoLabel(state.history);
  const undoTitle = lastOp
    ? t(`${lastOp} を取り消す (Ctrl+Z)`, `Undo ${lastOp} (Ctrl+Z)`)
    : t("取り消す操作はありません", "Nothing to undo");
  const redoTitle = nextOp
    ? t(`${nextOp} をやり直す (Ctrl+Shift+Z)`, `Redo ${nextOp} (Ctrl+Shift+Z)`)
    : t("やり直す操作はありません", "Nothing to redo");
  const canvasRatio = rendererRef.current
    ? rendererRef.current.canvasSize.width / rendererRef.current.canvasSize.height
    : 1;

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col gap-3 lg:flex-row">
      {/* min-w-0: canvas の明示幅で flex の子が縮めなくなり、窓を狭めたとき右パネルが押し出されるのを防ぐ */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
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
            {t("画像を開く", "Open image")}
          </button>
          <button
            type="button"
            className={toolBtn + " aria-pressed:bg-accent aria-pressed:text-accent-ink"}
            disabled={!hasImage || state.ui.cropping}
            aria-pressed={state.ui.comparing}
            onClick={() => dispatch({ type: "ui/compare", on: !state.ui.comparing })}
            data-testid="compare-toggle"
          >
            {t("比較", "Compare")}
          </button>
          <button
            type="button"
            className={toolBtn}
            disabled={!canUndo(state.history)}
            onClick={() => dispatch({ type: "history/undo" })}
            title={undoTitle}
            aria-label={undoTitle}
            data-testid="history-undo"
          >
            <span aria-hidden="true">←</span> {t("戻る", "Undo")}
          </button>
          <button
            type="button"
            className={toolBtn}
            disabled={!canRedo(state.history)}
            onClick={() => dispatch({ type: "history/redo" })}
            title={redoTitle}
            aria-label={redoTitle}
            data-testid="history-redo"
          >
            {t("進む", "Redo")} <span aria-hidden="true">→</span>
          </button>
          {lastOp && (
            <span className="hidden text-xs text-ink-muted md:inline" data-testid="history-last">
              {t("最後の操作", "Last action")}: {lastOp}
            </span>
          )}
          <button
            type="button"
            className={toolBtn}
            disabled={!hasImage}
            onClick={() => dispatch({ type: "recipe/reset" })}
          >
            {t("全リセット", "Reset all")}
          </button>
          <span className="flex-1" />
          <span
            className="flex items-center gap-1 text-sm"
            role="group"
            aria-label={t("表示倍率", "Zoom")}
            data-testid="zoom-group"
          >
            <button
              type="button"
              className={toolBtn}
              disabled={!hasImage}
              aria-label={t("縮小", "Zoom out")}
              title={t("縮小 (ホイール)", "Zoom out (wheel)")}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className={toolBtn + " min-w-[4.5rem] tabular-nums"}
              disabled={!hasImage}
              title={t("クリックで等倍 (100%)", "Click for actual size (100%)")}
              onClick={zoomActual}
              data-testid="zoom-percent"
            >
              {hasImage ? `${zoomPercent}%` : "–"}
            </button>
            <button
              type="button"
              className={toolBtn}
              disabled={!hasImage}
              aria-label={t("拡大", "Zoom in")}
              title={t("拡大 (ホイール)", "Zoom in (wheel)")}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              +
            </button>
            <button
              type="button"
              className={toolBtn}
              disabled={!hasImage}
              onClick={zoomFit}
              title={t("全体が収まる大きさに戻す", "Fit the whole image")}
            >
              {t("フィット", "Fit")}
            </button>
          </span>
          <button
            type="button"
            className={toolBtn}
            disabled={!canExport}
            onClick={onSave}
            data-testid="save"
          >
            {state.ui.exporting ? t("書き出し中…", "Exporting…") : t("端末に保存", "Save")}
          </button>
          <button
            type="button"
            className={toolBtn + " bg-accent hover:bg-accent-strong text-accent-ink"}
            disabled={!canExport}
            onClick={onPost}
          >
            {t("投稿へ", "Continue to post")}
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
          className="relative min-h-0 flex-1 touch-none overflow-hidden rounded bg-surface-muted"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void openFile(f);
          }}
        >
          {!hasImage && (
            <p className="absolute inset-0 grid place-items-center text-sm text-ink-muted">
              {t(
                "PNG / JPEG をドロップするか「画像を開く」を押してください",
                "Drop a PNG or JPEG here, or select Open image",
              )}
            </p>
          )}
          {hasImage && state.ui.comparing && !state.ui.cropping && (
            <CompareSlider
              view={view}
              position={state.ui.comparePosition}
              onChange={(position) => dispatch({ type: "ui/compare-position", position })}
            />
          )}
          {hasImage &&
            state.source &&
            state.ui.tool === "local" &&
            selectedLocal?.mask.kind === "ellipse" &&
            state.ui.local.showHandles &&
            !state.ui.comparing &&
            !state.ui.cropping && (
              <EllipseMaskOverlay
                view={view}
                source={{ width: state.source.bitmap.width, height: state.source.bitmap.height }}
                geometry={recipe.geometry}
                mask={selectedLocal.mask}
                onPreview={(mask) =>
                  dispatch({ type: "local/mask-preview", id: selectedLocal.id, mask })
                }
                onCommit={(mask) =>
                  dispatch({ type: "local/mask-commit", id: selectedLocal.id, mask })
                }
                onDrawing={(on) => dispatch({ type: "ui/drawing", on })}
              />
            )}
          {hasImage &&
            state.source &&
            state.ui.tool === "local" &&
            selectedLocal &&
            selectedLocal.mask.kind !== "ellipse" &&
            !state.ui.comparing &&
            !state.ui.cropping && (
              <BrushOverlay
                view={view}
                source={{ width: state.source.bitmap.width, height: state.source.bitmap.height }}
                geometry={recipe.geometry}
                brush={state.ui.local.brush}
                onPreview={(segment) =>
                  rendererRef.current?.previewStroke(selectedLocal.id, segment)
                }
                onCommit={(stroke) =>
                  dispatch({ type: "local/stroke-commit", id: selectedLocal.id, stroke })
                }
                onDrawing={(on) => dispatch({ type: "ui/drawing", on })}
                onCancel={() => rendererRef.current?.discardPreviewStroke(selectedLocal.id)}
              />
            )}
          {hasImage &&
            state.source &&
            state.ui.tool === "local" &&
            state.ui.local.tap &&
            !state.ui.cropping && (
              <TapOverlay
                view={view}
                source={{ width: state.source.bitmap.width, height: state.source.bitmap.height }}
                geometry={recipe.geometry}
                hint={
                  state.ui.local.tap === "gear"
                    ? t("切りたい装備をタップ", "Tap the item to select")
                    : t("キャラクターをタップ", "Tap the character")
                }
                onTap={(uv) => void onTap(uv)}
                onCancel={() => dispatch({ type: "ui/tap", tap: null })}
              />
            )}
          {hasImage &&
            state.source &&
            state.ui.tool === "portrait" &&
            (state.ui.portrait.faces?.length ?? 0) > 1 &&
            !state.ui.comparing &&
            !state.ui.cropping && (
              <FaceBoxesOverlay
                view={view}
                source={{ width: state.source.bitmap.width, height: state.source.bitmap.height }}
                geometry={recipe.geometry}
                faces={state.ui.portrait.faces ?? []}
                selected={state.ui.portrait.selectedFace}
                onSelect={(index) => dispatch({ type: "portrait/select-face", index })}
              />
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
        <div role="tablist" className="flex overflow-x-auto border-b border-line-soft">
          {(
            [
              ["presets", t("プリセット", "Presets")],
              ["adjust", t("補正", "Adjust")],
              ["portrait", t("人物補正", "Portrait")],
              ["local", t("部分補正", "Local")],
              ["geometry", t("幾何", "Geometry")],
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
          {state.ui.tool === "portrait" && (
            <PortraitPanel
              faces={state.ui.portrait.faces}
              selectedFace={state.ui.portrait.selectedFace}
              groupId={portraitGroupId}
              presetId={portraitGroupId ? state.ui.portrait.presetId : null}
              amount={portraitEffect}
              inference={state.ui.local.inference}
              notice={state.ui.local.notice}
              onDetect={() => void portraitDetect()}
              onSelectFace={(index) => dispatch({ type: "portrait/select-face", index })}
              onApply={(presetId) => void portraitApply(presetId)}
              onAmountPreview={(value) => dispatch({ type: "portrait/amount-preview", value })}
              onAmountCommit={(value) => dispatch({ type: "portrait/amount-commit", value })}
              onGoLocal={() => dispatch({ type: "ui/tool", tool: "local" })}
            />
          )}
          {state.ui.tool === "local" && (
            <LocalPanel
              list={recipe.localAdjustments}
              selectedId={selectedLocal?.id ?? null}
              showMask={state.ui.local.showMask}
              showHandles={state.ui.local.showHandles}
              onShowHandles={(on) => dispatch({ type: "ui/show-handles", on })}
              brush={state.ui.local.brush}
              inference={state.ui.local.inference}
              notice={state.ui.local.notice}
              tap={state.ui.local.tap}
              segment={state.ui.local.segment}
              onAuto={(kind) => void autoSelect(kind)}
              onCancelTap={() => dispatch({ type: "ui/tap", tap: null })}
              onSegmentLevel={onSegmentLevel}
              onBrush={(brush) => dispatch({ type: "ui/brush", brush })}
              onAdd={(kind, presetId) =>
                dispatch({ type: "local/add", kind, presetId, at: ellipseAtView() })
              }
              onSelect={(id) => dispatch({ type: "local/select", id })}
              onRemove={(id) => dispatch({ type: "local/remove", id })}
              onToggleVisible={(id) => dispatch({ type: "local/toggle-visible", id })}
              onPreset={(id, presetId) => dispatch({ type: "local/preset", id, presetId })}
              onAmountPreview={(id, value) => dispatch({ type: "local/amount-preview", id, value })}
              onAmountCommit={(id, value) => dispatch({ type: "local/amount-commit", id, value })}
              onAdjustPreview={(id, key, value) =>
                dispatch({ type: "local/adjust-preview", id, key, value })
              }
              onAdjustCommit={(id, key, value) =>
                dispatch({ type: "local/adjust-commit", id, key, value })
              }
              onShowMask={(on) => dispatch({ type: "ui/show-mask", on })}
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
