# ADR-0008: レシピの互換は足すだけ、読めなくする変更は major

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

レシピ (`@lumorphia/editor-recipe`) は、ホストの DB (prismtone の `edit_recipes`)、端末の下書き (IndexedDB)、今後は書き出した画像のメタデータ (lumorphia/prismtone#352) や送客 (#6) にも残る。エディタとホストは別々に版を上げるので、どちらが古くても読める必要がある。ADR-0003 (prismtone ADR-0009) の「変更は足すだけ」を、パッケージの版の決まりにつなげる。

## Decision

- レシピの形式は **新しい版を足す** (`version` を上げ、`migrateV{n}toV{n+1}` を足す)。既存の版のスキーマは変えない。今は v4
- 読む側は **必ず `migrateRecipe` (保存したものは `upgradeStoredRecipe`) を通す**
- パッケージの版 (semver) との対応:
  - レシピの新しい版を足す: minor。古いエディタは新しい版を読めないので、ホストは先にサーバー (検証) を上げる
  - 既存の版を読めなくする、`migrateRecipe` の結果を変える: major
  - 0.x のあいだは minor を major として扱う (release-please の `bump-minor-pre-major`)

## Consequences

### 良い点

- 保存済みのレシピが、エディタの版を上げても読める

### 悪い点・受け入れるリスク

- 古い版のスキーマを持ち続ける

## References

- ADR-0003、lumorphia/prismtone ADR-0009
