# E2E

単独アプリ (`apps/web`) に対して現像を確かめる。WebGL は headless Chromium の SwiftShader。

- `editor.spec.ts`: lumorphia/prismtone から移した。確かめること:
  - GPU の出力と CPU の参照 (`@lumorphia/editor-engine/reference`) の照合
  - マスク
  - ズームとピンチ、比較、保存
  - 顔検出と切り抜き (MediaPipe、SlimSAM)、人物補正
  - 下書きからの開き直し
- `editor-styles.spec.ts`: UI のクラスがホストの CSS に入っていること (Tailwind の `@source`)
- `perf-local-adjust.spec.ts`: 部分補正の数ごとの描画時間と書き出し時間。`PERF=1` のときだけ走る

`test.ts` の `test` を使う。CSP の違反を全テストで見張り、終わりに 0 件であることを確かめる。

```sh
pnpm e2e   # パッケージと apps/web をビルドしてから回す
```
