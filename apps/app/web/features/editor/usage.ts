import type { EditorEvent } from "@prismtone/shared/constants";

/**
 * 編集画面の使われ方を 1 件送る (#344、ADR-0034)。サーバーは 1 時間ごとの件数だけを数え、誰かは残さない。
 * 「投稿へ」の直後はページを移るので keepalive で送る。届かなくても画面には何も出さない
 */
export function sendEditorEvent(event: EditorEvent, fetchImpl: typeof fetch = fetch): void {
  void fetchImpl("/api/editor/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => undefined);
}
