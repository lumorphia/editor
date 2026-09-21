import type { FaceResult } from "./face-masks.ts";
import type { FaceRequest, FaceResponse } from "./face.worker.ts";

/**
 * 顔検出の呼び出し側 (#176)。Worker を 1 つ起こして使い回す。画像は ImageBitmap を複製して渡す
 * (Worker 側で閉じる)。進捗は初回のモデル取得の分だけ届く。
 */

export class InferenceError extends Error {
  override readonly name = "InferenceError";
}

export type Progress = { loaded: number; total: number };

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker {
  if (!worker) {
    // classic worker (Vite が iife に束ねる)。MediaPipe の WASM ローダーは importScripts で
    // vision_wasm_internal.js を読むので、module worker だと "ModuleFactory not set" で落ちる
    worker = new Worker(new URL("./face.worker.ts", import.meta.url));
  }
  return worker;
}

/** Worker を捨てる (テストや、エラー後に作り直すとき) */
export function resetFaceWorker(): void {
  worker?.terminate();
  worker = null;
}

export async function detectFaces(
  bitmap: ImageBitmap,
  options: { onProgress?: (p: Progress) => void; signal?: AbortSignal } = {},
): Promise<FaceResult[]> {
  const w = getWorker();
  const id = ++seq;
  // Worker に渡す複製 (元は現像で使い続ける)
  const copy = await createImageBitmap(bitmap);
  return new Promise<FaceResult[]>((resolve, reject) => {
    const onMessage = (e: MessageEvent<FaceResponse>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progress") {
        options.onProgress?.({ loaded: m.loaded, total: m.total });
        return;
      }
      cleanup();
      if (m.type === "result") resolve(m.faces);
      else reject(new InferenceError(m.message));
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      resetFaceWorker();
      reject(new InferenceError(e.message || "worker error"));
    };
    const onAbort = () => {
      cleanup();
      reject(new InferenceError("aborted"));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      options.signal?.removeEventListener("abort", onAbort);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    options.signal?.addEventListener("abort", onAbort);
    const req: FaceRequest = { id, bitmap: copy };
    w.postMessage(req, [copy]);
  });
}
