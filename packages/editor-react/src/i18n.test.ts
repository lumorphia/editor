import { describe, expect, it } from "vitest";
import { editorTranslator } from "./i18n.ts";

describe("editorTranslator", () => {
  it("picks the Japanese text for ja", () => {
    expect(editorTranslator("ja").t("保存", "Save")).toBe("保存");
  });

  it("picks the English text for en", () => {
    expect(editorTranslator("en").t("保存", "Save")).toBe("Save");
  });

  it("translates editor vocabulary with tx", () => {
    expect(editorTranslator("en").tx("露光量")).toBe("Exposure");
  });
});
