import { createStore, del, get, keys, set } from "idb-keyval";
import { migrateRecipe, type EditRecipe } from "@prismtone/shared/recipe";

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

/**
 * IndexedDB に残っているレシピを現行の版に上げる (docs/design/04 §5)。
 * 部分補正 (#109) より前に保存した下書きは version 1 なので、読むたびにここで揃える。
 * 読めないものは null (壊れた下書きは無かったことにする)
 */
export function upgradeStoredRecipe(input: unknown): EditRecipe | null {
  try {
    return migrateRecipe(input);
  } catch {
    return null;
  }
}

function upgradeDraft(draft: Draft | undefined): Draft | undefined {
  if (!draft) return undefined;
  const recipe = upgradeStoredRecipe(draft.recipe);
  return recipe ? { ...draft, recipe } : undefined;
}

function upgradePending(items: readonly PendingExport[]): PendingExport[] {
  return items.flatMap((item) => {
    const recipe = upgradeStoredRecipe(item.recipe);
    return recipe ? [{ ...item, recipe }] : [];
  });
}

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
  return upgradeDraft(await get<Draft>(`draft:${id}`, store()));
}

export async function listDrafts(): Promise<Draft[]> {
  const s = store();
  const all = (await keys(s)).filter(
    (k): k is string => typeof k === "string" && k.startsWith("draft:"),
  );
  const drafts = await Promise.all(all.map((k) => get<Draft>(k, s).then(upgradeDraft)));
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
  return upgradePending(Array.isArray(value) ? value.slice(0, PENDING_EXPORT_LIMIT) : [value]);
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
  // 画像が変わったので、下書きから開いた作業中も未保存扱いにする
  const form = await loadPostFormDraft();
  if (form && !form.dirty) await savePostFormDraft({ ...form, dirty: true });
}

export async function clearPendingExports(): Promise<void> {
  await del(PENDING_KEY, store());
}

/** 投稿設定の入力内容。装備は ItemSummary ごと保存する (structured clone 可) */
export type PostFormFields = {
  title: string;
  description: string;
  tags: string;
  visibility: "public" | "unlisted" | "private";
  characterId: string | null;
  itemsVisibility: "public" | "private";
  equipment: unknown[];
  profile: { job: string | null; race: string | null; clan: string | null; gender: string | null };
};

/**
 * 作業中の投稿設定 (#57)。書き出した画像 (pending) と同じ場所に置き、/edit との往復で消えないようにする。
 * 投稿の完了、「すべて破棄」(#58)、投稿設定からの離脱で消す。
 * draftId は下書き (PostDraft) から開いたときの元。投稿が完了したらその下書きも消す
 */
export type PostFormDraft = PostFormFields & {
  draftId?: string | null;
  /** 下書きに保存してから変えたものがあるか。画像の追加・やり直しでも立てる */
  dirty?: boolean;
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

/**
 * 保存した下書き (docs/design/08 §4)。作業中の画像と入力内容のスナップショット。
 * /drafts に一覧し、開くと作業中に読み込む。最大 10 件
 */
export type PostDraft = PostFormFields & {
  id: string;
  images: PendingExport[];
  updatedAt: number;
};

export const POST_DRAFT_LIMIT = 10;
const POST_DRAFT_PREFIX = "postDraft:";

export async function listPostDrafts(): Promise<PostDraft[]> {
  const s = store();
  const all = (await keys(s)).filter(
    (k): k is string => typeof k === "string" && k.startsWith(POST_DRAFT_PREFIX),
  );
  const drafts = await Promise.all(all.map((k) => get<PostDraft>(k, s).then(upgradePostDraft)));
  return drafts.filter((d): d is PostDraft => Boolean(d)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadPostDraft(id: string): Promise<PostDraft | undefined> {
  return upgradePostDraft(await get<PostDraft>(`${POST_DRAFT_PREFIX}${id}`, store()));
}

function upgradePostDraft(draft: PostDraft | undefined): PostDraft | undefined {
  return draft ? { ...draft, images: upgradePending(draft.images) } : undefined;
}

/** 同じ id は上書き。新規で上限を超えるなら投げる (古いものを勝手に消さない) */
export async function savePostDraft(draft: PostDraft): Promise<void> {
  const s = store();
  const existing = await get<PostDraft>(`${POST_DRAFT_PREFIX}${draft.id}`, s);
  if (!existing) {
    const count = (await keys(s)).filter(
      (k) => typeof k === "string" && k.startsWith(POST_DRAFT_PREFIX),
    ).length;
    if (count >= POST_DRAFT_LIMIT)
      throw new Error(`下書きは ${POST_DRAFT_LIMIT} 件までです。いらないものを消してください`);
  }
  await set(`${POST_DRAFT_PREFIX}${draft.id}`, draft, s);
}

export async function deletePostDraft(id: string): Promise<void> {
  await del(`${POST_DRAFT_PREFIX}${id}`, store());
}

/** 下書きを作業中に読み込む。画像は複製し、元の下書きは触らない */
export async function openPostDraft(draft: PostDraft): Promise<void> {
  const { id, images, updatedAt: _updatedAt, ...fields } = draft;
  await setPendingExports(images);
  await savePostFormDraft({ ...fields, draftId: id, dirty: false, updatedAt: Date.now() });
}

/** 作業中を全部消す (投稿完了、すべて破棄、離脱) */
export async function clearWorkInProgress(): Promise<void> {
  await Promise.all([clearPendingExports(), clearPostFormDraft()]);
}
