import { Texture, TextureStyle } from "pixi.js";
import type { BrushStrokeV2, StrokedMask } from "@lumorphia/editor-recipe";
import { createMaskRaster, rasterizeMask, stampStroke, type MaskRaster } from "../brush-raster.ts";
import type { Size } from "./geometry.ts";

/**
 * ブラシ・多角形・ビットマップのマスクのテクスチャ (#109、v3)。brush-raster.ts のラスタを canvas に写して PixiJS の Texture にする。
 * レシピの確定 (commit) ではゼロから描き直し、描画中は 1 ストロークだけ足して更新する。
 */
export class MaskTexture {
  readonly texture: Texture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private raster: MaskRaster;
  private source: Size;

  constructor(source: Size) {
    this.source = source;
    this.raster = createMaskRaster(source);
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.raster.width;
    this.canvas.height = this.raster.height;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.texture = Texture.from(this.canvas);
    this.texture.source.style = new TextureStyle({
      scaleMode: "linear",
      addressMode: "clamp-to-edge",
    });
    this.upload();
  }

  /** マスク全体を描き直す */
  set(mask: StrokedMask): void {
    this.raster = rasterizeMask(mask, this.source);
    this.upload();
  }

  /** 描画中のストロークを足す (レシピには入れない)。invert は set 側で扱うので、ここでは加算だけ */
  addStroke(stroke: BrushStrokeV2, feather: number): void {
    stampStroke(this.raster, stroke, feather);
    this.upload();
  }

  private upload(): void {
    const { width, height, data } = this.raster;
    const image = this.ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      image.data[i * 4] = v;
      image.data[i * 4 + 1] = v;
      image.data[i * 4 + 2] = v;
      image.data[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(image, 0, 0);
    this.texture.source.update();
  }

  destroy(): void {
    this.texture.destroy(true);
  }
}
