import { createStore, del, get, keys, set } from "idb-keyval";
import { upgradeStoredRecipe, type EditRecipe } from "@lumorphia/editor-recipe";

/**
 * 端末内の下書き (docs/design/04 §6, 03 §9)。原本 Blob とレシピを IndexedDB に置く。
 * 最大 5 件、古いものから消す。別端末には同期しない。
 * どの DB に置くか、どの下書きを消さずに残すかはホスト (prismtone なら投稿導線) が決める
 */
export type Draft = {
  id: string;
  name: string;
  blob: Blob;
  recipe: EditRecipe;
  updatedAt: number;
};

export const DRAFT_LIMIT = 5;
const DRAFT_PREFIX = "draft:";

/** 下書きを置くキーバリュー。IndexedDB (idb-keyval) か、テストではメモリ */
export type DraftKeyValue = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<IDBValidKey[]>;
};

export type DraftStore = {
  save(draft: Draft): Promise<void>;
  load(id: string): Promise<Draft | undefined>;
  /** 新しい順 */
  list(): Promise<Draft[]>;
  remove(id: string): Promise<void>;
};

export type DraftStoreOptions = {
  /** 上限を超えても消さない下書き。投稿画像として残っているもの (#64) など */
  protectedIds?: () => Promise<readonly string[]>;
};

function upgradeDraft(draft: Draft | undefined): Draft | undefined {
  if (!draft) return undefined;
  const recipe = upgradeStoredRecipe(draft.recipe);
  return recipe ? { ...draft, recipe } : undefined;
}

/**
 * 上限を超えた分だけ古い順に消す候補。保護された下書きは消さない。
 * 保護した分で上限を超えることはある (prismtone では両方の上限が 5 なので最大 5 件残る)。
 */
export function selectStaleDrafts(
  drafts: readonly Draft[],
  protectedIds: readonly string[],
): Draft[] {
  const keep = new Set(protectedIds);
  const excess = drafts.length - DRAFT_LIMIT;
  if (excess <= 0) return [];
  return [...drafts]
    .filter((d) => !keep.has(d.id))
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, excess);
}

export function createDraftStore(kv: DraftKeyValue, options: DraftStoreOptions = {}): DraftStore {
  const draftKeys = async () =>
    (await kv.keys()).filter(
      (k): k is string => typeof k === "string" && k.startsWith(DRAFT_PREFIX),
    );

  return {
    async save(draft) {
      await kv.set(`${DRAFT_PREFIX}${draft.id}`, draft);
      const all = await draftKeys();
      if (all.length <= DRAFT_LIMIT) return;
      const drafts = await Promise.all(all.map((k) => kv.get<Draft>(k)));
      const protectedIds = (await options.protectedIds?.()) ?? [];
      for (const d of selectStaleDrafts(
        drafts.filter((d): d is Draft => Boolean(d)),
        protectedIds,
      ))
        await kv.del(`${DRAFT_PREFIX}${d.id}`);
    },
    async load(id) {
      return upgradeDraft(await kv.get<Draft>(`${DRAFT_PREFIX}${id}`));
    },
    async list() {
      const drafts = await Promise.all(
        (await draftKeys()).map((k) => kv.get<Draft>(k).then(upgradeDraft)),
      );
      return drafts.filter((d): d is Draft => Boolean(d)).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async remove(id) {
      await kv.del(`${DRAFT_PREFIX}${id}`);
    },
  };
}

/** idb-keyval の 1 ストアをキーバリューとして使う */
export function idbKeyValue(dbName: string, storeName: string): DraftKeyValue {
  const store = () => createStore(dbName, storeName);
  return {
    get: (key) => get(key, store()),
    set: (key, value) => set(key, value, store()),
    del: (key) => del(key, store()),
    keys: () => keys(store()),
  };
}
