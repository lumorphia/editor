import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE } from "@prismtone/shared/recipe";
import {
  createDraftStore,
  DRAFT_LIMIT,
  selectStaleDrafts,
  upgradeStoredRecipe,
  type Draft,
  type DraftKeyValue,
} from "./drafts.ts";

const draft = (id: string, updatedAt: number): Draft => ({
  id,
  name: id,
  blob: new Blob([id]),
  recipe: DEFAULT_RECIPE,
  updatedAt,
});

/** IndexedDB の代わり。キーと値をそのまま持つ */
function memoryKeyValue(initial: Record<string, unknown> = {}): DraftKeyValue & {
  entries: () => Record<string, unknown>;
} {
  let data: Record<string, unknown> = { ...initial };
  return {
    get: async <T>(key: string) => data[key] as T | undefined,
    set: async (key, value) => {
      data = { ...data, [key]: value };
    },
    del: async (key) => {
      const { [key]: _removed, ...rest } = data;
      data = rest;
    },
    keys: async () => Object.keys(data),
    entries: () => data,
  };
}

describe("selectStaleDrafts", () => {
  const seven = Array.from({ length: DRAFT_LIMIT + 2 }, (_, i) => draft(String(i), i));

  it("removes the oldest beyond the limit", () => {
    expect(selectStaleDrafts(seven, []).map((d) => d.id)).toEqual(["0", "1"]);
    expect(selectStaleDrafts(seven.slice(0, DRAFT_LIMIT), [])).toEqual([]);
  });

  it("never removes protected drafts, even if they are the oldest", () => {
    expect(selectStaleDrafts(seven, ["0", "1"]).map((d) => d.id)).toEqual(["2", "3"]);
    // 保護で候補が足りないときは残る分を消すだけ
    expect(selectStaleDrafts(seven, ["0", "1", "2", "3", "4", "5"]).map((d) => d.id)).toEqual([
      "6",
    ]);
  });
});

describe("createDraftStore", () => {
  it("stores a draft under the draft: key so existing drafts stay readable", async () => {
    const kv = memoryKeyValue();
    await createDraftStore(kv).save(draft("a", 1));
    expect(Object.keys(kv.entries())).toEqual(["draft:a"]);
  });

  it("loads a draft saved before the split with its recipe upgraded", async () => {
    const { version: _v, localAdjustments: _l, ...v1 } = DEFAULT_RECIPE;
    const kv = memoryKeyValue({
      "draft:old": { ...draft("old", 1), recipe: { ...v1, version: 1 } },
    });
    expect((await createDraftStore(kv).load("old"))?.recipe).toEqual(DEFAULT_RECIPE);
  });

  it("treats a draft with an unreadable recipe as missing", async () => {
    const kv = memoryKeyValue({ "draft:bad": { ...draft("bad", 1), recipe: { version: 99 } } });
    expect(await createDraftStore(kv).load("bad")).toBeUndefined();
  });

  it("drops the oldest drafts once the limit is exceeded", async () => {
    const kv = memoryKeyValue();
    const store = createDraftStore(kv);
    for (let i = 0; i < DRAFT_LIMIT + 1; i += 1) await store.save(draft(String(i), i));
    expect((await store.list()).map((d) => d.id)).toEqual(["5", "4", "3", "2", "1"]);
  });

  it("keeps drafts the host protects when trimming", async () => {
    const kv = memoryKeyValue();
    const store = createDraftStore(kv, { protectedIds: async () => ["0"] });
    for (let i = 0; i < DRAFT_LIMIT + 1; i += 1) await store.save(draft(String(i), i));
    expect((await store.list()).map((d) => d.id)).toEqual(["5", "4", "3", "2", "0"]);
  });

  it("ignores keys that other features keep in the same store", async () => {
    const kv = memoryKeyValue({ pending: [], "post-form": {}, "postDraft:x": {} });
    expect(await createDraftStore(kv).list()).toEqual([]);
  });

  it("removes a draft by id", async () => {
    const kv = memoryKeyValue();
    const store = createDraftStore(kv);
    await store.save(draft("a", 1));
    await store.remove("a");
    expect(await store.load("a")).toBeUndefined();
  });
});

describe("upgradeStoredRecipe (#109 レシピの版上げ)", () => {
  it("brings a version 1 recipe saved before local adjustments up to the current version", () => {
    const { version: _v, localAdjustments: _l, ...v1 } = DEFAULT_RECIPE;
    expect(upgradeStoredRecipe({ ...v1, version: 1 })).toEqual(DEFAULT_RECIPE);
  });

  it("returns null for a recipe it cannot read instead of throwing", () => {
    expect(upgradeStoredRecipe({ version: 99 })).toBeNull();
    expect(upgradeStoredRecipe(undefined)).toBeNull();
  });

  it("keeps a current recipe as it is", () => {
    expect(upgradeStoredRecipe(DEFAULT_RECIPE)).toEqual(DEFAULT_RECIPE);
  });
});
