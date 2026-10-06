import { describe, expect, it } from "vitest";
import { downloadName } from "./host.ts";

describe("downloadName", () => {
  it("replaces the extension and adds the host's suffix", () => {
    expect(downloadName("shot.png", "image/webp", "-prismtone")).toBe("shot-prismtone.webp");
  });

  it("uses jpg when the browser could not encode WebP", () => {
    expect(downloadName("shot.png", "image/jpeg", "-prismtone")).toBe("shot-prismtone.jpg");
  });

  it("adds nothing when the host gives no suffix", () => {
    expect(downloadName("shot.v2.jpeg", "image/webp", "")).toBe("shot.v2.webp");
  });
});
