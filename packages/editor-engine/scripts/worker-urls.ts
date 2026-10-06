/**
 * tsc は import の .ts を .js に書き換えるが、new URL("./x.worker.ts", import.meta.url) の文字列は書き換えない。
 * dist では Worker を .js で指す。ホスト (prismtone などの Vite) がこの new Worker(new URL(...)) を見て Worker を束ねる
 */
const WORKER_URL = /new URL\("(\.\/[\w.-]+\.worker)\.ts", import\.meta\.url\)/g;

export function rewriteWorkerUrls(code: string): { code: string; count: number } {
  let count = 0;
  const out = code.replace(WORKER_URL, (_match, base: string) => {
    count += 1;
    return `new URL("${base}.js", import.meta.url)`;
  });
  return { code: out, count };
}
