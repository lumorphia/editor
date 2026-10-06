import type { BitmapMaskV3 } from "@lumorphia/editor-recipe";
import { InferenceError, type Progress } from "./face.ts";
import type { SegmentRequest, SegmentResponse } from "./segment.worker.ts";

/**
 * 装備・人物の切り抜きの呼び出し側 (#177)。Worker を 1 つ起こして使い回す。
 * 画像ごとに prepareSegmenter (埋め込み、重い) を 1 回、タップごとに segmentAt (軽い)。
 */

let worker: Worker | null = null;
let seq = 0;
/** 埋め込み済みの画像の印。同じ画像なら埋め込みを使い回す */
let embeddedFor: object | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./segment.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export function resetSegmentWorker(): void {
  worker?.terminate();
  worker = null;
  embeddedFor = null;
}

type Body = SegmentRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;

function call<T extends SegmentResponse["type"]>(
  req: Body,
  done: T,
  options: { onProgress?: ((p: Progress) => void) | undefined; transfer?: Transferable[] } = {},
): Promise<Extract<SegmentResponse, { type: T }>> {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<SegmentResponse>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progress") {
        options.onProgress?.({ loaded: m.loaded, total: m.total });
        return;
      }
      cleanup();
      if (m.type === done) resolve(m as Extract<SegmentResponse, { type: T }>);
      else if (m.type === "error") reject(new InferenceError(m.message));
      else reject(new InferenceError(`unexpected ${m.type}`));
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      resetSegmentWorker();
      reject(new InferenceError(e.message || "worker error"));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, ...req }, options.transfer ?? []);
  });
}

/** 画像の埋め込み。同じ bitmap なら 2 回目以降は何もしない。戻り値は埋め込みに掛かった ms (使い回しは 0) */
export async function prepareSegmenter(
  bitmap: ImageBitmap,
  options: { modelBaseUrl: string; onProgress?: (p: Progress) => void },
): Promise<number> {
  if (embeddedFor === bitmap) return 0;
  const copy = await createImageBitmap(bitmap);
  const res = await call(
    { type: "embed", bitmap: copy, modelBaseUrl: options.modelBaseUrl },
    "embedded",
    {
      onProgress: options.onProgress,
      transfer: [copy],
    },
  );
  embeddedFor = bitmap;
  return res.ms;
}

export type Segmentation = {
  /** 3 段の粒度 (0 = 全体、1 = 装備、2 = 部品)。segment-masks.ts の SAM_LEVELS */
  masks: BitmapMaskV3[];
  scores: number[];
  ms: number;
};

/** タップ位置 (幾何を掛ける前の画像の正規化座標) の切り抜き。prepareSegmenter のあとで */
export async function segmentAt(x: number, y: number): Promise<Segmentation> {
  const res = await call({ type: "segment", x, y }, "segmented");
  return { masks: res.masks, scores: res.scores, ms: res.ms };
}
