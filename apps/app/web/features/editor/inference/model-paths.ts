/**
 * 推論のモデルと WASM の置き場所 (ADR-0025)。ホストが同じオリジンで配る。
 * ディレクトリは版付き (`-v1`)。中身を変えたら版を上げる (apps/app/scripts/fetch-models.ts と合わせる)
 */
export const DEFAULT_MODEL_BASE_URL = "/models/";

export type ModelPaths = {
  /** MediaPipe Face Landmarker の .task と wasm/ */
  face: string;
  /** transformers.js の localModelPath。この下に samModelId のディレクトリがある */
  samRoot: string;
  samModelId: string;
  /** onnxruntime-web の WASM */
  ortWasm: string;
};

export function modelPaths(baseUrl: string): ModelPaths {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    face: `${base}face-landmarker-v1`,
    samRoot: base,
    samModelId: "slimsam-77-q8-v1",
    ortWasm: `${base}ort-v1/`,
  };
}
