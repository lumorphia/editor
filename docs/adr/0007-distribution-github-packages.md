# ADR-0007: GitHub Packages に 1 つの版で、ビルド済みの ESM として配る

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

prismtone はパッケージを workspace のソース (.ts) のまま使っていた。別のリポジトリから使うには、配る形と置き場所を決める必要がある。Node は `node_modules` の中の .ts の型を剥がさないので、サーバーが使うレシピは JS で配る必要がある。

## Decision

- **置き場所は GitHub Packages** (`npm.pkg.github.com`、スコープ `@lumorphia`)。読むには `read:packages` のトークンが要る
- **3 つを 1 つの版で上げる**。release-please がリポジトリの版を上げ、`extra-files` で 3 つの `package.json` の `version` を同じ値にする。リリース PR のマージで GitHub Release を作り、CI の release ジョブが 3 つを公開する。パッケージ同士の `workspace:*` は公開のときに同じ版 (固定) に置き換わる
- **ビルド済みの ESM を配る** (tsc。.d.ts と source map 付き、ESM のみ)。exports は条件付き:
  - `source` (src): このリポジトリの型検査 (`customConditions`) と Vitest (`vitest.source.ts`)。ビルドせずにテストできる
  - `types` / `default` (dist): それ以外 (ホストの Vite、Node の実行)
  - `files` に src も入れる (source map の元。ホストが `source` 条件で読むこともできる)
- **Worker は束ねずに配る**。dist でも `new Worker(new URL("./x.worker.js", import.meta.url))` の形にし (`scripts/finish-dist.ts`)、ホストの Vite に束ねさせる。MediaPipe と transformers.js を dist に抱え込まない
- **モデルと WASM はパッケージに入れない**。engine の CLI `editor-models fetch --out <dir>` が sha256 を固定して揃える (`bin/assets.ts`)。WASM は engine の依存からコピーするので、JS と WASM の版がずれない
- **zod は editor-recipe の `dependencies`** (peer にしない)。peer にすると、workspace のまま本番用の依存だけを入れた prismtone の Docker で、recipe から zod が見えなかった (lumorphia/prismtone#365)。ホストと同じ範囲 (`^4`) にして、pnpm の lockfile で 1 つの版に寄せる。ブラウザではホストの Vite の `resolve.dedupe` で 1 つにする (zod の jitless の設定は読み込んだ実体にだけ効く)

## Consequences

### 良い点

- ホストは版を固定して使え、Renovate で上げられる
- 3 つの版が常にそろうので、組み合わせの互換を考えなくてよい

### 悪い点・受け入れるリスク

- 読むのにトークンが要る (CI、Docker build、開発者の手元)。パッケージの設定で、使うリポジトリの Actions に読み取りを許す
- 変更がなくても 3 つとも版が上がる
- zod の版がホストとずれると、サーバーで 2 つの実体になりうる (サーバーは CSP の制約が無く、検証は動く)

## Alternatives

- npmjs.com に公開する: 公開範囲を広げる判断はまだしない
- パッケージごとに版を付ける (release-please の node-workspace): 組み合わせの互換表が要り、workspace:* の書き換えも入る
- Vite の lib モードで Worker まで束ねる: dist が重くなり、ホスト側の MediaPipe / transformers.js と二重に持つ

## References

- lumorphia/prismtone#359、#365
