/**
 * ブラウザ内の認識 (ADR-0025) に使うモデルと WASM。ホストが同じオリジンで配る (既定は /models/)。
 * to は配る場所からの相対パスで、Worker が読むパス (src/inference/model-paths.ts) と合わせる。
 *
 * - ダウンロードするものは URL と sha256 を固定する。ハッシュが合わなければ捨てて失敗する
 * - 依存のパッケージからコピーするもの (WASM) は、その版を上げたら <name>-v<n> の n も上げる
 *   (静的アセットは immutable でキャッシュされるので、同じパスで中身を変えない)
 */
export type DownloadAsset = { kind: "download"; to: string; url: string; sha256: string };
export type CopyAsset = {
  kind: "copy";
  to: string;
  /** editor-engine の依存のパッケージ名と、その中のパス */
  from: { pkg: string; path: string };
  prepend?: string;
  append?: string;
};
export type ModelAsset = DownloadAsset | CopyAsset;

export const MODEL_ASSETS: readonly ModelAsset[] = [
  // MediaPipe Face Landmarker (瞳・顔、#176)。Apache-2.0
  {
    kind: "download",
    to: "face-landmarker-v1/face_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    sha256: "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  },
  ...[
    "vision_wasm_internal.js",
    "vision_wasm_internal.wasm",
    "vision_wasm_nosimd_internal.js",
    "vision_wasm_nosimd_internal.wasm",
  ].map((f): CopyAsset => ({
    kind: "copy",
    to: `face-landmarker-v1/wasm/${f}`,
    from: { pkg: "@mediapipe/tasks-vision", path: `wasm/${f}` },
    // ローダー (.js) は classic script (sloppy mode) 前提。module worker からは MediaPipe が import() で
    // 読む (importScripts が使えない) ので、ES module (strict mode) でも動くように 2 か所を補う:
    // - `var ModuleFactory` は module スコープに閉じるので、末尾で self に出す
    // - if ブロック内の `function custom_dbg` は strict では外に見えないので、先頭で self に置く
    // classic worker (importScripts) で読んでも害はない
    ...(f.endsWith(".js")
      ? {
          prepend:
            'if (typeof self.custom_dbg === "undefined") self.custom_dbg = (...a) => console.warn(...a);\n',
          append: "\n;self.ModuleFactory = ModuleFactory;\n",
        }
      : {}),
  })),
  // SlimSAM (装備・人物の切り抜き、#177)。Xenova/slimsam-77-uniform の q8。Apache-2.0
  ...(
    [
      ["config.json", "6339884f168658d3ca6473b486973913fb33e84e625e06ae2dd7b4a808187419"],
      [
        "preprocessor_config.json",
        "225545a743c654e3c495ec6f545a0eaba57c8ba3fbbd8483b3cb1c0fc58db517",
      ],
      [
        "onnx/vision_encoder_quantized.onnx",
        "cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971",
      ],
      [
        "onnx/prompt_encoder_mask_decoder_quantized.onnx",
        "cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2",
      ],
    ] as const
  ).map(([f, sha256]): DownloadAsset => ({
    kind: "download",
    to: `slimsam-77-q8-v1/${f}`,
    url: `https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/${f}`,
    sha256,
  })),
  // onnxruntime-web の WASM (transformers.js が同梱する jsep 版)。MIT
  ...["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"].map(
    (f): CopyAsset => ({
      kind: "copy",
      to: `ort-v1/${f}`,
      from: { pkg: "@huggingface/transformers", path: `dist/${f}` },
    }),
  ),
];

export type Args = { command: "fetch"; out: string };

const USAGE = "usage: editor-models fetch --out <dir>";

export function parseArgs(argv: readonly string[]): Args {
  const [command, ...rest] = argv;
  if (command !== "fetch") throw new Error(USAGE);
  const i = rest.indexOf("--out");
  const out = i >= 0 ? rest[i + 1] : undefined;
  if (!out) throw new Error(`--out が要る。${USAGE}`);
  return { command, out };
}
