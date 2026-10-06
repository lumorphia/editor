# E2E

prismtone から移した現像の E2E (`editor.spec.ts`: GPU と CPU の照合、マスク、推論。`perf-local-adjust.spec.ts`: 性能の計測)。

今はまだ動かない。prismtone の土台 (`./test.ts` の CSP の見張り、`./helpers.ts`、`./api.ts` の `devLogin`、投稿画面への遷移) を前提にしているため。単独アプリ (`apps/web`) を E2E の土台にして、このリポジトリで回せるようにする (#3)。それまでは lint だけかかり、型検査 (tsconfig.json の include に無い) と実行はしない。
