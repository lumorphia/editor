# ADR の一覧

| 番号                                                | 決めたこと                                                      | 元                 |
| --------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| [0001](0001-record-architecture-decisions.md)       | ADR を使う                                                      |                    |
| [0002](0002-client-side-editing-and-export.md)      | 編集と書き出しはブラウザで行う                                  | prismtone ADR-0005 |
| [0003](0003-versioned-edit-recipe.md)               | 編集レシピは版付きの JSON、変更は足すだけ                       | prismtone ADR-0009 |
| [0004](0004-two-stage-render-local-adjustments.md)  | 合成の段と表示の段、部分補正はフィルタを重ねる                  | prismtone ADR-0021 |
| [0005](0005-in-browser-inference-and-recipe-v3.md)  | 認識はブラウザの中で、モデルは自前で配る                        | prismtone ADR-0025 |
| [0006](0006-package-boundaries-and-host-adapter.md) | パッケージを 3 つに分け、ホストに頼むものは EditorHost で       |                    |
| [0007](0007-distribution-github-packages.md)        | GitHub Packages に 1 つの版で、ビルド済みの ESM として配る      |                    |
| [0008](0008-recipe-compatibility.md)                | レシピの互換は足すだけ、読めなくする変更は major                |                    |
| [0009](0009-host-requirements.md)                   | ホストに求めること (オリジンの分離、CSP、モデル、CSS、バンドラ) |                    |

0002〜0005 は lumorphia/prismtone から移植したもので、本文中の ADR の番号は prismtone のもの。対応は次のとおり。

| prismtone | このリポジトリ |
| --------- | -------------- |
| ADR-0005  | ADR-0002       |
| ADR-0009  | ADR-0003       |
| ADR-0021  | ADR-0004       |
| ADR-0025  | ADR-0005       |

切り出しの経緯は prismtone の [ADR-0035](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0035-extract-editor-to-lumorphia-editor.md)。
