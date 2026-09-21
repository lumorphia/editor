/**
 * bitmap マスク (Recipe v3、#176 / #177) の 0/1 列をランレングスで圧縮する。
 * 連の長さを 0 から始めて交互に (0 の連、1 の連、0 の連 ...) LEB128 の可変長整数で並べ、
 * base64url にする。ブラウザでも Node でも動くように、Buffer や atob は使わない。
 * 256×256 (65,536 px) のマスクは、輪郭の複雑さにもよるが数百〜数 KB になる。
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map(Array.from(ALPHABET, (c, i) => [c, i]));

function toBase64Url(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2]!;
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]!;
    if (b1 === undefined) break;
    out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]!;
    if (b2 === undefined) break;
    out += ALPHABET[b2 & 63]!;
  }
  return out;
}

function fromBase64Url(text: string): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const c of text) {
    const v = LOOKUP.get(c);
    if (v === undefined) throw new Error("rle: invalid character");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return out;
}

/** 0/1 (0 以外は 1 とみなす) の列を圧縮する */
export function encodeRle(mask: Uint8Array | Uint8ClampedArray): string {
  const bytes: number[] = [];
  const pushVarint = (n: number) => {
    let v = n;
    while (v >= 128) {
      bytes.push((v & 127) | 128);
      v = Math.floor(v / 128);
    }
    bytes.push(v);
  };
  let current = 0;
  let run = 0;
  for (let i = 0; i < mask.length; i++) {
    const bit = mask[i] ? 1 : 0;
    if (bit === current) {
      run++;
    } else {
      pushVarint(run);
      current = bit;
      run = 1;
    }
  }
  pushVarint(run);
  return toBase64Url(bytes);
}

/** 圧縮した列を length 個の 0/1 に戻す。長さが合わなければ捨てる (壊れたレシピを通さない) */
export function decodeRle(text: string, length: number): Uint8Array {
  const bytes = fromBase64Url(text);
  const out = new Uint8Array(length);
  let pos = 0;
  let current = 0;
  let i = 0;
  while (i < bytes.length) {
    let run = 0;
    let shift = 1;
    for (;;) {
      const b = bytes[i++];
      if (b === undefined) throw new Error("rle: truncated");
      run += (b & 127) * shift;
      if (b < 128) break;
      shift *= 128;
    }
    if (pos + run > length) throw new Error("rle: length mismatch");
    if (current) out.fill(1, pos, pos + run);
    pos += run;
    current ^= 1;
  }
  if (pos !== length) throw new Error("rle: length mismatch");
  return out;
}

/** 復号できて長さが合うか (スキーマの検証用) */
export function isValidRle(text: string, length: number): boolean {
  try {
    decodeRle(text, length);
    return true;
  } catch {
    return false;
  }
}
