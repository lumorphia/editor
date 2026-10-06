# AGENTS.md

lumorphia/editor: ブラウザで動く写真の現像エディタ。描画 (PixiJS / WebGL)、部分補正、ブラウザ内の認識 (顔・切り抜き)、編集レシピを持つ。
ホスト (lumorphia/prismtone や単独アプリ) に組み込んで使う。経緯は lumorphia/prismtone の ADR-0035。

## 構成

```
packages/editor-recipe  @lumorphia/editor-recipe  編集レシピ (zod)。ブラウザでもサーバーでも動く
packages/editor-engine  @lumorphia/editor-engine  状態、描画、推論 (Worker)、下書き、CLI editor-models
packages/editor-react   @lumorphia/editor-react   UI。<Editor host={...} />
apps/web                単独アプリ (Vite + React。server/serve.ts が COOP / COEP / CSP 付きで配る。E2E の土台を兼ねる)
e2e/                    E2E (apps/web に対して Playwright で回す。e2e/README.md)
docs/design/            設計 (edit-recipe.md: レシピ、editor.md: 画面・描画・推論・テスト)
docs/adr/               設計判断 (README.md に一覧と prismtone の番号との対応)
```

パッケージの中身は lumorphia/prismtone から履歴ごと移した。コミットメッセージの `lumorphia/prismtone#N` は prismtone の Issue / PR。

## 依存の方向 (ESLint が強制する。tooling/eslint-boundaries.test.ts が確かめる)

```
editor-recipe  ->  zod だけ。Node API を使わない
editor-engine  ->  editor-recipe と描画・推論のライブラリ。React を使わない (bin/ と scripts/ は Node API を使ってよい)
editor-react   ->  editor-engine、editor-recipe、react。react-router を使わない
apps/web       ->  上の全部
```

- どのパッケージもホスト (`@prismtone/*` など) を import しない。ホストに頼むものは `EditorHost` で受け取る
- ほかのパッケージは `package.json` の exports から使う (`/src/` や `/dist/` を直接指さない)

## 作業の流れ

1. `develop` から `feat/<topic>` を切る。`develop` と `main` に直接コミットしない。`main` はリリース用で、`develop` からだけマージする
2. **TDD で進める**。実装より先に、失敗するテストを書く (red) → 通す最小の実装 (green) → 整える (refactor)。新しいテストは、実装前に一度落ちるのを確かめてから通す
3. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` を通す。husky が pre-commit で変更ファイルの ESLint / Prettier と gitleaks、pre-push で typecheck と test を回す (`pnpm install` で有効になる)
4. `develop` 向けに PR を作る (`gh pr create --base develop`)。Issue は PR 本文とコミットメッセージに `Closes #N` を書いて閉じる

コミットは `feat:` `fix:` `docs:` `test:` `refactor:` `build:` `ci:` の Conventional Commits、本文は日本語。

## テストの書き方

- **1 つの `it` に 1 つの振る舞い**。名前は「何をすると何になる」を言い切る。落ちたときにテスト名だけで何が壊れたか分かるのが目安
- **カバレッジは手がかりで、目標ではない**。閾値 (lines / functions / statements 80%、branches 70%) は下限
- テストは環境に依存しない。外部のサービスに出ていかない
- ブラウザでしか確かめられないもの (WebGL、Worker / WASM、CSP、ポインタ操作) は Playwright の E2E で見る。GPU の出力は CPU の参照実装 (`@lumorphia/editor-engine/reference`) と照合する
- テストはパッケージをビルドせずソースから読む (exports の `source` 条件、`vitest.source.ts`)

## コードの約束

- TypeScript strict、`import type` を使う、`.ts` 拡張子付きで import する
- コメント・ドキュメント・コミットは日本語。絵文字は使わない
- 配列やオブジェクトは変更せず新しく作る
- ログやテストにシークレットを書かない
- 設計上の判断を変えるときは ADR を追加する (`docs/adr/`)
- **レシピの形式は足すだけ**。既存の版を読めなくする変更は major。読む側は必ず `migrateRecipe` を通す

## 依存の入れ方

- pnpm 12 は公開から 1 日経っていない版を入れない (`minimumReleaseAge`)。`pnpm-workspace.yaml` で緩めない。手元で確かめるだけなら `pnpm_config_minimum_release_age=0` を付ける
- ビルドスクリプトを持つ依存は `pnpm-workspace.yaml` の `allowBuilds` に許可か不許可を書く (書かないと install が落ちる)

## よく使うコマンド

```sh
pnpm test            # 単体テスト (ビルド不要)
pnpm test:coverage   # カバレッジ付き
pnpm typecheck
pnpm lint && pnpm format:check
pnpm build:packages  # 各パッケージを dist に
pnpm e2e             # パッケージと apps/web をビルドして E2E
pnpm --filter @lumorphia/editor-web dev  # 単独アプリの dev サーバー
```
