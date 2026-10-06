import type { EditRecipe } from "@lumorphia/editor-recipe";
import type { DraftStore } from "@lumorphia/editor-engine";
import type { EditorLocale } from "./i18n.ts";

/**
 * エディタを組み込むホスト (prismtone、単独アプリ、ほかのアプリ) が渡すもの (ADR-0035)。
 * エディタはホストのルーティング・保存先・計測を知らない。ここに無いものに依存しない
 */
export type EditorHost = {
  locale: EditorLocale;
  /** 端末の下書き (原本とレシピ)。自動保存と「現像し直し」に使う */
  drafts: DraftStore;
  /** 開いたときに読み込む下書き (prismtone は /edit?draft=<id>) */
  initialDraftId?: string | null;
  /** initialDraftId を読み終えた (リロードで読み直さないよう、ホストが URL などから外す) */
  onInitialDraftConsumed?: () => void;
  /** 書き出した画像の送り先。並べた順にボタンを出す。0 件なら「端末に保存」だけ */
  destinations: readonly EditorDestination[];
  /** 使われ方の計測。誰が使ったかは渡さない */
  telemetry?: (event: EditorTelemetryEvent) => void;
  inference?: {
    /** モデルと WASM の置き場所。既定は /models/ (同じオリジン) */
    modelBaseUrl?: string;
  };
  download?: {
    /** 端末に保存するファイル名の接尾辞 (prismtone は "-prismtone") */
    fileSuffix?: string;
  };
  /** E2E から描画結果を読むフック。enabled のときだけ window[globalName] に置く */
  testHook?: { globalName: string; enabled: () => boolean };
};

export type EditorDestination = {
  id: string;
  label: { ja: string; en: string };
  /** 強調して出す (主な送り先) */
  primary?: boolean;
  /** 投げたらその message を画面に出す */
  send(payload: EditorSendPayload): Promise<void>;
};

export type EditorSendPayload = {
  /** 書き出した画像 (WebP、なければ JPEG) */
  blob: Blob;
  recipe: EditRecipe;
  /** 原本。送り先で現像し直すとき (送客) に使う */
  original: Blob;
  sourceName: string;
  draftId: string;
};

export type EditorTelemetryEvent =
  { type: "open" } | { type: "save" } | { type: "send"; destinationId: string };

/** 端末に保存するときのファイル名。拡張子は書き出した形式に合わせる */
export function downloadName(sourceName: string, blobType: string, suffix: string): string {
  const ext = blobType === "image/webp" ? "webp" : "jpg";
  const base = sourceName.replace(/\.[^.]+$/, "");
  return `${base}${suffix}.${ext}`;
}
