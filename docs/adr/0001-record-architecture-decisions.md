# ADR-0001: ADR を用いて設計判断を記録する

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

lumorphia/editor は lumorphia/prismtone から切り出した現像エディタで (prismtone の ADR-0035)、prismtone、単独アプリ、今後のほかのアプリから使われる。描画・レシピの互換・ホストとの境界など、使う側に影響する判断が多い。口頭やチャットで決めると、後から「なぜそうしたか」が追えなくなる。

## Decision

設計上の重要な判断は Architecture Decision Record (ADR) として `docs/adr/` に記録する。prismtone と同じ運用にする。

- 形式は `0000-template.md` に従う
- ファイル名は `NNNN-kebab-case-title.md`、番号は通し番号で欠番を作らない
- 一度 Accepted にした ADR は書き換えず、覆す場合は新しい ADR を作り、旧 ADR の Status を `Superseded by ADR-NNNN` にする
- 「重要な判断」の目安: 変更に 1 日以上かかる、ホストに求めることが変わる、レシピの形式が変わる、外部サービスへの依存が増減する、のいずれか
- prismtone で決めた現像の判断 (prismtone の ADR-0005 / 0009 / 0021 / 0025) は、移植の注記を付けてここにコピーする (#2)

## Consequences

### 良い点

- 判断の理由と却下した代替案が残り、ホストの側からも追える

### 悪い点・受け入れるリスク

- 記録の手間が増える。小さな判断まで ADR にすると形骸化するため、上記の目安で線を引く

## Alternatives

- 設計の文書の中に判断理由を書く: 文書が肥大化し、変更履歴が追えなくなる
- Git のコミットメッセージだけに残す: 検索性が低く、代替案が残らない

## References

- https://adr.github.io/madr/
- lumorphia/prismtone `docs/adr/0035-extract-editor-to-lumorphia-editor.md`
