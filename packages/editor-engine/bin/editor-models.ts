#!/usr/bin/env node
/**
 * editor-models fetch --out <dir>
 * 認識のモデルと WASM (assets.ts) を <dir> に揃える。ホストは <dir> を同じオリジンで配る (既定の URL は /models/)。
 * 既にあってハッシュが合えば何もしない (2 回目以降は一瞬で終わる)。<dir> には .gitignore を置く
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_ASSETS, parseArgs, type CopyAsset, type DownloadAsset } from "./assets.ts";

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  } catch {
    return null;
  }
}

/** 依存のパッケージのディレクトリ。exports に package.json が無いものもあるので、入口から上へたどる */
async function packageDir(pkg: string): Promise<string> {
  let dir = path.dirname(fileURLToPath(import.meta.resolve(pkg)));
  for (;;) {
    try {
      const json = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
        name?: string;
      };
      if (json.name === pkg) return dir;
    } catch {
      // package.json の無い階層
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`models: ${pkg} が見つからない (pnpm install を先に)`);
    dir = parent;
  }
}

async function download(out: string, asset: DownloadAsset): Promise<void> {
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

async function copy(out: string, asset: CopyAsset): Promise<void> {
  const target = path.join(out, asset.to);
  const from = path.join(await packageDir(asset.from.pkg), asset.from.path);
  let body: Buffer;
  try {
    body = await readFile(from);
  } catch {
    throw new Error(`models: missing ${from} (pnpm install を先に)`);
  }
  if (asset.prepend) body = Buffer.concat([Buffer.from(asset.prepend), body]);
  if (asset.append) body = Buffer.concat([body, Buffer.from(asset.append)]);
  const want = createHash("sha256").update(body).digest("hex");
  if ((await sha256(target)) === want) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

const { out: outArg } = parseArgs(process.argv.slice(2));
const out = path.resolve(outArg);
await mkdir(out, { recursive: true });
for (const asset of MODEL_ASSETS) {
  if (asset.kind === "download") await download(out, asset);
  else await copy(out, asset);
}
// git に入れないことを、ディレクトリ自身にも書いておく
try {
  await access(path.join(out, ".gitignore"));
} catch {
  await writeFile(path.join(out, ".gitignore"), "*\n");
}
console.log(
  `models: ${MODEL_ASSETS.length} files ready in ${path.relative(process.cwd(), out) || "."}`,
);
