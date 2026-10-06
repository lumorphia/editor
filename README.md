# lumorphia/editor

ブラウザで動く写真の現像エディタ。色調整、トリミングと回転、範囲を選んだ部分補正、顔や装備をブラウザの中で認識する自動選択を持つ。画像は端末の外に出ない。

[lumorphia/prismtone](https://github.com/lumorphia/prismtone) の現像を切り出したもので、prismtone や単独アプリにパッケージとして組み込んで使う。

| パッケージ                 | 中身                                               |
| -------------------------- | -------------------------------------------------- |
| `@lumorphia/editor-recipe` | 編集レシピ (操作の記録、zod)。ブラウザとサーバー   |
| `@lumorphia/editor-engine` | 状態、描画 (PixiJS / WebGL)、推論 (Worker)、下書き |
| `@lumorphia/editor-react`  | UI (`<Editor host={...} />`)                       |

中身は prismtone から履歴ごと移した (`git log --follow` で最初の現像までたどれる)。設計は [docs/design/](docs/design/)、判断は [docs/adr/](docs/adr/README.md)、開発の約束は [AGENTS.md](AGENTS.md)。

## 使い方

GitHub Packages (`npm.pkg.github.com`) に公開している。読むには `read:packages` のトークンが要る。

```ini
# .npmrc
@lumorphia:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```sh
pnpm add @lumorphia/editor-react @lumorphia/editor-engine @lumorphia/editor-recipe
pnpm exec editor-models fetch --out models   # 認識のモデルと WASM を揃え、/models/ で配る
```

ホストに求めること (オリジンの分離、CSP、モデル、CSS、Vite の設定) は [ADR-0009](docs/adr/0009-host-requirements.md)。組み込み方は [apps/web](apps/web/src/main.tsx) が最小の例。

## 開発

Node 24.21 以上と pnpm 12.8 以上。

```sh
pnpm install
pnpm test          # 単体テスト (ビルド不要)
pnpm build         # 各パッケージを dist に
node packages/editor-engine/dist/bin/editor-models.js fetch --out models  # 認識のモデルと WASM
```

## ライセンス

[AGPL-3.0](LICENSE)
