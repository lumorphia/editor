# lumorphia/editor

ブラウザで動く写真の現像エディタ。色調整、トリミングと回転、範囲を選んだ部分補正、顔や装備をブラウザの中で認識する自動選択を持つ。画像は端末の外に出ない。

[lumorphia/prismtone](https://github.com/lumorphia/prismtone) の現像を切り出したもので、prismtone や単独アプリにパッケージとして組み込んで使う。

| パッケージ                 | 中身                                               |
| -------------------------- | -------------------------------------------------- |
| `@lumorphia/editor-recipe` | 編集レシピ (操作の記録、zod)。ブラウザとサーバー   |
| `@lumorphia/editor-engine` | 状態、描画 (PixiJS / WebGL)、推論 (Worker)、下書き |
| `@lumorphia/editor-react`  | UI (`<Editor host={...} />`)                       |

中身は prismtone から履歴ごと移した (`git log --follow` で最初の現像までたどれる)。設計は [docs/design/](docs/design/)、判断は [docs/adr/](docs/adr/README.md)、開発の約束は [AGENTS.md](AGENTS.md)。

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
