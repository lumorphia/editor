# ADR-0004: 現像を「合成の段」と「表示の段」に分け、部分補正はフィルタを重ねて掛ける

> lumorphia/prismtone の ADR-0021 (https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0021-two-stage-render-local-adjustments.md) を移植したもの (2026-10-06)。本文は当時のまま。パスは prismtone の中にあったころのもので、今は `packages/editor-*` にある。リンク、Issue 番号、本文中の ADR の番号は prismtone のもの (このリポジトリの番号との対応は docs/adr/README.md)。

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-09-20 |
| Deciders | t1nyb0x    |

## Context

[ADR-0005](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0005-client-side-editing-and-export.md) と [08 §3.3](https://github.com/lumorphia/prismtone/blob/develop/docs/design/08-frontend.md) は「Sprite 1 枚に `AdjustFilter` 1 つ、補正は 1 パス」としていた。[#109](https://github.com/lumorphia/prismtone/issues/109) の部分補正 (マスク付きの補正、最大 8 個) は、マスクの座標を画像に対して固定したまま、プレビューと原寸書き出しで同じ結果にする必要がある。

表示用の Sprite に直接フィルタを重ねる案を pixi.js 8.20.1 のソースで確かめたところ、フィルタ領域は「回転後の外接矩形をビューポートでクリップした矩形」になる (`FilterSystem.mjs` の `push`)。そのままではマスクの座標が表示倍率とスクロールに依存し、近傍を見る処理 (シャープ・平滑化) のテクセル幅もプレビューと書き出しで変わる。

## Decision

- 描画を 2 段にする。**合成の段** (`render/develop-stage.ts`) は無変換の Sprite に `[AdjustFilter, LocalAdjustFilter × N]` を掛け、`filterArea` で領域を画像矩形に固定して、画像座標のままの `RenderTexture` に描く。**表示の段** (`render/editor-renderer.ts`) はそのテクスチャの Sprite に幾何 (回転・反転) を掛け、トリミングは書き出し時の `frame` で切る (従来どおり)
- 領域 = 画像矩形なので、頂点シェーダの `aPosition` がそのまま画像の正規化座標 (`vImageUv`) になる。マスクはこの座標で評価する。幾何は合成のあとに掛かるので、回転・反転・トリミングでマスクはずれない
- 部分補正 1 件 = フィルタ 1 パス。中間テクスチャは pixi が入力と temp の 2 枚を使い回すので、件数はテクスチャ枚数に効かず、パス数と fragment の負荷にだけ効く
- 合成の段は**レシピが変わったフレームだけ**描く (`dirty`)。ズーム・リサイズ・比較は表示の段だけ
- プレビューの合成は長辺 2048 まで縮小、書き出しは原寸 (4096 と `MAX_TEXTURE_SIZE` の小さい方) で描き直してから切り出す。書き出し後は `TexturePool.clear(true)` で原寸のフィルタ用テクスチャを捨てる (プールは GC されない)
- 全フィルタ `padding: 0`、`antialias: "off"`、`resolution: 1`。近傍サンプルは `uInputClamp` で自前クランプする (プールのテクスチャは 2 のべき乗で余白がある)
- 色補正の GLSL は `render/adjust-glsl.ts` に 1 つ置き、全体と部分の両方のフィルタが埋め込む。CPU 参照 (`adjust-math.ts`、`mask-math.ts`) と同じ式

## Consequences

### 良い点

- マスクの座標が画像に固定され、プレビュー (縮小) と書き出し (原寸) で同じ場所に同じ量が掛かる。E2E で GPU と CPU 参照を ±3/255 で照合できる (回転 + トリミング後も同じ画素)
- スライダーのドラッグ以外 (ズーム・比較) で合成を描き直さない
- 幾何・比較・書き出しの既存コードはほぼそのまま

### 悪い点・受け入れるリスク

- GPU メモリが増える。見積: プレビュー ≈ 116 MB (従来比 +68 MB)、書き出し時ピーク ≈ 310 MB (4096×3072)。実測は PR3 の spike に残す
- 部分補正 8 個で 9 パス。プレビューは ≤ 2048 なので許容範囲と見込むが、平滑化 (5×5) を足したあとで計測する。上限 8 の根拠もそこで確かめる
- 比較の左 (元画像) は原寸、右 (現像後) はプレビュー解像度なので、拡大時に鮮鋭度が僅かに違う。気になれば元画像もプレビュー寸法に揃える
- `Sprite.width/height` を非整数にすると領域が 1px ずれて uv が歪む。寸法は整数で持つ

## Alternatives

- **表示用 Sprite にフィルタを直付けし、逆変換 uniform でマスク座標を戻す**: 可能だが、ビューポートのクリップで見えない部分が評価されない、テクセル幅が表示倍率に依存する、チェーンの中間パスで `uOutputFrame.xy` が 0 に固定される、と前提が多い。採らない
- **マスクを Pixi の `mask` (Graphics / Sprite) で掛ける**: 比較機能が `sprite.mask` を使っていて衝突する。ぼかしも表現できない

## References

- [08 §3.3](https://github.com/lumorphia/prismtone/blob/develop/docs/design/08-frontend.md)、[04 §1.1](https://github.com/lumorphia/prismtone/blob/develop/docs/design/04-edit-recipe.md)
- `node_modules/pixi.js/lib/filters/FilterSystem.mjs` (領域・uniform の根拠。8.20.1)
