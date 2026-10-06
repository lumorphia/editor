import { createDraftStore, idbKeyValue } from "@lumorphia/editor-engine";
import type { EditorHost, EditorLocale } from "@lumorphia/editor-react";

/** 単独アプリの下書きの置き場所。prismtone (prismtone-editor) とは別のオリジンで、名前も分ける */
export const STANDALONE_IDB = { dbName: "lumorphia-editor", storeName: "kv" } as const;

export function localeFrom(languages: readonly string[]): EditorLocale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split("-")[0];
    if (base === "ja") return "ja";
    if (base === "en") return "en";
  }
  return "ja";
}

export function draftIdFrom(search: string): string | null {
  return new URLSearchParams(search).get("draft");
}

/** ?draft= を外した URL (リロードで同じ下書きを開き直さない) */
export function withoutDraft(pathAndSearch: string): string {
  const url = new URL(pathAndSearch, "http://x");
  url.searchParams.delete("draft");
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}

/** 単独アプリのホスト。送り先はまだ無く「端末に保存」だけ (送客は #6) */
export function standaloneHost(): EditorHost {
  return {
    locale: localeFrom(navigator.languages),
    drafts: createDraftStore(idbKeyValue(STANDALONE_IDB.dbName, STANDALONE_IDB.storeName)),
    initialDraftId: draftIdFrom(location.search),
    onInitialDraftConsumed: () =>
      history.replaceState(null, "", withoutDraft(location.pathname + location.search)),
    destinations: [],
    download: { fileSuffix: "" },
    testHook: {
      globalName: "__lumorphiaEditor",
      enabled: () => Boolean((window as { __LUMORPHIA_E2E__?: boolean }).__LUMORPHIA_E2E__),
    },
  };
}
