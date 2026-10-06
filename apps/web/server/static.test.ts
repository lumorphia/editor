import path from "node:path";
import { describe, expect, it } from "vitest";
import { cacheControl, contentType, resolveStatic, securityHeaders } from "./static.ts";

const root = "/srv/web";

describe("resolveStatic", () => {
  it("maps a URL path to a file under the root", () => {
    expect(resolveStatic(root, "/assets/app.js")).toBe(path.join(root, "assets/app.js"));
  });

  it("serves index.html for the root", () => {
    expect(resolveStatic(root, "/")).toBe(path.join(root, "index.html"));
  });

  it("ignores the query string", () => {
    expect(resolveStatic(root, "/?draft=abc")).toBe(path.join(root, "index.html"));
  });

  it("refuses to climb out of the root", () => {
    expect(resolveStatic(root, "/../etc/passwd")).toBeNull();
  });

  it("refuses an encoded climb out of the root", () => {
    expect(resolveStatic(root, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });

  it("refuses a null byte", () => {
    expect(resolveStatic(root, "/index.html%00.js")).toBeNull();
  });

  it("refuses a malformed escape", () => {
    expect(resolveStatic(root, "/%E0%A4%A")).toBeNull();
  });
});

describe("contentType", () => {
  it("serves WASM with its own type so it can be compiled while streaming", () => {
    expect(contentType("/x/ort.wasm")).toBe("application/wasm");
  });

  it("serves .mjs as JavaScript", () => {
    expect(contentType("/x/ort.mjs")).toBe("text/javascript; charset=utf-8");
  });

  it("falls back to binary for model files", () => {
    expect(contentType("/x/face_landmarker.task")).toBe("application/octet-stream");
  });
});

describe("cacheControl", () => {
  it("caches hashed assets forever", () => {
    expect(cacheControl("/assets/app-abc123.js")).toBe("public, max-age=31536000, immutable");
  });

  it("caches versioned models forever", () => {
    expect(cacheControl("/models/ort-v1/x.wasm")).toBe("public, max-age=31536000, immutable");
  });

  it("revalidates the page itself", () => {
    expect(cacheControl("/")).toBe("no-cache");
  });
});

describe("securityHeaders", () => {
  const headers = securityHeaders();

  it("isolates the page so the segmenter can use threads (COOP + COEP)", () => {
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["cross-origin-embedder-policy"]).toBe("credentialless");
  });

  it("allows WebAssembly without allowing eval", () => {
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows blob and data images for the preview", () => {
    expect(headers["content-security-policy"]).toContain("img-src 'self' data: blob:");
  });

  it("refuses to be framed", () => {
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});
