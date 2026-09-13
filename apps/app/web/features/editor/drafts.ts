import { createStore, del, get, keys, set } from "idb-keyval";
import type { EditRecipe } from "@prismtone/shared/recipe";

/**
 * 端末内の下書き (docs/design/04 §6, 03 §9)。原本 Blob とレシピを IndexedDB に置く。
 * 最大 5 件、古いものから消す。別端末には同期しない。
 */
export type Draft = {
  id: string;
  name: string;
  blob: Blob;
  recipe: EditRecipe;
  updatedAt: number;
};

/** 投稿導線へ渡す書き出し結果。 */
export type PendingExport = {
  draftId: string;
  blob: Blob;
  recipe: EditRecipe;
  createdAt: number;
};

export const DRAFT_LIMIT = 5;
const PENDING_KEY = "pending";

const store = () => createStore("prismtone-editor", "kv");

export async function saveDraft(draft: Draft): Promise<void> {
  const s = store();
  await set(`draft:${draft.id}`, draft, s);
  const all = (await keys(s)).filter(
    (k): k is string => typeof k === "string" && k.startsWith("draft:"),
  );
  if (all.length > DRAFT_LIMIT) {
    const drafts = await Promise.all(all.map((k) => get<Draft>(k, s)));
    const stale = drafts
      .filter((d): d is Draft => Boolean(d))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, drafts.length - DRAFT_LIMIT);
    await Promise.all(stale.map((d) => del(`draft:${d.id}`, s)));
  }
}

export async function loadDraft(id: string): Promise<Draft | undefined> {
  return get<Draft>(`draft:${id}`, store());
}

export async function listDrafts(): Promise<Draft[]> {
  const s = store();
  const all = (await keys(s)).filter(
    (k): k is string => typeof k === "string" && k.startsWith("draft:"),
  );
  const drafts = await Promise.all(all.map((k) => get<Draft>(k, s)));
  return drafts.filter((d): d is Draft => Boolean(d)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDraft(id: string): Promise<void> {
  await del(`draft:${id}`, store());
}

export async function setPendingExport(p: PendingExport): Promise<void> {
  await set(PENDING_KEY, p, store());
}

export async function takePendingExport(): Promise<PendingExport | undefined> {
  const s = store();
  const p = await get<PendingExport>(PENDING_KEY, s);
  if (p) await del(PENDING_KEY, s);
  return p;
}
