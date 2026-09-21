/**
 * ブラウザ内の認識 (ADR-0025) に使うモデルと WASM を public/models/<name>-v<n>/ に揃える。
 * dev と build の前に走る (package.json)。git には入れない (.gitignore)。
 *
 * - ダウンロードするものは URL と sha256 を固定する。ハッシュが合わなければ捨てて失敗する
 * - node_modules からコピーするもの (WASM) は、パッケージの版を上げたら <name>-v<n> の n も上げる
 *   (静的アセットは immutable でキャッシュされるので、同じパスで中身を変えない)
 * - 既にあってハッシュが合えば何もしない (2 回目以降は一瞬で終わる)
 */
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "models");

type Download = { kind: "download"; to: string; url: string; sha256: string };
type Copy = { kind: "copy"; to: string; from: string };

/** 配るもの。to は public/models/ からの相対パス */
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
  const [a, b] = await Promise.all([sha256(target), sha256(asset.from)]);
  if (b === null) throw new Error(`models: missing ${asset.from} (pnpm install を先に)`);
  if (a === b) return;
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(asset.from, target);
}

await mkdir(out, { recursive: true });
for (const asset of ASSETS) {
  if (asset.kind === "download") await download(asset);
  else await copy(asset);
}
// public/ の中で git に入れないことを、ディレクトリ自身にも書いておく
try {
  await access(path.join(out, ".gitignore"));
} catch {
  await writeFile(path.join(out, ".gitignore"), "*\n");
}
console.log(`models: ${ASSETS.length} files ready in ${path.relative(root, out)}`);
