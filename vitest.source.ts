/**
 * テストはこのリポジトリのパッケージ (@lumorphia/editor-*) をビルドせずソースから読む。exports の "source" 条件。
 * Vite のビルドと Node の実行は "default" (dist) を読むので、公開する形はそちらで確かめる。
 * conditions を指定すると既定は足されないので、Vitest が Node 環境で使う条件 ("module" は入れない。入れると
 * ESM のビルドを拡張子なしで読もうとして落ちる依存がある) を並べる。
 * 各パッケージの vitest.config.ts で `...readEditorSource` として使う
 */
export const readEditorSource = {
  ssr: { resolve: { conditions: ["source", "node", "development|production"] } },
};
