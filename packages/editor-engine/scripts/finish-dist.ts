/** tsc のあとに dist を仕上げる。Worker を起こすファイルの URL を .js にする (worker-urls.ts) */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rewriteWorkerUrls } from "./worker-urls.ts";

const dist = path.resolve(import.meta.dirname, "../dist");
/** Worker を起こすファイル。ここで 1 つも書き換わらなければ、ソースの書き方が変わったので止める */
const SPAWNERS = ["inference/face.js", "inference/segment.js"];

for (const file of SPAWNERS) {
  const target = path.join(dist, file);
  const { code, count } = rewriteWorkerUrls(await readFile(target, "utf8"));
  if (count !== 1)
    throw new Error(`finish-dist: ${file} で Worker の URL が ${count} 件 (1 件のはず)`);
  await writeFile(target, code);
}
console.log(`finish-dist: ${SPAWNERS.length} files`);
