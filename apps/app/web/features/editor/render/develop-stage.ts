import { Container, Rectangle, RenderTexture, Sprite, type Renderer, type Texture } from "pixi.js";
import type { EditRecipe, LocalAdjustmentV2 } from "@prismtone/shared/recipe";
import { AdjustFilter } from "./adjust-filter.ts";
import { LocalAdjustFilter } from "./local-adjust-filter.ts";
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
  private recipe: EditRecipe;
  private previewMaskId: string | null = null;
  dirty = true;

  constructor(source: Texture, size: Size, recipe: EditRecipe) {
    this.recipe = recipe;
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
    this.sprite.filterArea = new Rectangle(0, 0, width, height);
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

  private syncLocals(locals: readonly LocalAdjustmentV2[]): void {
    while (this.locals.length > locals.length) this.locals.pop()?.destroy();
    while (this.locals.length < locals.length) {
      this.locals.push(new LocalAdjustFilter(locals[this.locals.length]!));
    }
    locals.forEach((l, i) => this.locals[i]!.setLocal(l, l.id === this.previewMaskId));
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
    this.sprite.destroy();
    this.container.destroy();
    this.texture.destroy(true);
  }
}
