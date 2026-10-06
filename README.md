# lumorphia/editor

ブラウザで動く写真の現像エディタ。画像は端末の外に出ない。描画も認識もブラウザの中で行う。

- **色調整**: 露光量、コントラスト、ハイライト / シャドウ、色温度、彩度ほか。プリセット付き
- **幾何**: 回転、水平の補正、反転、トリミング (アスペクト比の固定)
- **部分補正**: 円形、ブラシ、多角形、切り抜きのマスクに、シャープ・美肌・背景ぼかし・発光・周辺減光・質感を掛ける (最大 12 件)
- **自動選択**: 顔と瞳 (MediaPipe Face Landmarker)、タップした装備・人物・背景 (SlimSAM)。人物補正のプリセットも持つ
- **編集レシピ**: 操作を版付きの JSON で残し、下書きから現像し直せる。古い版のレシピも読める
- **書き出し**: WebP (使えなければ JPEG)、長辺 4096 px まで

[lumorphia/prismtone](https://github.com/lumorphia/prismtone) (FF14 のスクリーンショットの共有サービス) の現像を切り出したもの。prismtone は投稿の場所として、このエディタを組み込んで使っている。

## パッケージ

GitHub Packages に、3 つを同じ版で公開している ([Releases](https://github.com/lumorphia/editor/releases)、今は 1.0.0)。

| パッケージ                 | 中身                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `@lumorphia/editor-recipe` | 編集レシピ (zod)。ブラウザでもサーバーでも動く。ホストのサーバーはこれで検証する         |
| `@lumorphia/editor-engine` | 状態、描画 (PixiJS / WebGL)、推論 (Web Worker)、下書き。CLI `editor-models` (モデル取得) |
| `@lumorphia/editor-react`  | UI。`<Editor host={...} />`                                                              |

## 組み込み方

### 入れる

読むには `read:packages` のトークンが要る。プロジェクトの `.npmrc` には向き先だけを書く。pnpm 12 は、リポジトリの `.npmrc` に書いた認証では環境変数を展開しないので、トークンはユーザーの設定に置く (CI では `actions/setup-node` の `registry-url` と `NODE_AUTH_TOKEN`)。

```ini
# .npmrc (プロジェクト)
@lumorphia:registry=https://npm.pkg.github.com
```

```sh
pnpm config set //npm.pkg.github.com/:_authToken "$(gh auth token)"   # 一度だけ (ユーザーの設定)
pnpm add @lumorphia/editor-react @lumorphia/editor-engine @lumorphia/editor-recipe
pnpm exec editor-models fetch --out models   # 認識のモデルと WASM を揃え、/models/ で配る
```

### 出す

ホストに頼むもの (表示言語、下書きの置き場所、送り先、計測など) は `EditorHost` で渡す ([ADR-0006](docs/adr/0006-package-boundaries-and-host-adapter.md))。

```tsx
import { createDraftStore, idbKeyValue } from "@lumorphia/editor-engine";
import { Editor, type EditorHost } from "@lumorphia/editor-react";

const host: EditorHost = {
  locale: "ja",
  drafts: createDraftStore(idbKeyValue("my-app-editor", "kv")),
  // 送り先。0 件なら「端末に保存」だけ
  destinations: [
    {
      id: "my-post",
      label: { ja: "投稿へ", en: "Continue to post" },
      primary: true,
      async send({ blob, recipe }) {
        /* 書き出した画像とレシピを受け取る */
      },
    },
  ],
};

export function EditPage() {
  return <Editor host={host} />;
}
```

最小の例は [apps/web/src/host.ts](apps/web/src/host.ts)、prismtone での組み立ては [features/editor-host](https://github.com/lumorphia/prismtone/tree/develop/apps/app/web/features/editor-host) (private)。

### ホストに求めること

詳しくは [ADR-0009](docs/adr/0009-host-requirements.md)。

- エディタのページに `Cross-Origin-Opener-Policy: same-origin` と `Cross-Origin-Embedder-Policy: credentialless` (Worker の応答にも)
- CSP は `script-src` に `'wasm-unsafe-eval'` (`'unsafe-eval'` は要らない)、`worker-src 'self' blob:`、`img-src` に `data:` と `blob:`
- `editor-models` で揃えたモデルを、同じオリジンの `/models/` で配る
- Tailwind v4 の `@source` に `@lumorphia/editor-react` の dist を足し、配色のトークン (`surface*`、`ink*`、`line*`、`accent*`) を定義する
- Vite では engine を事前バンドルから外し、engine の依存は「engine > 依存」の形で束ねる (束ねないと dev で描画が立ち上がらない)

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
resolve: { dedupe: ["react", "react-dom", "zod"] },
```

### 版と互換

- 3 つのパッケージは同じ版で上げる。版は固定して入れる ([ADR-0007](docs/adr/0007-distribution-github-packages.md))
- レシピの形式は足すだけで、既存の版を読めなくする変更は major ([ADR-0008](docs/adr/0008-recipe-compatibility.md))。読む側は必ず `migrateRecipe` を通す

## 開発

Node 24.21 以上と pnpm 12.8 以上。

```sh
pnpm install
pnpm test                                  # 単体テスト (ビルド不要。exports の source 条件でソースを読む)
pnpm lint && pnpm format:check && pnpm typecheck
pnpm build:packages                        # 3 つのパッケージを dist に
pnpm e2e                                   # 単独アプリ (apps/web) をビルドして Playwright
pnpm --filter @lumorphia/editor-web dev    # 単独アプリの dev サーバー
```

| 場所                            | 中身                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ |
| [packages/](packages/)          | 公開する 3 つのパッケージ                                                |
| [apps/web](apps/web/)           | 単独アプリ。COOP / COEP / CSP 付きで配る (`server/serve.ts`)。E2E の土台 |
| [e2e/](e2e/README.md)           | GPU と CPU の参照の照合、マスク、推論、CSP の違反 0 件                   |
| [docs/design/](docs/design/)    | レシピ (`edit-recipe.md`)、画面・描画・推論・テスト (`editor.md`)        |
| [docs/adr/](docs/adr/README.md) | 設計判断。0002〜0005 は prismtone から移植                               |
| [AGENTS.md](AGENTS.md)          | 開発の約束 (依存の向き、TDD、テストの書き方、リリース)                   |

作業は `develop` から `feat/<topic>` を切り、`develop` 向けの PR は **Rebase and merge** でマージする (マージコミットは release-please の変更履歴を二重にする)。`develop` → `main` のマージで release-please がリリース PR を開き、そのマージで公開する。中身は prismtone から履歴ごと移したので、`git log --follow` で最初の現像までたどれる。

## ライセンス

[AGPL-3.0](LICENSE)
