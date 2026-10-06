/**
 * 単独アプリを配る。vite build の dist と、editor-models が揃えた models/ (/models/ で配る) を返す。
 * E2E の土台を兼ねる。ヘッダの決まりは static.ts
 *
 * PORT (既定 4300)、HOST (既定 127.0.0.1)
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { cacheControl, contentType, resolveStatic, securityHeaders } from "./static.ts";

const here = import.meta.dirname;
const DIST = path.resolve(here, "../dist");
const MODELS = path.resolve(here, "../models");
const PORT = Number(process.env.PORT ?? 4300);
const HOST = process.env.HOST ?? "127.0.0.1";

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** URL を配るファイルに。モデルは models/、それ以外は dist/。拡張子の無いパスはページ (index.html) */
async function fileFor(url: string): Promise<string | null> {
  const pathname = url.split("?")[0] ?? "/";
  if (pathname.startsWith("/models/")) {
    return resolveStatic(MODELS, pathname.slice("/models".length));
  }
  const file = resolveStatic(DIST, pathname);
  if (file && (await isFile(file))) return file;
  return path.extname(pathname) === "" ? path.join(DIST, "index.html") : null;
}

const server = createServer(async (req, res) => {
  const headers = securityHeaders();
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...headers, allow: "GET, HEAD" }).end();
    return;
  }
  const url = req.url ?? "/";
  const file = await fileFor(url);
  if (!file || !(await isFile(file))) {
    res
      .writeHead(404, { ...headers, "content-type": "text/plain; charset=utf-8" })
      .end("not found");
    return;
  }
  res.writeHead(200, {
    ...headers,
    "content-type": contentType(file),
    "cache-control": cacheControl(url),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`editor-web: http://${HOST}:${PORT}`);
});
