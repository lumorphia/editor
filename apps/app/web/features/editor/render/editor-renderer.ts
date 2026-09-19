// PixiJS は既定でシェーダーの uniform 同期に new Function (unsafe-eval) を使う。CSP で 'unsafe-eval' を
// 許さない代わりに、eval を使わない実装へ差し替える (RM-28)。pixi.js より先に読み込む必要がある
import "pixi.js/unsafe-eval";
import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  TexturePool,
  type WebGLRenderer,
} from "pixi.js";
import type { EditRecipe, GeometryV1 } from "@prismtone/shared/recipe";
import { DevelopStage } from "./develop-stage.ts";
import { canvasSize, cropRect, exportScale, totalRotationDeg, type Size } from "./geometry.ts";

export type ExportFormat = "image/webp" | "image/jpeg" | "image/png";

export type ExportOptions = {
  format?: ExportFormat;
  quality?: number;
  maxEdge?: number;
};

export const EXPORT_MAX_EDGE = 4096;
/** プレビュー用の現像テクスチャの長辺。書き出しは原寸で描き直す */
export const PREVIEW_MAX_EDGE = 2048;

/** 長辺を maxEdge に収めた寸法 (整数)。 */
export function fitEdge(size: Size, maxEdge: number): Size {
  const edge = Math.max(size.width, size.height);
  if (edge <= maxEdge) return { width: Math.round(size.width), height: Math.round(size.height) };
  const s = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(size.width * s)),
    height: Math.max(1, Math.round(size.height * s)),
  };
}

/**
 * PixiJS による編集プレビューと書き出し (docs/design/08 §3.3-3.4, ADR-0021)。
 * - 現像の段 (DevelopStage): 無変換の Sprite に [全体の補正, 部分補正...] を掛けて画像座標の
 *   RenderTexture に描く。レシピが変わったフレームだけ
 * - 表示の段 (ここ): そのテクスチャの Sprite に幾何 (回転・反転) を Container の transform で掛ける。
 *   crop は書き出し時の frame
 * - プレビューは幾何適用後のキャンバス全体を表示し、crop 枠は DOM 側で描く
 * - プレビューの現像は長辺 2048 まで、書き出しは原寸 (4096 まで) で描き直す
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
  private develop: DevelopStage | null = null;
  /** 元画像のテクスチャ。現像の段と比較用の original が共有する */
  private sourceTexture: Texture | null = null;
  private source: Size = { width: 1, height: 1 };
  private previewMaskId: string | null = null;
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
    // TickerPlugin の描画 (LOW) より先に走り、レシピが変わっていれば現像の段を描く
    app.ticker.add(r.tick);
    return r;
  }

  private readonly tick = (): void => {
    if (this.develop?.dirty) this.develop.render(this.app.renderer);
  };

  /** GPU が扱えるテクスチャの上限。書き出しの原寸をこれで抑える */
  get maxTextureSize(): number {
    const gl = (this.app.renderer as WebGLRenderer).gl as WebGL2RenderingContext | undefined;
    return gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : EXPORT_MAX_EDGE;
  }

  get canvasElement(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  setImage(bitmap: ImageBitmap, recipe: EditRecipe): void {
    this.clearImage();
    const texture = Texture.from(bitmap);
    this.sourceTexture = texture;
    const original = new Sprite(texture);
    original.anchor.set(0.5);
    original.visible = false;
    this.original = original;
    this.image.addChild(original);
    this.source = { width: bitmap.width, height: bitmap.height };
    this.develop = new DevelopStage(texture, this.previewSize, recipe);
    const sprite = new Sprite(this.develop.texture);
    sprite.anchor.set(0.5);
    this.sprite = sprite;
    this.image.addChild(sprite);
    this.setRecipe(recipe);
  }

  private get previewSize(): Size {
    return fitEdge(this.source, PREVIEW_MAX_EDGE);
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
      this.sprite.destroy();
      this.sprite = null;
    }
    if (this.develop) {
      this.develop.destroy();
      this.develop = null;
    }
    this.sourceTexture?.destroy(true);
    this.sourceTexture = null;
  }

  setRecipe(recipe: EditRecipe): void {
    if (!this.sprite || !this.develop) return;
    this.develop.setRecipe(recipe);
    this.geometry = recipe.geometry;
    this.placeSprites(recipe.geometry);
    this.fit();
    this.applyCompare();
  }

  /** 選択中の部分補正の範囲を赤で重ねる (null で消す) */
  setMaskPreview(id: string | null): void {
    this.previewMaskId = id;
    this.develop?.setMaskPreview(id);
  }

  /**
   * 幾何を Sprite の transform に写す。現像テクスチャは縮小されていることがあるので、
   * 表示上の大きさが元画像の px になるようスケールで戻す (キャンバス座標は常に元画像の px)
   */
  private placeSprites(geometry: GeometryV1): void {
    const size = canvasSize(this.source, geometry);
    const rotation = (totalRotationDeg(geometry) * Math.PI) / 180;
    const flip = geometry.flipH ? -1 : 1;
    if (this.sprite && this.develop) {
      const dev = this.develop.size;
      this.sprite.rotation = rotation;
      this.sprite.scale.set(
        (flip * this.source.width) / dev.width,
        this.source.height / dev.height,
      );
      this.sprite.position.set(size.width / 2, size.height / 2);
    }
    if (this.original) {
      this.original.rotation = rotation;
      this.original.scale.set(flip, 1);
      this.original.position.set(size.width / 2, size.height / 2);
    }
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
    if (!this.sprite || !this.develop) throw new Error("no image loaded");
    const wasComparing = this.comparing;
    this.setCompare(false);
    this.setMaskPreview(null);
    this.setRecipe(recipe);

    const full = this.canvasSize;
    const rect = cropRect(full, recipe.geometry);
    const scale = exportScale(rect, opts.maxEdge ?? EXPORT_MAX_EDGE);

    // 現像の段を原寸で描き直し、表示用のスケールを外して原寸で切り出す
    const develop = this.develop;
    develop.setSize(fitEdge(this.source, Math.min(EXPORT_MAX_EDGE, this.maxTextureSize)));
    develop.render(this.app.renderer);
    this.placeSprites(recipe.geometry);
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
      // プレビュー寸法に戻す。原寸のフィルタ用テクスチャはプールに残る (GC されない) ので捨てる
      develop.setSize(this.previewSize);
      develop.render(this.app.renderer);
      this.placeSprites(recipe.geometry);
      TexturePool.clear(true);
      this.setCompare(wasComparing);
      this.setMaskPreview(this.previewMaskId);
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.app.ticker.remove(this.tick);
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
