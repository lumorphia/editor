import { translateLabel } from "@lumorphia/editor-recipe/labels";

export type EditorLocale = "ja" | "en";

export type EditorTranslator = {
  locale: EditorLocale;
  /** 画面の文言。日本語と英語を並べて書き、表示言語のほうを返す */
  t: (ja: string, en: string) => string;
  /** 現像の語彙 (項目名・プリセット名) を表示言語にする */
  tx: (value: string) => string;
};

export function editorTranslator(locale: EditorLocale): EditorTranslator {
  return {
    locale,
    t: (ja, en) => (locale === "en" ? en : ja),
    tx: (value) => translateLabel(locale, value),
  };
}
