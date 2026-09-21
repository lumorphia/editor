/**
 * ブラウザ内の認識 (ADR-0025) に使うモデルと WASM を apps/app/models/<name>-v<n>/ に揃える。
 * dev と build の前に走る (package.json)。git には入れない (.gitignore)。
 *
 * - ダウンロードするものは URL と sha256 を固定する。ハッシュが合わなければ捨てて失敗する
 * - node_modules からコピーするもの (WASM) は、パッケージの版を上げたら <name>-v<n> の n も上げる
 *   (静的アセットは immutable でキャッシュされるので、同じパスで中身を変えない)
 * - 既にあってハッシュが合えば何もしない (2 回目以降は一瞬で終わる)
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
/** public/ ではなく models/ に置き、/models/ は Fastify の static で配る (server/plugins/models.ts)。
 * public/ に置くと dev の Vite が import() に ?import を足して「URL を export するモジュール」に変え、
 * MediaPipe の WASM ローダーが読めない */
export const MODELS_DIR = path.join(root, "models");
const out = MODELS_DIR;

type Download = { kind: "download"; to: string; url: string; sha256: string };
type Copy = { kind: "copy"; to: string; from: string; prepend?: string; append?: string };

/** 配るもの。to は models/ からの相対パス */
const ASSETS: (Download | Copy)[] = [
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
  ].map((f): Copy => ({
    kind: "copy",
    to: `face-landmarker-v1/wasm/${f}`,
    from: path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm", f),
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
  ).map(([f, sha256]): Download => ({
    kind: "download",
    to: `slimsam-77-q8-v1/${f}`,
    url: `https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/${f}`,
    sha256,
  })),
  // onnxruntime-web の WASM (transformers.js が同梱する jsep 版)。MIT
  ...["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"].map((f): Copy => ({
    kind: "copy",
    to: `ort-v1/${f}`,
    from: path.join(root, "node_modules", "@huggingface", "transformers", "dist", f),
  })),
];

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  } catch {
    return null;
  }
}

async function download(asset: Download): Promise<void> {
  const target = path.join(out, asset.to);
  if ((await sha256(target)) === asset.sha256) return;
  console.log(`models: downloading ${asset.to}`);
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`models: ${asset.url} -> ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(body).digest("hex");
  if (got !== asset.sha256) {
    throw new Error(
      `models: sha256 mismatch for ${asset.to}: expected ${asset.sha256}, got ${got}`,
    );
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

async function copy(asset: Copy): Promise<void> {
  const target = path.join(out, asset.to);
  let body: Buffer;
  try {
    body = await readFile(asset.from);
  } catch {
    throw new Error(`models: missing ${asset.from} (pnpm install を先に)`);
  }
  if (asset.prepend) body = Buffer.concat([Buffer.from(asset.prepend), body]);
  if (asset.append) body = Buffer.concat([body, Buffer.from(asset.append)]);
  const want = createHash("sha256").update(body).digest("hex");
  if ((await sha256(target)) === want) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

await mkdir(out, { recursive: true });
for (const asset of ASSETS) {
  if (asset.kind === "download") await download(asset);
  else await copy(asset);
}
// git に入れないことを、ディレクトリ自身にも書いておく
try {
  await access(path.join(out, ".gitignore"));
} catch {
  await writeFile(path.join(out, ".gitignore"), "*\n");
}
console.log(`models: ${ASSETS.length} files ready in ${path.relative(root, out)}`);
