/** 拡張子ではなく先頭バイトで画像形式を判定する (docs/design/09 §2)。 */
export type ImageFormat = "png" | "jpeg";

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const MAX_EDIT_EDGE = 4096;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImageFormat(head: Uint8Array): ImageFormat | null {
  if (head.length >= 8 && PNG.every((b, i) => head[i] === b)) return "png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  return null;
}

export type ValidationError = "too_large" | "unsupported_format";

export function validateImageFile(size: number, head: Uint8Array): ValidationError | null {
  if (size > MAX_UPLOAD_BYTES) return "too_large";
  if (!sniffImageFormat(head)) return "unsupported_format";
  return null;
}

/** 長辺が max を超える場合の縮小後サイズ。超えなければそのまま。 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= max) return { width, height };
  const s = max / edge;
  return { width: Math.round(width * s), height: Math.round(height * s) };
}
