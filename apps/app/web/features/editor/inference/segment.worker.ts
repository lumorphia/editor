/// <reference lib="webworker" />
/**
 * 装備・人物の切り抜きの Web Worker (#177、ADR-0025)。SlimSAM (Xenova/slimsam-77-uniform、q8) を
 * transformers.js + onnxruntime-web (WASM) で動かす。
 *
 * - 画像 1 枚につき埋め込み (vision encoder) を 1 回 (重い、spike で 2 秒)。使い回す
 * - タップごとにデコード (0.2 秒)。3 段の粒度のマスクを全部 bitmap にして返す (spike で 0 = 全体、1 = 装備、2 = 部品)
 * - モデルと WASM は /models/ (自前ホスト)。HF Hub には行かない
 * - COOP / COEP が無いので SharedArrayBuffer は無く、ORT はシングルスレッド
 *
 * spike (docs/spikes/2026-09-21-auto-select.md) の segmentAnything を移したもの。
 */
import type * as TransformersNs from "@huggingface/transformers";
import type { BitmapMaskV3 } from "@prismtone/shared/recipe";
import { toBitmapMask } from "./segment-masks.ts";

export const SAM_MODEL_BASE = "/models/slimsam-77-q8-v1";
export const ORT_WASM_BASE = "/models/ort-v1/";
export const SAM_MODEL_ID = "slimsam-77-q8-v1";

export type SegmentRequest =
  | { id: number; type: "embed"; bitmap: ImageBitmap }
  | { id: number; type: "segment"; x: number; y: number };
export type SegmentResponse =
  | { id: number; type: "progress"; loaded: number; total: number }
  | { id: number; type: "embedded"; ms: number }
  | { id: number; type: "segmented"; masks: BitmapMaskV3[]; scores: number[]; ms: number }
  | { id: number; type: "error"; message: string };

type Transformers = typeof TransformersNs;
type SamInputs = { original_sizes: number[][]; reshaped_input_sizes: number[][] } & Record<
  string,
  unknown
>;
type TensorLike = { dims: number[]; data: ArrayLike<number> };
type SamProcessor = ((image: unknown) => Promise<SamInputs>) & {
  post_process_masks: (
    masks: unknown,
    originalSizes: number[][],
    reshapedSizes: number[][],
  ) => Promise<TensorLike[]>;
};
type SamModel = {
  get_image_embeddings: (inputs: SamInputs) => Promise<Record<string, unknown>>;
  (inputs: Record<string, unknown>): Promise<{ pred_masks: unknown; iou_scores: TensorLike }>;
};

let lib: Transformers | null = null;
let model: SamModel | null = null;
let processor: SamProcessor | null = null;
let embedded: { inputs: SamInputs; embeddings: Record<string, unknown> } | null = null;

async function load(onProgress: (loaded: number, total: number) => void) {
  if (lib && model && processor) return { lib, model, processor };
  const t = await import("@huggingface/transformers");
  // 自前ホストだけを見る。models/ の下は HF の repo と同じ配置 (config.json, onnx/*.onnx)
  t.env.allowLocalModels = true;
  t.env.allowRemoteModels = false;
  t.env.localModelPath = "/models/";
  if (t.env.backends.onnx.wasm) t.env.backends.onnx.wasm.wasmPaths = ORT_WASM_BASE;
  const totals = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: {
    status: string;
    file?: string;
    loaded?: number;
    total?: number;
  }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    totals.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let loaded = 0;
    let total = 0;
    for (const v of totals.values()) {
      loaded += v.loaded;
      total += v.total;
    }
    onProgress(loaded, total);
  };
  const m = (await t.SamModel.from_pretrained(SAM_MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback,
  })) as unknown as SamModel;
  const pr = (await t.AutoProcessor.from_pretrained(SAM_MODEL_ID, {
    progress_callback,
  })) as unknown as SamProcessor;
  lib = t;
  model = m;
  processor = pr;
  return { lib: t, model: m, processor: pr };
}

function rawImageOf(t: Transformers, bitmap: ImageBitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return new t.RawImage(data.data, bitmap.width, bitmap.height, 4);
}

async function embed(
  bitmap: ImageBitmap,
  onProgress: (l: number, t: number) => void,
): Promise<number> {
  const { lib: t, model: m, processor: pr } = await load(onProgress);
  const raw = rawImageOf(t, bitmap);
  const t0 = performance.now();
  const inputs = await pr(raw);
  const embeddings = await m.get_image_embeddings(inputs);
  embedded = { inputs, embeddings };
  return performance.now() - t0;
}

async function segment(x: number, y: number) {
  if (!embedded || !lib || !model || !processor) throw new Error("not embedded");
  const t0 = performance.now();
  const { inputs, embeddings } = embedded;
  const reshaped = inputs.reshaped_input_sizes[0]!; // [h, w]
  // タップ位置は正規化座標 → 埋め込みに使った縮小後の px
  const input_points = new lib.Tensor(
    "float32",
    [x * reshaped[1]!, y * reshaped[0]!],
    [1, 1, 1, 2],
  );
  const input_labels = new lib.Tensor("int64", [1n], [1, 1, 1]);
  const out = await model({ ...embeddings, input_points, input_labels });
  const masks = await processor.post_process_masks(
    out.pred_masks,
    inputs.original_sizes,
    inputs.reshaped_input_sizes,
  );
  const m = masks[0]!; // [1, 3, H, W]
  const [, levels, h, w] = m.dims as [number, number, number, number];
  const result: BitmapMaskV3[] = [];
  for (let k = 0; k < levels; k++) {
    const bits = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) bits[i] = m.data[k * w * h + i] ? 1 : 0;
    result.push(toBitmapMask(bits, w, h));
  }
  return { masks: result, scores: Array.from(out.iou_scores.data), ms: performance.now() - t0 };
}

self.onmessage = async (e: MessageEvent<SegmentRequest>) => {
  const req = e.data;
  const post = (m: SegmentResponse) => self.postMessage(m);
  try {
    if (req.type === "embed") {
      try {
        const ms = await embed(req.bitmap, (loaded, total) =>
          post({ id: req.id, type: "progress", loaded, total }),
        );
        post({ id: req.id, type: "embedded", ms });
      } finally {
        req.bitmap.close();
      }
    } else {
      const r = await segment(req.x, req.y);
      post({ id: req.id, type: "segmented", ...r });
    }
  } catch (err) {
    post({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
