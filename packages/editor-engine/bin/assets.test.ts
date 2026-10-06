import { describe, expect, it } from "vitest";
import { modelPaths } from "../src/inference/model-paths.ts";
import { MODEL_ASSETS, parseArgs } from "./assets.ts";

describe("MODEL_ASSETS", () => {
  const targets = MODEL_ASSETS.map((a) => a.to);
  // Worker が読むパス (model-paths.ts) からベースの "/" を外したもの
  const paths = modelPaths("/");
  const dir = (p: string) => p.replace(/^\//, "").replace(/\/$/, "");

  it("fills the face landmarker model and its WASM loaders", () => {
    expect(targets).toContain(`${dir(paths.face)}/face_landmarker.task`);
    expect(targets).toContain(`${dir(paths.face)}/wasm/vision_wasm_internal.js`);
    expect(targets).toContain(`${dir(paths.face)}/wasm/vision_wasm_internal.wasm`);
  });

  it("fills the SlimSAM model under its model id", () => {
    expect(targets).toContain(`${paths.samModelId}/config.json`);
    expect(targets).toContain(`${paths.samModelId}/onnx/vision_encoder_quantized.onnx`);
  });

  it("fills the onnxruntime WASM", () => {
    expect(targets).toContain(`${dir(paths.ortWasm)}/ort-wasm-simd-threaded.jsep.wasm`);
  });

  it("pins every download with a sha256", () => {
    for (const a of MODEL_ASSETS) {
      if (a.kind === "download") expect(a.sha256, a.to).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("parseArgs", () => {
  it("reads the output directory of fetch", () => {
    expect(parseArgs(["fetch", "--out", "models"])).toEqual({ command: "fetch", out: "models" });
  });

  it("rejects a missing output directory", () => {
    expect(() => parseArgs(["fetch"])).toThrow("--out");
  });

  it("rejects an unknown command", () => {
    expect(() => parseArgs(["pull", "--out", "models"])).toThrow("usage");
  });
});
