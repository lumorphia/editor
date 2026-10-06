import {
  fitWithin,
  MAX_EDIT_EDGE,
  sniffImageFormat,
  validateImageFile,
  type ValidationError,
} from "./image-format.ts";

export type LoadedImage = {
  bitmap: ImageBitmap;
  blob: Blob;
  name: string;
  format: "png" | "jpeg";
  original: { width: number; height: number };
};

export class ImageLoadError extends Error {
  readonly reason: ValidationError | "decode_failed";
  constructor(reason: ValidationError | "decode_failed") {
    super(reason);
    this.name = "ImageLoadError";
    this.reason = reason;
  }
}

/**
 * ファイルを検証してデコードし、長辺 4096px に収めた ImageBitmap を返す (docs/design/08 §3.2)。
 * EXIF の回転はここで解決する。
 */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const invalid = validateImageFile(file.size, head);
  if (invalid) throw new ImageLoadError(invalid);
  const format = sniffImageFormat(head);
  if (!format) throw new ImageLoadError("unsupported_format");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageLoadError("decode_failed");
  }

  const original = { width: bitmap.width, height: bitmap.height };
  const fitted = fitWithin(bitmap.width, bitmap.height, MAX_EDIT_EDGE);
  if (fitted.width !== bitmap.width || fitted.height !== bitmap.height) {
    const canvas = new OffscreenCanvas(fitted.width, fitted.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageLoadError("decode_failed");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, fitted.width, fitted.height);
    bitmap.close();
    bitmap = await createImageBitmap(canvas);
  }

  return { bitmap, blob: file, name: file.name, format, original };
}
