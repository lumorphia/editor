# ADR-0002: 画像編集は PixiJS (WebGL) でブラウザ内に閉じ、最終書き出しもブラウザで行う

> lumorphia/prismtone の ADR-0005 (https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0005-client-side-editing-and-export.md) を移植したもの (2026-10-06)。本文は当時のまま。パスは prismtone の中にあったころのもので、今は `packages/editor-*` にある。リンク、Issue 番号、本文中の ADR の番号は prismtone のもの (このリポジトリの番号との対応は docs/adr/README.md)。

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-09-13 |
| Deciders | t1nyb0x    |

## Context

要件は「編集操作は即時にプレビューへ反映」「非破壊編集」「ログイン不要で編集・端末保存」。同時に「原本を恒久保存しない」方針が決まっている。編集をどこで実行し、最終画像をどこで生成するかは、ストレージ費用・サーバー負荷・再編集体験に直結する。

## Decision

- 編集のプレビューと最終書き出しの両方をブラウザで行う。サーバーはレシピからの再現像を行わない
- レンダリングは PixiJS v8 (WebGL2、環境が許せば WebGPU) を使い、全補正を 1 つのカスタム `Filter` (GLSL) で 1 パス適用する
- 書き出しは `RenderTexture` を原寸 (長辺上限 4096px) で描画し `canvas.toBlob` で WebP (非対応時 JPEG) を生成する
- 原本とレシピは IndexedDB に一時保持し、同一端末での再編集に使う

## Consequences

### 良い点

- 編集だけの利用者はサーバー資源を一切消費しない。「投稿が集まらない」リスク対策として編集を無料・無登録にする方針と噛み合う
- 原本がサーバーに存在しないため、保存費用と権利上の懸念が最小になる
- プレビューと書き出しが同一コードパスなので「プレビューと結果が違う」問題が起きない

### 悪い点・受け入れるリスク

- 端末性能に依存する。30MB の PNG (例: 5120x2880) のデコードと WebGL テクスチャ化はスマートフォンでは失敗しうる。長辺 4096px への事前縮小と、失敗時のメッセージで対処する
- ブラウザ間で `toBlob` の WebP 品質・色管理に差がある。sRGB 前提で統一し、色空間の厳密さは追わない
- 別端末からの再編集はできない ([03. 画像パイプライン §9](https://github.com/lumorphia/prismtone/blob/develop/docs/design/03-image-pipeline.md))
- 書き出し画像が利用者側で生成されるため、サーバーは受け取った画像を信用しない (worker で再検証・再エンコードする)

### 追従して必要になること

- シェーダのパラメータ定義とレシピスキーマを対応させる ([04. 編集レシピ](https://github.com/lumorphia/prismtone/blob/develop/docs/design/04-edit-recipe.md))
- WebGL 非対応環境の検出とフォールバック表示 (編集不可、投稿導線のみ案内)

## Alternatives

- **サーバーでレシピから現像 (原本をアップロードし Sharp / libvips で適用)**: 原本保存が必須になり、方針と衝突する。サーバー負荷も高い
- **Canvas 2D + WebAssembly (例: wasm-vips)**: 高精度だがプレビューのリアルタイム性に劣る。WebGL で十分
- **WebGPU 専用**: 対応ブラウザがまだ限られる。PixiJS が抽象化してくれるため、将来自然に移行できる

## References

- [03. 画像パイプライン](https://github.com/lumorphia/prismtone/blob/develop/docs/design/03-image-pipeline.md)
- [08. フロントエンド](https://github.com/lumorphia/prismtone/blob/develop/docs/design/08-frontend.md)
- [ADR-0006](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0006-storage-r2-direct-upload-no-originals.md)
