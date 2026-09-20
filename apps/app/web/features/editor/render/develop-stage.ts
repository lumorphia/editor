import { Container, Rectangle, RenderTexture, Sprite, type Renderer, type Texture } from "pixi.js";
import type { BrushStrokeV2, EditRecipe, LocalAdjustmentV2 } from "@prismtone/shared/recipe";
import { AdjustFilter } from "./adjust-filter.ts";
import { LocalAdjustFilter } from "./local-adjust-filter.ts";
import { MaskTexture } from "./mask-texture.ts";
import type { Size } from "./geometry.ts";

/**
 * 現像の段 (docs/design/08 §3.3、ADR-0021)。
 * 無変換の Sprite に [全体の補正, 部分補正...] のフィルタを掛け、画像座標のままの RenderTexture に描く。
 * 幾何 (回転・反転・トリミング) は表示の段 (EditorRenderer) がこのテクスチャに対して掛けるので、
 * マスクの座標は幾何の影響を受けない。
 *
 * フィルタ領域を filterArea で画像矩形に固定するのが要。これで頂点シェーダの aPosition が
 * そのまま画像の正規化座標になり、プレビュー (縮小) と書き出し (原寸) で同じマスクが同じ場所に掛かる。
 * レシピが変わったフレームだけ描き直す (dirty)。
 */
export class DevelopStage {
  readonly container = new Container();
  readonly texture: RenderTexture;
  private readonly sprite: Sprite;
  private readonly global: AdjustFilter;
  private locals: LocalAdjustFilter[] = [];
  /** ブラシマスクのテクスチャ (部分補正の id ごと)。マスクのオブジェクトが変わったら描き直す */
  private masks = new Map<string, { mask: LocalAdjustmentV2["mask"]; texture: MaskTexture }>();
  private readonly source: Size;
  private recipe: EditRecipe;
  private previewMaskId: string | null = null;
  dirty = true;

  constructor(source: Texture, size: Size, recipe: EditRecipe) {
    this.recipe = recipe;
    this.source = { width: source.width, height: source.height };
    this.sprite = new Sprite(source);
    this.container.addChild(this.sprite);
    this.texture = RenderTexture.create({
      width: size.width,
      height: size.height,
      resolution: 1,
      antialias: false,
    });
    this.global = new AdjustFilter(recipe.adjust);
    this.setSize(size);
    this.setRecipe(recipe);
  }

  get size(): Size {
    return { width: this.texture.width, height: this.texture.height };
  }

  /** 描く寸法 (整数)。プレビューは縮小、書き出しは原寸 */
  setSize(size: Size): void {
    const width = Math.max(1, Math.round(size.width));
    const height = Math.max(1, Math.round(size.height));
    if (this.texture.width !== width || this.texture.height !== height) {
      this.texture.resize(width, height);
    }
    this.sprite.width = width;
    this.sprite.height = height;
    // filterArea はローカル座標で、Pixi が worldTransform (上の width/height による縮小) を掛ける
    // (FilterSystem._calculateFilterArea)。元寸で与えて、world で RenderTexture の寸法に一致させる。
    // 縮小した寸法を与えると、フィルタが画像の左上の一部しか描かない
    const orig = this.sprite.texture.orig;
    this.sprite.filterArea = new Rectangle(0, 0, orig.width, orig.height);
    this.dirty = true;
  }

  setRecipe(recipe: EditRecipe): void {
    this.recipe = recipe;
    this.global.setAdjust(recipe.adjust);
    this.syncLocals(recipe.localAdjustments.filter((l) => l.visible));
    this.dirty = true;
  }

  /** 選択中の部分補正の範囲を赤で重ねる (null で消す) */
  setMaskPreview(id: string | null): void {
    if (this.previewMaskId === id) return;
    this.previewMaskId = id;
    this.syncLocals(this.recipe.localAdjustments.filter((l) => l.visible));
    this.dirty = true;
  }

  /** 描画中のストロークをマスクに足す (レシピに入れる前のプレビュー) */
  previewStroke(id: string, stroke: BrushStrokeV2): void {
    const entry = this.masks.get(id);
    if (!entry || entry.mask.kind !== "brush") return;
    entry.texture.addStroke(stroke, entry.mask.feather);
    this.dirty = true;
  }

  private syncLocals(locals: readonly LocalAdjustmentV2[]): void {
    while (this.locals.length > locals.length) this.locals.pop()?.destroy();
    while (this.locals.length < locals.length) {
      this.locals.push(new LocalAdjustFilter(locals[this.locals.length]!, this.source));
    }
    const alive = new Set<string>();
    locals.forEach((l, i) => {
      const filter = this.locals[i]!;
      filter.setLocal(l, l.id === this.previewMaskId);
      if (l.mask.kind === "brush") {
        alive.add(l.id);
        let entry = this.masks.get(l.id);
        if (!entry) {
          entry = { mask: l.mask, texture: new MaskTexture(this.source) };
          entry.texture.set(l.mask);
          this.masks.set(l.id, entry);
        } else if (entry.mask !== l.mask) {
          entry.mask = l.mask;
          entry.texture.set(l.mask);
        }
        filter.setMaskTexture(entry.texture.texture.source);
      } else {
        filter.setMaskTexture(null);
      }
    });
    for (const [id, entry] of this.masks) {
      if (!alive.has(id)) {
        entry.texture.destroy();
        this.masks.delete(id);
      }
    }
    this.sprite.filters = [this.global, ...this.locals];
  }

  render(renderer: Renderer): void {
    renderer.render({ container: this.container, target: this.texture, clear: true });
    this.dirty = false;
  }

  destroy(): void {
    this.sprite.filters = [];
    this.global.destroy();
    for (const f of this.locals) f.destroy();
    this.locals = [];
    for (const entry of this.masks.values()) entry.texture.destroy();
    this.masks.clear();
    this.sprite.destroy();
    this.container.destroy();
    this.texture.destroy(true);
  }
}
