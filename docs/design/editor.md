# 現像エディタ (画面・描画・推論・テスト)

> lumorphia/prismtone の docs/design/08-frontend.md (https://github.com/lumorphia/prismtone/blob/develop/docs/design/08-frontend.md) の §3 (編集画面) と §7 (テスト) を移植したもの (2026-10-06)。投稿画面への受け渡し (§4) と、prismtone だけのテスト (loader、OGP) は prismtone に残る。リンク、Issue 番号、ADR の番号は prismtone のもの。今後はこちらを正とする。

## 3. 編集画面 (`/edit`)

### 3.1 構成

```
+------------------------------------------------------------+
| ヘッダ: ファイルを開く | 比較 (スライダー: 左が元画像、右が現像後。ドラッグと矢印キーで境界を動かす。トリミング中は無効) | ← 戻る / 進む → (ツールチップに「露光量 +0.30 を取り消す (Ctrl+Z)」のように操作名を出し、横に「最後の操作: …」を表示) | 書き出し | 投稿へ |
+---------------------------------------+--------------------+
|                                       | プリセット (10)    |
|   PixiJS キャンバス                    | ------------------ |
|   (フィット表示、ピンチ/ホイールでズーム) | 基本補正 スライダ x8 |
|                                       | ------------------ |
|                                       | 部分補正: 一覧 (≤8)、|
|                                       |   円形を追加、瞳強調/ |
|                                       |   美肌/装備強調、効果量|
|                                       | ------------------ |
|                                       | 幾何: 回転/反転/     |
|                                       |   水平/アスペクト/  |
|                                       |   トリミング        |
|                                       | ------------------ |
|                                       | 全リセット          |
+---------------------------------------+--------------------+
```

スマートフォンでは右パネルを下部のタブ (プリセット / 補正 / 幾何) に切り替える。

現像は prismtone を知らない ([ADR-0035](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0035-extract-editor-to-lumorphia-editor.md))。`packages/editor-engine` (`@lumorphia/editor-engine`: 状態、描画、推論、下書き。React に依存しない) と `packages/editor-react` (`@lumorphia/editor-react`: UI) にあり、ESLint (`editorEngineHasNoHost` / `editorReactHasNoHost`) が prismtone への依存を禁じる。ホストが `EditorHost` (`packages/editor-react/src/host.ts`) で次を渡し、`<Editor host={...} />` で組み込む。UI のクラスは `app.css` の `@source` で Tailwind に走査させる (無いと `touch-none` などが抜ける。`e2e/editor-styles.spec.ts`)。prismtone の組み立ては `features/editor-host/prismtone-host.ts` と `routes/edit.tsx`。

- 表示言語 (`locale`)。文言はエディタの中の `useEditorI18n()` (`t(ja, en)`、語彙の英訳は `@lumorphia/editor-recipe/labels` の `translateLabel`)
- 下書きの置き場所 (`drafts`) と開く下書き (`initialDraftId`、prismtone は `?draft=`)
- 送り先 (`destinations`)。prismtone は「投稿へ」1 件 (§3.4)
- 計測 (`telemetry`)。prismtone は ADR-0034 の `open` / `save` / `to_post` に読み替える (送れたときだけ数える)
- モデルの置き場所 (`inference.modelBaseUrl`、既定は `/models/`)、保存ファイル名の接尾辞 (`-prismtone`)、E2E のフック (`__prismtoneEditor`)

### 3.2 画像の読み込み

1. `<input type="file" accept="image/png,image/jpeg">` またはドラッグ&ドロップ
2. 30MB 超は拒否。マジックバイトで形式を確認 (拡張子は信用しない)
3. `createImageBitmap(file, { imageOrientation: "from-image" })` でデコード。EXIF 方向をここで解決
4. 長辺 4096px 超は OffscreenCanvas で縮小 (WebGL テクスチャ上限とメモリのため)
5. `Texture` を作成し、原本 Blob と共に IndexedDB (`drafts` ストア, LRU 5 件) に保存

### 3.3 レンダリング

2 段構成 ([ADR-0021](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0021-two-stage-render-local-adjustments.md)、lumorphia/prismtone#109)。

- **合成の段** (`render/develop-stage.ts`): 無変換の `Sprite` (原本) に `[AdjustFilter, LocalAdjustFilter × 部分補正の数]` を付け、`filterArea` で領域を画像矩形に固定して、画像座標のままの `RenderTexture` に描く。レシピが変わったフレームだけ (`dirty`)。プレビューは長辺 2048 まで縮小
- **表示の段** (`render/editor-renderer.ts`): そのテクスチャの `Sprite` に幾何 (rotation / scale(-1,1)) を `Container` の transform で掛ける。トリミングは `mask` ではなく書き出し時の `frame` で切り出す。プレビュー中はクロップ枠と円形マスクの枠をオーバーレイ (DOM) で描く
- スライダー変更は uniform 更新と `dirty` だけ。再描画は Pixi の ticker で 1 フレームに 1 回
- ズームと移動は表示の段だけ (`render/viewport.ts`、純関数)。操作は `ui/use-canvas-gestures.ts` (ジェスチャの計算は `ui/gesture.ts`): ホイールでカーソルを軸にズーム (トラックパッドのピンチも同じ)、ドラッグで移動 (ブラシ・ハンドル・トリミング枠の上では起きない。中ボタンと Space + ドラッグはどこでも移動)、2 本指はピンチでズームしそのまま動かして移動。ブラシで描いている途中に 2 本目が触れたらピンチに切り替え、描きかけは捨てる (`pointercancel`)。ホストは `touch-action: none`。フィットの 0.5〜8 倍、小さい画像は等倍まで縮小可、ツールバーの −/+/倍率 (押すと等倍)/フィット。オーバーレイは `viewRect` から位置を出すので追従する。canvas は絶対配置にし、`section` に `min-w-0` を付けて、窓を狭めたときに右パネルが押し出されないようにする
- 「比較」は表示の段で、元画像の `Sprite` を下に置き、現像後を境界より右だけ `mask` で見せる
- ブラシマスクは `brush-raster.ts` (純関数) でストロークを長辺 1024 のラスタに描き、`render/mask-texture.ts` が canvas 経由でテクスチャにする。確定 (commit) ではゼロから描き直し、描画中は `previewStroke` で線分ごとに足す。`BrushOverlay` はポインタの点列を画像座標にして間引き (長辺の 0.5% 未満は捨てる、最大 512 点)、離したときに 1 ストローク = 1 手で積む
- 部分補正のマスクは幾何を掛ける前の画像の正規化座標。頂点シェーダの `aPosition` がそのまま画像座標になる (領域 = 画像矩形) ので、回転・反転・トリミングでずれない。画面との往復は `mask-math.ts` (`imageUvToCanvas` / `canvasToImageUv`)。選択中の範囲は `uShowMask` で赤く重ねる (ブラシで塗っている・円形をドラッグしている間だけ。常時は「範囲を表示」で。常時だと補正の効きが赤に埋もれて見えない)
- 色補正の GLSL は `render/adjust-glsl.ts` に 1 つ。全体と部分の両方が埋め込み、`adjust-math.ts` / `mask-math.ts` の CPU 参照と同じ式

### 3.4 書き出し

1. 合成の段を原寸 (4096 と `MAX_TEXTURE_SIZE` の小さい方) で描き直し、`renderer.extract.canvas(container, { frame: cropRect, resolution })` で切り出す。終わったらプレビュー寸法に戻し `TexturePool.clear(true)`
2. `toBlob("image/webp", 0.92)`。非対応なら `image/jpeg`, 0.92
3. 「端末に保存」は `<a download>`。送り先のボタン (prismtone は「投稿へ」) は書き出した Blob、レシピ、原本を送り先の `send` に渡す。prismtone の「投稿へ」は Blob とレシピを IndexedDB の `pending` に置いて `/edit/post` へ遷移する
4. 書き出し中は進捗を表示 (大きな画像で 1 秒以上かかる)

### 3.5 状態

```ts
type EditorState = {
  source: { bitmap: ImageBitmap; blob: Blob; name: string } | null;
  history: { past: EditRecipeV1[]; present: EditRecipeV1; future: EditRecipeV1[] };
  ui: {
    comparing: boolean;
    tool: "presets" | "adjust" | "local" | "geometry";
    local: { selectedId: string | null; showMask: boolean };
  };
};
```

部分補正 (`local/*` アクション) も同じ履歴に積む。追加・削除・表示切替・プリセットは 1 手、スライダーとマスクのドラッグは preview / commit の同じ規則。`ui.local.selectedId` は undo で消えることがあるので、reducer が履歴の操作後に引き直す。

`history` の操作は `packages/editor-engine/src/history.ts` に純粋関数として置き、単体テストする。

### 3.6 自動選択 (ブラウザ内の認識、lumorphia/prismtone#176 / ADR-0025)

「瞳強調」「美肌」を押すと顔を認識してマスクを自動で置く。置いたあとは今の道具 (ハンドル、ブラシ) で直す。

- **推論は Web Worker** (`packages/editor-engine/src/inference/face.worker.ts`)。MediaPipe Face Landmarker (WASM、CPU)。classic worker にする (MediaPipe の WASM ローダーが `importScripts` を使うので module worker では動かない)。ライブラリは押したときに動的 import (`inference/face.ts`) し、現像の初期表示に載せない
- **検出はピラミッド**: 画像全体 → 2 倍の 3×3 の重なる切り抜き。同じ顔 (IoU 0.3) は先に見つかった方を残し、切り抜きの縁にかかる顔は捨てる。しきい値 0.3。根拠は [spike](https://github.com/lumorphia/prismtone/blob/develop/docs/spikes/2026-09-21-auto-select.md)
- **結果からマスクへ** (`inference/face-masks.ts`、純関数): 瞳は虹彩の中心と半径 (×1.3) の円形 ×2、美肌は顔の輪郭 (36 点) を外周、両目と唇を穴にした `polygon`。目を閉じている (`eyeBlink` ≥ 0.5) 目には置かない。複数の顔は一番大きい顔 (人物の選択は lumorphia/prismtone#175)
- **計画** (`inference/auto-select.ts`、純関数): 何を足すか (`local/add-auto` で 1 手) と一言 (`ui/notice`)。失敗の文言は理由を断定しない: 「自動選択できませんでした。手動で範囲を指定できます」
- **モデルの配布**: `pnpm models` (`@lumorphia/editor-engine` の CLI `editor-models fetch --out models`、一覧は `packages/editor-engine/bin/assets.ts`) が sha256 固定で `apps/app/models/face-landmarker-v1/` に置き (git には入れない、`dev` / `build` の前に走る)、Fastify の static (`server/plugins/models.ts`) が `/models/` で配る。Vite の `public/` には置かない (dev の Vite が `import()` に `?import` を足して WASM ローダーを読めなくする)。モデル本体は Worker が fetch して進捗を出し、`modelAssetBuffer` で渡す
- **CSP**: `script-src 'self' 'wasm-unsafe-eval'` と `worker-src 'self'` のまま。`csp.spec.ts` が顔の画像で瞳が置かれることを見る
- 画像も推論結果も外に送らない。`editor.spec.ts` が自分のオリジン以外へのリクエストが無いことを見る

### 3.7 タップで切る (SlimSAM、lumorphia/prismtone#177 / ADR-0025)

「装備強調」を何も選ばずに押すと、画像の埋め込みを済ませてからタップ待ちになり、タップした装備を切り抜いて `bitmap` マスクで置く。「キャラクター」「背景」はプリセット無しで人物全体 (背景はその反転) を置く。

- **推論は module worker** (`inference/segment.worker.ts`)。transformers.js の `SamModel` + `Xenova/slimsam-77-uniform` (q8) を onnxruntime-web (WASM) で。`env.allowRemoteModels = false`、`localModelPath = "/models/"`、ORT の WASM は `/models/ort-v1/`。HF Hub には行かない
- **埋め込みは画像 1 枚につき 1 回** (`prepareSegmenter`、同じ bitmap なら使い回す)。タップごとに `segmentAt` で 3 段のマスクを bitmap (長辺 256、RLE) にして返す
- **3 段の粒度** (`SAM_LEVELS`): 0 = キャラクター全体、1 = その装備 1 点、2 = 部品。装備強調の既定は 1 (IoU スコアで選ぶと全体に寄る)。パネルの「切り抜きの範囲」で差し替えられる (下地だけ替え、反転と塗り足したストロークは保つ)
- **時間** (この機、headless): 押してからタップ待ちまで 3.4〜3.9 秒 (WASM 初期化 + モデル + 埋め込み)、タップ 0.3 秒。`/edit` の文書と `/assets/` `/models/` の応答に `Cross-Origin-Embedder-Policy: credentialless` を付け (COOP は helmet の `same-origin`)、cross-origin isolated にして SharedArrayBuffer を使えるようにした (lumorphia/prismtone#182。付ける前はシングルスレッドで約 10 秒)。専用 worker のスクリプトの応答にも COEP が要るので、文書だけでなくアセットにも付けている。`credentialless` なので CORP の無い他オリジンの画像 (`/edit/post` に client-side で進んだあとの XIVAPI のアイコン、R2 の画像) も匿名で読める。`/edit` 以外の文書には付けない。WebGPU は未計測 (実機で測ってから)
- **タップ待ち** (`ui.local.tap`): `TapOverlay` がキャンバス全体でクリックを 1 回受け、画像の正規化座標にする。Esc と「やめる」で抜ける

### 3.8 人物補正 (lumorphia/prismtone#175)

「人物補正」タブ: 人物を認識する → (複数なら) 番号で選ぶ → プリセット → 効果量。中身は部分補正 5 件 (背景・人物・顔・瞳 ×2、`groupId` で束ねる) で、部分補正タブで個別に直せる。

- 検出は 3.6 の顔検出、人物のマスクは 3.7 の SAM (顔の外接矩形の中心をタップ、index 0 = 全体) の組み合わせ。`inference/portrait.ts` の `buildPortraitItems` が 5 件を組む (閉じている目は置かない)
- 状態は `ui.portrait` (検出した顔、選んだ人物、グループ、プリセット)。グループがレシピに残っているかは `activePortraitGroup` で見る (undo で消え redo で戻るので、ui の id は消さない)。プリセットの切り替えは 1 手、効果量はドラッグの規則 (preview / commit)
- 複数の顔は `FaceBoxesOverlay` が番号付きの枠を重ね、枠かパネルの番号で選ぶ
- 失敗 (顔が無い、切り抜けない) は「自動選択できませんでした。手動で範囲を指定できます」+ 部分補正タブへの導線。上限 12 件に 5 件が入り切らないときも置かずに伝える
- 性能: 部分補正はパスに比例する。12 件で 8 件の 1.5 倍 (SwiftShader の計測は [spike](https://github.com/lumorphia/prismtone/blob/develop/docs/spikes/2026-09-20-local-adjust-perf.md))。人物補正 2 人 (10 件) が実用の上限

## 7. テスト

- `history.ts`, レシピ zod (`packages/shared`), プリセット適用: Vitest
- シェーダ: `adjust-math.ts` に CPU 参照実装を置き、GLSL はそれを写す。Playwright (headless Chromium + SwiftShader) で 4 色のテスト画像を書き出し、全プリセットについて GPU 出力と CPU 参照が ±3/255 に収まることを検証する。露光 +1 EV で線形輝度 2 倍、彩度 -100 で R=G=B も確認
- 画面: Playwright で「画像を開く → プリセット適用 → undo/redo/リセット → 端末に保存 (download イベント)」と、不正ファイルの拒否メッセージを E2E。E2E 用に `window.__PRISMTONE_E2E__` が立っているときだけ `window.__prismtoneEditor.exportPixels()` を露出する (名前はホストの `testHook` で渡す)
