/**
 * 単独アプリの配信 (serve.ts) の決まり。外から来るパスを扱うので、純粋関数にしてテストする。
 * ヘッダは lumorphia/prismtone の /edit と同じ考え方 (ADR-0005: ブラウザで描く、COOP / COEP で
 * SharedArrayBuffer を使えるようにして onnxruntime-web をマルチスレッドで動かす、CSP に unsafe-eval を入れない)
 */
import path from "node:path";

/** URL のパスを root の下のファイルに。外に出る・不正なものは null */
export function resolveStatic(root: string, urlPath: string): string | null {
  const pathname = urlPath.split("?")[0] ?? "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

export function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** ファイル名にハッシュが付くもの (Vite の assets) と版付きのモデルは変わらない */
export function cacheControl(urlPath: string): string {
  return urlPath.startsWith("/assets/") || urlPath.startsWith("/models/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

const CSP: Readonly<Record<string, readonly string[]>> = {
  "default-src": ["'self'"],
  // PixiJS と MediaPipe / onnxruntime-web の WASM に 'wasm-unsafe-eval'。インラインのスクリプトは無い
  "script-src": ["'self'", "'wasm-unsafe-eval'"],
  // React の style 属性
  "style-src": ["'self'", "'unsafe-inline'"],
  // 現像のプレビューと書き出し
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "worker-src": ["'self'", "blob:"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
};

export function securityHeaders(): Record<string, string> {
  return {
    "content-security-policy": Object.entries(CSP)
      .map(([k, v]) => `${k} ${v.join(" ")}`)
      .join("; "),
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "credentialless",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}
