# ADR-0003: 編集レシピはバージョン付き JSON として保存する

> lumorphia/prismtone の ADR-0009 (https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0009-versioned-edit-recipe.md) を移植したもの (2026-10-06)。本文は当時のまま。パスは prismtone の中にあったころのもので、今は `packages/editor-*` にある。リンク、Issue 番号、本文中の ADR の番号は prismtone のもの (このリポジトリの番号との対応は docs/adr/README.md)。

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-09-13 |
| Deciders | t1nyb0x    |

## Context

編集は非破壊で、調整値を「編集レシピ」として保持する。レシピはブラウザの編集状態、IndexedDB の一時保存、DB の `edit_recipes`、将来のレシピ共有 (Phase 2) と複数の場所で使われる。補正項目は将来増える (部分補正、粒状感など) が、投稿済みレシピの見え方を変えてはならない。

## Decision

- レシピは `{ version, presetId, adjust, geometry }` の JSON とし、スキーマは `packages/shared/recipe/` に zod で定義してブラウザとサーバーで共有する
- `version` は必須。読み込み時は必ず `migrateRecipe()` を通し、最新版に変換する。未知の version は拒否する
- 変更は **追加のみ**。既存項目の意味・値域を変えない。廃止する場合は deprecated として残し、読み込み時に無視する
- プリセットは `adjust` への部分適用として定義し、適用結果を展開して保存する。`presetId` は表示用であり、プリセット定義の変更が既存レシピに影響しない
- DB は `edit_recipes.recipe` を jsonb で持ち、`version` を別列に持つ (移行対象の検索用)。サーバーはレシピの内容を解釈せず、検証と保存のみ行う

## Consequences

### 良い点

- スキーマが 1 か所にあり、ブラウザ・API・DB で不整合が起きない
- 新機能追加時に旧レシピの互換性を機械的に担保できる (`migrate` の単体テスト)
- プリセットの調整を自由に行える

### 悪い点・受け入れるリスク

- 廃止項目を残すためスキーマが肥大化しうる。年 1 回程度、利用のない項目を version 更新で整理する
- jsonb のため DB 側で値の制約をかけられない。zod 検証をサーバーで必ず通す

### 追従して必要になること

- [04. 編集レシピ](https://github.com/lumorphia/prismtone/blob/develop/docs/design/04-edit-recipe.md) に v1 の完全な定義を置く
- シェーダの uniform とレシピ項目の対応表を保守する

## Alternatives

- **各補正値を DB の列にする**: 型は強くなるが、項目追加のたびにマイグレーションが必要。レシピが主に「表示・共有用のデータ」であることを考えると過剰
- **バージョンなし JSON**: 項目追加時に旧データの解釈が曖昧になる

## References

- [04. 編集レシピ](https://github.com/lumorphia/prismtone/blob/develop/docs/design/04-edit-recipe.md)
- [ADR-0005](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0005-client-side-editing-and-export.md)
