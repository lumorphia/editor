# ADR-0006: パッケージを 3 つに分け、ホストに頼むものは EditorHost で受け取る

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

現像は prismtone に組み込まれて生まれ、i18n、ルーティング、投稿画面の IndexedDB、使用量の計測に直接つながっていた。切り出したあとは、prismtone、単独アプリ (apps/web)、今後のほかのアプリが使う。サーバーと DB はレシピだけを使う。

## Decision

- **3 つのパッケージに分ける**。依存の向きは recipe ← engine ← react ← アプリ。ESLint が強制し、`tooling/eslint-boundaries.test.ts` がルールの効きを確かめる
  - `@lumorphia/editor-recipe`: 編集レシピ (zod)。ブラウザでもサーバーでも動く。Node API を使わない
  - `@lumorphia/editor-engine`: 状態、履歴、マスク、描画 (PixiJS)、推論 (Worker)、下書き。React を使わない。描画 (`./render`) と推論 (`./inference/face`、`./inference/segment`) は重いので、使う側が動的 import する入口に分ける
  - `@lumorphia/editor-react`: UI。`<Editor host={...} />`。react-router を使わない
- **エディタはホストを知らない**。ホストに頼むものは `EditorHost` (`packages/editor-react/src/host.ts`) で受け取る
  - 表示言語
  - 下書きの置き場所 (`DraftStore`) と開く下書き
  - 送り先 (`destinations`)。書き出した画像、レシピ、原本、draftId を渡す
  - 使用量の計測 (`telemetry`。誰かは渡さない)
  - モデルの置き場所、保存ファイル名の接尾辞、E2E のフック
- 送り先が 0 件なら「端末に保存」だけを出す (単独アプリ)。prismtone は「投稿へ」の 1 件

## Consequences

### 良い点

- ホストを足すときにエディタを直さなくてよい。prismtone 固有の仕組み (投稿画面、件数の数え方) はホストの側に閉じる
- サーバーは描画や React を持ち込まずにレシピを検証できる

### 悪い点・受け入れるリスク

- `EditorHost` を変えると、すべてのホストに波及する。足すときは省略できる形 (任意) にする

## Alternatives

- 1 つのパッケージにまとめる: サーバーが PixiJS や React まで依存に持つ
- ホストを props ではなく React の context で渡す: どれが必須か型で分からない

## References

- lumorphia/prismtone ADR-0035、lumorphia/prismtone#357、#358
