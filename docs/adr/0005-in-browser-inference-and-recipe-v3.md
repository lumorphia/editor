# ADR-0005: 部分補正の自動選択はブラウザ内の推論で行い、マスクは Recipe v3 の多角形・ビットマップで持つ

> lumorphia/prismtone の ADR-0025 (https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0025-in-browser-inference-and-recipe-v3.md) を移植したもの (2026-10-06)。本文は当時のまま。パスは prismtone の中にあったころのもので、今は `packages/editor-*` にある。リンク、Issue 番号、本文中の ADR の番号は prismtone のもの (このリポジトリの番号との対応は docs/adr/README.md)。

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-09-21 |
| Deciders | t1nyb0x    |

## Context

lumorphia/prismtone#109 の部分補正は円形とブラシのマスクを手で置く。「瞳」「美肌」「装備強調」を押したら顔・瞳・装備が選ばれた状態になってほしい (lumorphia/prismtone#162、lumorphia/prismtone#175)。spike ([2026-09-21](https://github.com/lumorphia/prismtone/blob/develop/docs/spikes/2026-09-21-auto-select.md)) で、MediaPipe Face Landmarker (顔・瞳) と SlimSAM (装備・人物) がブラウザの WASM で FF14 のスクショに対して使える精度と速さだと分かった。

決めることは 3 つ: (1) 推論をどこで動かすか、(2) モデルをどう配るか、(3) 認識結果のマスクをレシピにどう持つか。

## Decision

### 推論はブラウザの中だけ

- 画像も推論もブラウザの中で行い、編集のために画像を外部 API にもサーバーにも送らない (プライバシーポリシー §1 に明記)。サーバーは推論しない (VPS 1 台で GPU も無い)
- ライブラリは動的 import、推論は Web Worker で動かし、現像の初期表示と UI スレッドに載せない
- CSP は `script-src 'self' 'wasm-unsafe-eval'` のまま。`unsafe-eval` は許さない。spike で MediaPipe と onnxruntime-web がこの CSP で動くことを確認した
- WebGPU は「使えれば速い」の位置。WASM で成立しているので、実機で計測してから足す
- **追記 (2026-09-21、lumorphia/prismtone#182)**: `/edit` の文書と `/assets/` `/models/` の応答に COEP `credentialless` を付けて cross-origin isolated にし、ORT をマルチスレッドで動かす (準備 10 秒 → 3.4 秒)。`require-corp` でなく `credentialless` なので、CORP の無い他オリジンの画像 (XIVAPI、R2) も匿名で読める。他の文書には付けない
- 認識に失敗しても手動のマスクで全部できる。自動選択は「初期値を置く」だけで、置いたあとは今の道具 (ハンドル、ブラシ) で直す。失敗の文言は理由を断定しない (「自動選択できませんでした。手動で範囲を指定できます」)

### モデルは自前ホスト

- モデルと WASM は git に入れず、`apps/app/scripts/fetch-models.ts` が sha256 を固定してダウンロードし `apps/app/models/<name>-v<n>/` に置き (`dev` / `build` の前。CI と Docker build も `pnpm build` 経由で同じ)、Fastify の static が `/models/` で配る。CDN や Hugging Face から直接は読まない
- ディレクトリに版を付けるので、静的アセットの `immutable` キャッシュのまま差し替えられる
- 大きさ (gzip 後): 顔 6.3 MB、SAM 13 MB + ORT 4.8 MB。初回だけ進捗を出して読み込む

### マスクは Recipe v3 の多角形とビットマップ

- 顔の輪郭は `polygon` (外周 + 穴)、SAM の切り抜きは `bitmap` (長辺 256、RLE) で持つ。ブラシ点列に崩すとレシピが肥大化し (64 本 × 512 点)、描画も重い
- どちらも `strokes` を持ち、自動で置いたマスクの上にブラシで足す / 消す (道具は 1 つ)
- ラスタライズは全部 CPU 側 (`brush-raster.ts`、長辺 1024) で、GPU はテクスチャを読むだけ。`invert` もラスタ側。CPU の参照実装と GPU の出力を E2E で照合する原則 (docs/design/08 §7) を保つ
- 人物補正 (lumorphia/prismtone#175) の「顔・瞳 ×2・人物・背景」は `groupId` で束ねる。上限は 8 → 12
- モデルやライブラリの版が変わっても、レシピには結果のマスクだけが入っているので既存の投稿の見え方は変わらない (推論は編集時の 1 回きり)

## Consequences

- 現像のバンドルに推論ライブラリは載らない (動的 import)。押したときに 6〜18 MB を読むので、初回の待ちは避けられない
- 横顔、褐色肌 + 角 (アウラ)、顔の高さ 80 px 以下、逆さ・90 度回転は取れない (spike の結果)。手動に落ちる
- 依存が増える: `@mediapipe/tasks-vision` (Apache-2.0)、`@huggingface/transformers` (Apache-2.0)、onnxruntime-web (MIT)。`pnpm licenses:check` の対象
- 規約 §3 (生成 AI による加工) は変えない。選択であって描き足しではない。目を大きくする、顔の再生成などの変形・生成は対象外 (lumorphia/prismtone#175)
