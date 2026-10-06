import { describe, expect, it } from "vitest";
import {
  fitWithin,
  MAX_UPLOAD_BYTES,
  sniffImageFormat,
  validateImageFile,
} from "./image-format.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("sniffImageFormat", () => {
  it("detects png and jpeg by magic bytes", () => {
    expect(sniffImageFormat(png)).toBe("png");
    expect(sniffImageFormat(jpeg)).toBe("jpeg");
  });
  it("rejects other formats and short input", () => {
    expect(sniffImageFormat(webp)).toBeNull();
    expect(sniffImageFormat(new Uint8Array([0xff]))).toBeNull();
  });
});

describe("validateImageFile", () => {
  it("rejects oversized files first", () => {
    expect(validateImageFile(MAX_UPLOAD_BYTES + 1, png)).toBe("too_large");
  });
  it("rejects unsupported formats", () => {
    expect(validateImageFile(100, webp)).toBe("unsupported_format");
  });
  it("accepts a png under the limit", () => {
    expect(validateImageFile(MAX_UPLOAD_BYTES, png)).toBeNull();
  });
});

describe("fitWithin", () => {
  it("keeps images under the limit unchanged", () => {
    expect(fitWithin(1920, 1080, 4096)).toEqual({ width: 1920, height: 1080 });
  });
  it("scales the long edge down to the limit", () => {
    expect(fitWithin(5120, 2880, 4096)).toEqual({ width: 4096, height: 2304 });
    expect(fitWithin(2880, 5120, 4096)).toEqual({ width: 2304, height: 4096 });
  });
});
