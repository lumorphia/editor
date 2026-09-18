// PixiJS は既定でシェーダーの uniform 同期に new Function (unsafe-eval) を使う。CSP で 'unsafe-eval' を
// 許さない代わりに、eval を使わない実装へ差し替える (RM-28)。pixi.js より先に読み込む必要がある
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { EditRecipe, GeometryV1 } from "@prismtone/shared/recipe";
import { AdjustFilter } from "./adjust-filter.ts";
import { canvasSize, cropRect, exportScale, totalRotationDeg, type Size } from "./geometry.ts";

export type ExportFormat = "image/webp" | "image/jpeg" | "image/png";

export type ExportOptions = {
  format?: ExportFormat;
  quality?: number;
  maxEdge?: number;
};

export const EXPORT_MAX_EDGE = 4096;

/**
 * PixiJS による編集プレビューと書き出し (docs/design/08 §3.3-3.4, ADR-0005)。
 * - Sprite 1 枚に AdjustFilter 1 つ。補正はすべて 1 パス
 * - 幾何 (回転・反転) は Container の transform、crop は書き出し時の frame
 * - プレビューは幾何適用後のキャンバス全体を表示し、crop 枠は DOM 側で描く
 */
export class EditorRenderer {
  private readonly app: Application;
  private readonly host: HTMLElement;

  private constructor(app: Application, host: HTMLElement) {
    this.app = app;
    this.host = host;
  }

  private readonly stage = new Container();
  private readonly image = new Container();
  private sprite: Sprite | null = null;
  /** 比較用の元画像 (フィルタなし)。sprite の下に同じ変換で置き、比較中だけ見せる */
  private original: Sprite | null = null;
  /** 比較中、現像後 (sprite) を境界より右だけに見せるマスク */
  private compareMask: Graphics | null = null;
  private filter: AdjustFilter | null = null;
  private source: Size = { width: 1, height: 1 };
  private geometry: GeometryV1 | null = null;
  private comparing = false;
  /** 比較の境界。0 = 全部現像後、1 = 全部元画像 (左が元画像、右が現像後) */
  private comparePosition = 0.5;
  private resizeObserver: ResizeObserver | null = null;

  static async create(host: HTMLElement): Promise<EditorRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: "webgl",
    });
    host.appendChild(app.canvas);
    const r = new EditorRenderer(app, host);
    app.stage.addChild(r.stage);
    r.stage.addChild(r.image);
    r.resizeObserver = new ResizeObserver(() => r.fit());
    r.resizeObserver.observe(host);
    return r;
  }

  get canvasElement(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  setImage(bitmap: ImageBitmap, recipe: EditRecipe): void {
    this.clearImage();
    const texture = Texture.from(bitmap);
    const original = new Sprite(texture);
    original.anchor.set(0.5);
    original.visible = false;
    this.original = original;
    this.image.addChild(original);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    this.sprite = sprite;
    this.source = { width: bitmap.width, height: bitmap.height };
    this.filter = new AdjustFilter(recipe.adjust);
    sprite.filters = [this.filter];
    this.image.addChild(sprite);
    this.setRecipe(recipe);
  }

  private clearImage(): void {
    if (this.compareMask) {
      this.compareMask.destroy();
      this.compareMask = null;
    }
    if (this.original) {
      this.image.removeChild(this.original);
      this.original.destroy();
      this.original = null;
    }
    if (this.sprite) {
      this.image.removeChild(this.sprite);
      this.sprite.destroy({ texture: true, textureSource: true });
      this.sprite = null;
    }
    this.filter?.destroy();
    this.filter = null;
  }

  setRecipe(recipe: EditRecipe): void {
    if (!this.sprite || !this.filter) return;
    this.filter.setAdjust(recipe.adjust);
    this.geometry = recipe.geometry;
    const size = canvasSize(this.source, recipe.geometry);
    for (const target of [this.sprite, this.original]) {
      if (!target) continue;
      target.rotation = (totalRotationDeg(recipe.geometry) * Math.PI) / 180;
      target.scale.set(recipe.geometry.flipH ? -1 : 1, 1);
      target.position.set(size.width / 2, size.height / 2);
    }
    this.fit();
    this.applyCompare();
  }

  /** 比較のオン・オフと境界の位置。左が元画像、右が現像後 */
  setCompare(on: boolean, position: number = this.comparePosition): void {
    this.comparing = on;
    this.comparePosition = Math.min(1, Math.max(0, position));
    this.applyCompare();
  }

  private applyCompare(): void {
    if (!this.sprite || !this.original) return;
    if (!this.comparing) {
      this.original.visible = false;
      this.sprite.mask = null;
      this.compareMask?.destroy();
      this.compareMask = null;
      return;
    }
    const size = this.canvasSize;
    const x = size.width * this.comparePosition;
    if (!this.compareMask) {
      this.compareMask = new Graphics();
      this.image.addChild(this.compareMask);
    }
    this.compareMask
      .clear()
      .rect(x, 0, Math.max(0, size.width - x), size.height)
      .fill(0xffffff);
    this.sprite.mask = this.compareMask;
    this.original.visible = true;
  }

  /** 幾何適用後のキャンバスサイズ (crop 前)。DOM の crop 枠の基準になる。 */
  get canvasSize(): Size {
    return this.geometry ? canvasSize(this.source, this.geometry) : this.source;
  }

  /** ホスト内でキャンバスが占める矩形 (CSS px)。DOM オーバーレイの配置に使う。 */
  get viewRect(): { x: number; y: number; width: number; height: number; scale: number } {
    const size = this.canvasSize;
    const s = this.stage.scale.x;
    return {
      x: this.stage.x,
      y: this.stage.y,
      width: size.width * s,
      height: size.height * s,
      scale: s,
    };
  }

  fit(): void {
    if (!this.sprite) return;
    const size = this.canvasSize;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0) return;
    const s = Math.min(w / size.width, h / size.height) * 0.96;
    this.stage.scale.set(s);
    this.stage.position.set((w - size.width * s) / 2, (h - size.height * s) / 2);
  }

  async export(recipe: EditRecipe, opts: ExportOptions = {}): Promise<Blob> {
    if (!this.sprite) throw new Error("no image loaded");
    const wasComparing = this.comparing;
    this.setCompare(false);
    this.setRecipe(recipe);

    const full = this.canvasSize;
    const rect = cropRect(full, recipe.geometry);
    const scale = exportScale(rect, opts.maxEdge ?? EXPORT_MAX_EDGE);

    // 表示用のスケールを外し、原寸で描く
    const saved = { x: this.stage.x, y: this.stage.y, s: this.stage.scale.x };
    this.stage.scale.set(1);
    this.stage.position.set(0, 0);
    try {
      const canvas = this.app.renderer.extract.canvas({
        target: this.image,
        frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
        resolution: scale,
        clearColor: "#000000",
      }) as HTMLCanvasElement;
      const format = opts.format ?? ((await supportsWebp()) ? "image/webp" : "image/jpeg");
      return await toBlob(canvas, format, opts.quality ?? 0.92);
    } finally {
      this.stage.scale.set(saved.s);
      this.stage.position.set(saved.x, saved.y);
      this.setCompare(wasComparing);
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.clearImage();
    this.app.destroy(true, { children: true });
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
  });
}

let webpSupport: Promise<boolean> | null = null;
export function supportsWebp(): Promise<boolean> {
  if (!webpSupport) {
    webpSupport = new Promise((resolve) => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      c.toBlob((b) => resolve(b?.type === "image/webp"), "image/webp");
    });
  }
  return webpSupport;
}
