import { describe, expect, it } from "vitest";
import { STANDALONE_IDB, draftIdFrom, localeFrom, withoutDraft } from "./host.ts";

describe("localeFrom", () => {
  it("shows English to an English browser", () => {
    expect(localeFrom(["en-US", "ja"])).toBe("en");
  });

  it("shows Japanese to a Japanese browser", () => {
    expect(localeFrom(["ja-JP", "en"])).toBe("ja");
  });

  it("falls back to Japanese for other languages", () => {
    expect(localeFrom(["fr-FR"])).toBe("ja");
  });
});

describe("draftIdFrom", () => {
  it("reads the draft to reopen from ?draft=", () => {
    expect(draftIdFrom("?draft=abc")).toBe("abc");
  });

  it("is null without a draft", () => {
    expect(draftIdFrom("")).toBeNull();
  });
});

describe("withoutDraft", () => {
  it("drops the draft so a reload does not reopen it", () => {
    expect(withoutDraft("/?draft=abc&x=1")).toBe("/?x=1");
  });

  it("drops the question mark when nothing is left", () => {
    expect(withoutDraft("/?draft=abc")).toBe("/");
  });
});

describe("STANDALONE_IDB", () => {
  it("keeps the standalone drafts apart from prismtone's", () => {
    expect(STANDALONE_IDB).toEqual({ dbName: "lumorphia-editor", storeName: "kv" });
  });
});
