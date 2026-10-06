# ADR-0009: ホストに求めること (オリジンの分離、CSP、モデル、CSS、バンドラ)

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

エディタはブラウザの WebGL、Web Worker、WebAssembly、SharedArrayBuffer を使い、ホストのヘッダと CSS とバンドラの設定に頼る。prismtone と単独アプリ (apps/web) で動いている設定を、ほかのホストにも求める形で書いておく。

## Decision

ホストは次を満たす。apps/web と E2E が確かめる。

- **オリジンの分離**: エディタのページに `Cross-Origin-Opener-Policy: same-origin` と `Cross-Origin-Embedder-Policy: credentialless`。Worker のスクリプトとその import 先にも COEP が要る (文書以外の応答に付ける)。onnxruntime-web がマルチスレッドで動く
- **CSP**: `script-src` に `'wasm-unsafe-eval'` (`'unsafe-eval'` は要らない)、`worker-src 'self' blob:`、`img-src` に `data:` と `blob:`。エディタは外のオリジンに出ていかない
- **モデル**: `editor-models fetch --out <dir>` で揃えたものを、同じオリジンで配る (既定の URL は `/models/`、変えるなら `EditorHost.inference.modelBaseUrl`)。ディレクトリは版付きなので immutable でキャッシュしてよい。dev の Vite の `public/` には置かない (`import()` に `?import` が足されて MediaPipe のローダーが読めない)
- **CSS**: Tailwind v4 で `@source` に `@lumorphia/editor-react` の場所を足す (`node_modules` は自分では走査しない。抜けると `touch-none` などが CSS に入らず、ピンチでページごと拡大する)。意味名のトークン (`surface*`、`ink*`、`line*`、`accent*`) を定義する
- **Vite**: `optimizeDeps.exclude: ["@lumorphia/editor-engine"]` (事前バンドルで Worker の相対 URL が壊れる)、`optimizeDeps.include` に `@mediapipe/tasks-vision` と `@huggingface/transformers` (dev で押したときの再読み込みを避ける)、`resolve.dedupe: ["react", "react-dom", "zod"]`
- **下書き**: IndexedDB の名前はホストごとに決め、変えない (変えると利用者の下書きが読めなくなる)

## Consequences

### 良い点

- 新しいホストが何を用意すればよいかが 1 か所で分かる

### 悪い点・受け入れるリスク

- オリジンの分離は、ページに埋め込む外部のリソース (画像、iframe) を制限する。エディタのページだけに付けるのがよい (prismtone は `/edit` だけ)
- オリジンの分離をしたページどうしでは `window.open` と `postMessage` で受け渡せない。送客 (#6) は別の方法にする

## References

- ADR-0005、lumorphia/prismtone ADR-0035、`apps/web/server/static.ts`、`apps/web/vite.config.ts`

## 追記 (2026-10-06): engine の依存も束ねる

`optimizeDeps.exclude` で engine を外すと、engine の中の import は Vite の依存の最適化が辿らない。engine がブラウザで使う依存を束ねないと、dev で pixi.js がそのまま配られ、CommonJS の eventemitter3 を ESM として読めずに描画が立ち上がらない (「WebGL が無効です」と出る)。本番ビルドでは起きないので、本番ビルドの E2E では見つからない。

ホストは、外した engine の依存を「engine > 依存」の形で `optimizeDeps.include` に足す。

```ts
optimizeDeps: {
  include: [
    "@mediapipe/tasks-vision",
    "@huggingface/transformers",
    "@lumorphia/editor-engine > pixi.js",
    "@lumorphia/editor-engine > pixi.js/unsafe-eval",
    "@lumorphia/editor-engine > idb-keyval",
  ],
  exclude: ["@lumorphia/editor-engine"],
},
```

engine が依存を増やしたら、ホストも足す。lumorphia/prismtone は、公開された engine の dist が import する依存が全部入っていることをテストで確かめている (`apps/app/vite-deps.test.ts`、lumorphia/prismtone#370)。このリポジトリの apps/web は engine を workspace から使う (`node_modules` の外にあり、最適化が辿る) ので、この問題は起きない。
