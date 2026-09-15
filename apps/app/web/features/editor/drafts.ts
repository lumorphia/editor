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
export const PENDING_EXPORT_LIMIT = 5;
const PENDING_KEY = "pending";
const POST_FORM_KEY = "post-form";

const store = () => createStore("prismtone-editor", "kv");

export async function saveDraft(draft: Draft): Promise<void> {
  const s = store();
  await set(`draft:${draft.id}`, draft, s);
  const all = (await keys(s)).filter(
    (k): k is string => typeof k === "string" && k.startsWith("draft:"),
  );
  if (all.length > DRAFT_LIMIT) {
    const drafts = await Promise.all(all.map((k) => get<Draft>(k, s)));
    const pending = await listPendingExports();
    for (const d of selectStaleDrafts(
      drafts.filter((d): d is Draft => Boolean(d)),
      pending.map((p) => p.draftId),
    ))
      await del(`draft:${d.id}`, s);
  }
}

/**
 * 上限を超えた分だけ古い順に消す候補。投稿画像として残っている下書きは「現像をやり直す」(#64) の元なので消さない。
 * 保護した分で上限を超えることはある (両方の上限が 5 なので最大 5 件残る)。
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

export function addToPendingExports(
  current: readonly PendingExport[],
  next: PendingExport,
): PendingExport[] {
  const existing = current.findIndex((item) => item.draftId === next.draftId);
  if (existing >= 0) return current.map((item, index) => (index === existing ? next : item));
  if (current.length >= PENDING_EXPORT_LIMIT) {
    throw new Error(`投稿画像は ${PENDING_EXPORT_LIMIT} 枚までです`);
  }
  return [...current, next];
}

/** 旧版の単一オブジェクトも配列へ読み替える。 */
export async function listPendingExports(): Promise<PendingExport[]> {
  const s = store();
  const value = await get<PendingExport | PendingExport[]>(PENDING_KEY, s);
  if (!value) return [];
  return Array.isArray(value) ? value.slice(0, PENDING_EXPORT_LIMIT) : [value];
}

export async function setPendingExports(items: readonly PendingExport[]): Promise<void> {
  if (items.length > PENDING_EXPORT_LIMIT) {
    throw new Error(`投稿画像は ${PENDING_EXPORT_LIMIT} 枚までです`);
  }
  const s = store();
  if (items.length === 0) await del(PENDING_KEY, s);
  else await set(PENDING_KEY, [...items], s);
}

export async function addPendingExport(next: PendingExport): Promise<void> {
  await setPendingExports(addToPendingExports(await listPendingExports(), next));
}

export async function clearPendingExports(): Promise<void> {
  await del(PENDING_KEY, store());
}

/**
 * 投稿設定の入力内容の端末内下書き (#57)。書き出した画像 (pending) と同じ場所に置き、
 * 投稿の完了と「すべて破棄」(#58) で消す。装備は ItemSummary ごと保存する (structured clone 可)。
 */
export type PostFormDraft = {
  title: string;
  description: string;
  tags: string;
  visibility: "public" | "unlisted" | "private";
  characterId: string | null;
  itemsVisibility: "public" | "private";
  equipment: unknown[];
  profile: { job: string | null; race: string | null; clan: string | null; gender: string | null };
  updatedAt: number;
};

export async function loadPostFormDraft(): Promise<PostFormDraft | undefined> {
  return get<PostFormDraft>(POST_FORM_KEY, store());
}

export async function savePostFormDraft(draft: PostFormDraft): Promise<void> {
  await set(POST_FORM_KEY, draft, store());
}

export async function clearPostFormDraft(): Promise<void> {
  await del(POST_FORM_KEY, store());
}
