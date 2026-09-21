import { describe, expect, it } from "vitest";
import { decodeRle, encodeRle } from "./rle.ts";

describe("rle (bitmap マスクの圧縮)", () => {
  it("0/1 の列を往復できる", () => {
    const src = Uint8Array.from([0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1]);
    const text = encodeRle(src);
    expect(decodeRle(text, src.length)).toEqual(src);
  });

  it("全部 0 と全部 1 も往復できる", () => {
    for (const v of [0, 1]) {
      const src = new Uint8Array(1000).fill(v);
      expect(decodeRle(encodeRle(src), 1000)).toEqual(src);
    }
  });

  it("長い連 (65535 超) も往復できる", () => {
    const src = new Uint8Array(70000).fill(1);
    src[0] = 0;
    expect(decodeRle(encodeRle(src), src.length)).toEqual(src);
  });

  it("URL に載せられる文字だけを使う (base64url)", () => {
    const src = Uint8Array.from({ length: 512 }, (_, i) => (i % 7 < 3 ? 1 : 0));
    expect(encodeRle(src)).toMatch(/^[A-Za-z0-9_-]*$/);
  });

  it("長さが合わない入力は捨てる", () => {
    const text = encodeRle(Uint8Array.from([1, 1, 0]));
    expect(() => decodeRle(text, 4)).toThrow();
    expect(() => decodeRle("!!", 3)).toThrow();
  });
});
