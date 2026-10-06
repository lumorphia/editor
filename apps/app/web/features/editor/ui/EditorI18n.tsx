import { createContext, useContext, useMemo } from "react";
import { editorTranslator, type EditorLocale, type EditorTranslator } from "../i18n.ts";

/** エディタの中だけの i18n。表示言語はホストが渡す (prismtone の I18nProvider には依存しない) */
const EditorI18nContext = createContext<EditorTranslator | null>(null);

export function EditorI18nProvider({
  locale,
  children,
}: {
  locale: EditorLocale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => editorTranslator(locale), [locale]);
  return <EditorI18nContext value={value}>{children}</EditorI18nContext>;
}

export function useEditorI18n(): EditorTranslator {
  const value = useContext(EditorI18nContext);
  if (!value) throw new Error("EditorI18nProvider is missing");
  return value;
}
