/// <reference lib="webworker" />
/**
 * 顔検出の Web Worker (#176、ADR-0025)。MediaPipe Face Landmarker (WASM、CPU) を動かし、
 * 顔ごとの輪郭・目・唇・虹彩と blendshape (まばたき) を正規化座標で返す。
 *
 * spike (docs/spikes/2026-09-21-auto-select.md) の detectFace を移したもの:
 * - 画像全体 → 2 倍の 3×3 の重なる切り抜き の順に検出する (ピラミッド)。BlazeFace 短距離は顔が画面の
 *   大部分を占める前提で、スクショの中くらいの顔をそのままでは拾えない
 * - 同じ顔 (IoU 0.3 以上) は先に見つかった方 (広い文脈) を残す。切り抜きの縁にかかる顔は捨てる
 * - 3 倍の段は誤検出だけ増えたので入れない
 *
 * 画像も推論もここ (ブラウザ) で完結し、外には送らない。モデルと WASM は /models/ (自前ホスト)。
 */
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { FaceResult, NormalizedPoint } from "./face-masks.ts";

export const FACE_MODEL_BASE = "/models/face-landmarker-v1";
/** 進捗の表示に使う総量の目安 (モデル 3.7 MB + WASM 11 MB)。WASM の取得は MediaPipe の中なので数えられない */
export const FACE_MODEL_BYTES = 3_758_596 + 11_153_617;

export type FaceRequest = {
  id: number;
  bitmap: ImageBitmap;
  /** 検出のしきい値。spike の結果は 0.3 */
  confidence?: number;
};
export type FaceResponse =
  | { id: number; type: "progress"; loaded: number; total: number }
  | { id: number; type: "result"; faces: FaceResult[]; ms: number }
  | { id: number; type: "error"; message: string };

const CONFIDENCE = 0.3;
const PYRAMID = [2];
/** 同じ顔とみなす bbox の IoU */
const SAME_FACE_IOU = 0.3;
/** 切り抜きの縁からこの割合 (画像全体に対して) 以内にかかる顔は不完全なので捨てる */
const EDGE_MARGIN = 0.02;

/** 接続リスト ({start,end}) を辿って 1 本の輪郭 (点の index 列) にする。複数の輪があれば一番長いもの (唇の外側) */
type Connection = { start: number; end: number };

function chain(connections: readonly Connection[]): number[] {
  const next = new Map(connections.map((c) => [c.start, c.end]));
  const seen = new Set<number>();
  let best: number[] = [];
  for (const c of connections) {
    if (seen.has(c.start)) continue;
    const ring = [c.start];
    seen.add(c.start);
    for (;;) {
      const n = next.get(ring[ring.length - 1]!);
      if (n === undefined || seen.has(n)) break;
      ring.push(n);
      seen.add(n);
    }
    if (ring.length > best.length) best = ring;
  }
  return best;
}

const OVAL = chain(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL);
const LEFT_EYE = chain(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE);
const RIGHT_EYE = chain(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE);
const LIPS = chain(FaceLandmarker.FACE_LANDMARKS_LIPS);
// 虹彩は 468 (左の中心) + 469..472、473 (右の中心) + 474..477
const IRIS = { left: [468, 469, 470, 471, 472], right: [473, 474, 475, 476, 477] } as const;

type Landmark = { x: number; y: number };

let landmarker: FaceLandmarker | null = null;
let loading: Promise<FaceLandmarker> | null = null;

async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model fetch failed: ${res.status}`);
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function load(confidence: number, onProgress: (loaded: number) => void): Promise<FaceLandmarker> {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  // module worker では MediaPipe が WASM ローダーを self.import ?? import() で読む。dev の Vite は
  // 素の import() に ?import を足して public のファイルを「URL を export するモジュール」に変えて
  // しまうので、Vite の書き換えを避けた import を渡す (本番ビルドでは同じ動き)
  (self as unknown as { import?: (url: string) => Promise<unknown> }).import = (url) =>
    import(/* @vite-ignore */ url);
  loading = (async () => {
    const model = await fetchWithProgress(`${FACE_MODEL_BASE}/face_landmarker.task`, onProgress);
    const vision = await FilesetResolver.forVisionTasks(`${FACE_MODEL_BASE}/wasm`);
    const lm = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model, delegate: "CPU" },
      runningMode: "IMAGE",
      numFaces: 6,
      minFaceDetectionConfidence: confidence,
      minFacePresenceConfidence: confidence,
      outputFaceBlendshapes: true,
    });
    landmarker = lm;
    loading = null;
    return lm;
  })();
  return loading;
}

type Crop = { x: number; y: number; w: number; h: number; scale: number };

function* crops(w: number, h: number): Generator<Crop> {
  yield { x: 0, y: 0, w, h, scale: 1 };
  for (const s of PYRAMID) {
    const cw = w / s;
    const ch = h / s;
    const n = 2 * s - 1;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++)
        yield { x: (i * cw) / 2, y: (j * ch) / 2, w: cw, h: ch, scale: s };
  }
}

function iou(a: number[], b: number[]): number {
  const ix = Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!));
  const iy = Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!));
  const inter = ix * iy;
  const area = (r: number[]) => (r[2]! - r[0]!) * (r[3]! - r[1]!);
  return inter / (area(a) + area(b) - inter);
}

function bboxOf(lms: Landmark[]): [number, number, number, number] {
  const xs = OVAL.map((k) => lms[k]!.x);
  const ys = OVAL.map((k) => lms[k]!.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function detectAll(lm: FaceLandmarker, bitmap: ImageBitmap): FaceResult[] {
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const found: { lms: Landmark[]; bbox: number[]; blink: FaceResult["blink"] }[] = [];
  for (const c of crops(w, h)) {
    let res;
    if (c.scale === 1) {
      res = lm.detect(bitmap);
    } else {
      canvas.width = Math.round(c.w);
      canvas.height = Math.round(c.h);
      ctx.drawImage(bitmap, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
      res = lm.detect(canvas);
    }
    res.faceLandmarks.forEach((raw, i) => {
      // 切り抜きの正規化座標を画像全体の座標に戻す
      const lms: Landmark[] = raw.map((p) => ({
        x: (c.x + p.x * c.w) / w,
        y: (c.y + p.y * c.h) / h,
      }));
      const b = bboxOf(lms);
      if (c.scale > 1) {
        const m = EDGE_MARGIN / c.scale;
        if (
          b[0] < c.x / w + m ||
          b[1] < c.y / h + m ||
          b[2] > (c.x + c.w) / w - m ||
          b[3] > (c.y + c.h) / h - m
        )
          return;
      }
      if (found.some((f) => iou(f.bbox, b) > SAME_FACE_IOU)) return;
      const shapes = res.faceBlendshapes?.[i]?.categories ?? [];
      const shape = (name: string) => shapes.find((s) => s.categoryName === name)?.score ?? null;
      found.push({
        lms,
        bbox: b,
        blink: { left: shape("eyeBlinkLeft"), right: shape("eyeBlinkRight") },
      });
    });
  }
  return found.map(({ lms, bbox, blink }) => {
    const ring = (idx: readonly number[]): NormalizedPoint[] =>
      idx.map((k) => ({ x: lms[k]!.x, y: lms[k]!.y }));
    const iris = (idx: readonly number[]) => {
      const [c, ...rim] = idx.map((k) => lms[k]!);
      // 半径は px で測ってから幅・高さの比に戻す (楕円マスクの rx / ry と同じ意味)
      const rPx =
        rim.reduce((a, p) => a + Math.hypot((p.x - c!.x) * w, (p.y - c!.y) * h), 0) / rim.length;
      return { cx: c!.x, cy: c!.y, rx: rPx / w, ry: rPx / h };
    };
    return {
      bbox: bbox as [number, number, number, number],
      oval: ring(OVAL),
      leftEye: ring(LEFT_EYE),
      rightEye: ring(RIGHT_EYE),
      mouth: ring(LIPS),
      leftIris: iris(IRIS.left),
      rightIris: iris(IRIS.right),
      blink,
    };
  });
}

self.onmessage = async (e: MessageEvent<FaceRequest>) => {
  const { id, bitmap, confidence = CONFIDENCE } = e.data;
  const post = (m: FaceResponse) => self.postMessage(m);
  try {
    const lm = await load(confidence, (loaded) =>
      post({ id, type: "progress", loaded, total: FACE_MODEL_BYTES }),
    );
    const t0 = performance.now();
    const faces = detectAll(lm, bitmap);
    post({ id, type: "result", faces, ms: performance.now() - t0 });
  } catch (err) {
    post({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    bitmap.close();
  }
};
