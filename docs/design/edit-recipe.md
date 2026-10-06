# 04. 編集レシピ

> lumorphia/prismtone の docs/design/04-edit-recipe.md (https://github.com/lumorphia/prismtone/blob/develop/docs/design/04-edit-recipe.md) を移植したもの (2026-10-06)。リンク、Issue 番号、ADR の番号は prismtone のもの。今後はこちらを正とする。

関連 ADR: [ADR-0009](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0009-versioned-edit-recipe.md), [ADR-0005](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0005-client-side-editing-and-export.md)

編集レシピは「原本に対する調整値の集合」であり、非破壊編集の唯一の状態。調整の範囲は色調整 (範囲を選んだ部分補正を含む)、シャープ・輪郭を残す軽い平滑化、幾何 (回転・トリミング) に限る。人物切り抜き、背景差し替え、生成 AI による加工は著作物利用許諾条件の「過度な加工・改変」に当たる恐れがあるため、将来も追加しない ([spike](https://github.com/lumorphia/prismtone/blob/develop/docs/spikes/2026-09-13-terms-and-licensing.md))。ブラウザの編集画面、IndexedDB の一時保持、投稿詳細での表示、プリセット定義のすべてが同じスキーマを使う。定義は `packages/editor-recipe/` (`@lumorphia/editor-recipe`、ADR-0035) に zod で置き、ブラウザとサーバーで共有する。

## 1. スキーマ v1

```ts
type EditRecipeV1 = {
  version: 1;
  presetId: string | null; // 適用したプリセット。値は下記に展開済み
  adjust: {
    exposure: number; // -5.0 .. +5.0 (EV)
    contrast: number; // -100 .. +100
    highlights: number; // -100 .. +100
    shadows: number; // -100 .. +100
    temperature: number; // -100 .. +100 (負: 寒色, 正: 暖色)
    tint: number; // -100 .. +100 (負: 緑, 正: マゼンタ)
    vibrance: number; // -100 .. +100 (自然な彩度)
    saturation: number; // -100 .. +100
  };
  geometry: {
    rotation: 0 | 90 | 180 | 270; // 直角回転
    straighten: number; // -45 .. +45 (度, 微調整)
    flipH: boolean;
    crop: {
      // 回転・水平補正後の座標系、0..1 の正規化座標
      x: number;
      y: number;
      w: number;
      h: number;
    } | null;
    aspect: string | null; // "free" | "1:1" | "4:3" | "16:9" | "3:2" | "9:16" | ...
  };
};
```

既定値: `adjust` は全て 0、`geometry` は `rotation: 0, straighten: 0, flipH: false, crop: null, aspect: null`。

### 1.1 v2: 部分補正 (lumorphia/prismtone#109)

v1 に `localAdjustments` を足したもの。v1 の項目は触らない。

```ts
type EditRecipeV2 = Omit<EditRecipeV1, "version"> & {
  version: 2;
  localAdjustments: LocalAdjustmentV2[]; // 最大 8
};

type LocalAdjustmentV2 = {
  id: string; // 編集画面内の識別子 (max 32)
  name: string | null; // 利用者が付ける名前 (max 32)
  presetId: "eyes" | "skin" | "gear" | null; // 瞳強調 / 美肌 / 装備強調。表示用
  mask: EllipseMaskV2 | BrushMaskV2;
  adjust: {
    // 全体の補正から vibrance を外し、sharpen / smooth を足す
    exposure;
    contrast;
    highlights;
    shadows;
    temperature;
    tint;
    saturation;
    sharpen: number; // 0 .. 100 (アンシャープ 3x3)
    smooth: number; // 0 .. 60 (輪郭を残す平滑化。美肌。過度なぼかしを避ける上限)
  };
  amount: number; // 効果量 0 .. 100
  visible: boolean;
};

type EllipseMaskV2 = {
  kind: "ellipse";
  cx: number;
  cy: number; // 中心 0..1
  rx: number;
  ry: number; // 半径。rx は画像の幅、ry は高さに対する比 (0 < r <= 1)
  rotation: number; // -180 .. 180 (度)
  feather: number; // 半径に対するぼかし幅の比 0..1
  invert: boolean;
};

type BrushMaskV2 = {
  kind: "brush";
  strokes: {
    // 最大 64
    mode: "add" | "erase";
    size: number; // ブラシ径。画像の長辺に対する比 0.005 .. 0.5
    hardness: number; // 0..1
    points: { x: number; y: number }[]; // 0..1、1 ストローク最大 512 点 (描画中に間引く)
  }[];
  feather: number;
  invert: boolean;
};
```

- **マスクの座標系は幾何を掛ける前の画像** (4096px に収めたあとのビットマップ) の正規化座標。回転・水平補正・反転・トリミングは部分補正を合成したあとに掛かるので、幾何を変えてもマスクの位置はずれない。`GeometryV1.crop` が「回転後の座標系」なのと違う点に注意
- 上限 (8 個、64 ストローク、512 点) はレシピの肥大化 (jsonb) と描画パス数を抑えるため。根拠の計測は PR3 の spike に残す
- 部分補正のプリセットは `packages/editor-recipe/src/local-presets.ts`。適用は選択中の部分補正の `adjust` と `amount` を上書きし、マスクには触れない

### 1.2 値域と正規化

- zod で値域を検証し、範囲外は clamp ではなく拒否する (不正なレシピを保存しない)
- 数値は小数第 2 位で丸めて保存する。プレビュー中は丸めない
- `presetId` は表示用。レシピの適用結果は `adjust` の値で完全に決まり、プリセット定義が後から変わっても投稿済みレシピの見え方は変わらない

### 1.3 v3: 自動選択のマスクと人物補正のまとまり (lumorphia/prismtone#175 / lumorphia/prismtone#176 / lumorphia/prismtone#177)

v2 に多角形とビットマップのマスク、部分補正の `groupId` を足したもの。v2 の項目は触らない。上限は 12 件 (人物補正が 1 人で 5 件使う)。

```ts
type EditRecipeV3 = Omit<EditRecipeV2, "version" | "localAdjustments"> & {
  version: 3;
  localAdjustments: LocalAdjustmentV3[]; // 最大 12
};

type LocalAdjustmentV3 = Omit<LocalAdjustmentV2, "mask"> & {
  mask: EllipseMaskV2 | BrushMaskV2 | PolygonMaskV3 | BitmapMaskV3;
  groupId: string | null; // 人物補正 (lumorphia/prismtone#175) など、まとめて扱う部分補正の組 (max 32)
};

type PolygonMaskV3 = {
  // 顔の輪郭 (lumorphia/prismtone#176)
  kind: "polygon";
  rings: { x: number; y: number }[][]; // 先頭が外周、以降は穴 (偶奇で塗る)。最大 8 本、1 本 3..256 点
  strokes: BrushStrokeV2[]; // 自動で置いたあとブラシで足す / 消す (最大 64)
  feather: number; // 0..1。長辺の 5% までのぼかし
  invert: boolean;
};

type BitmapMaskV3 = {
  // SAM の切り抜き (lumorphia/prismtone#177)
  kind: "bitmap";
  width: number;
  height: number; // 1..256
  rle: string; // width × height の 0/1 を rle.ts (LEB128 + base64url) で圧縮。max 64 KB
  strokes: BrushStrokeV2[];
  feather: number;
  invert: boolean;
};
```

- 顔の輪郭 (36 点) や SAM の切り抜きをブラシ点列 (最大 512 点 × 64 本) に崩さず持つため。多角形は穴で目・口を抜けるので、美肌がまつ毛や唇を潰さない
- どのマスクも **ラスタライズは CPU 側** (`packages/editor-engine/src/brush-raster.ts` の `rasterizeMask`、長辺 1024) で、GPU は同じテクスチャの読み取りだけ (`uMaskMode = 1`)。`invert` もラスタ側で済ませる (シェーダは楕円だけ反転する)。CPU の参照実装 (`maskValue`) と GPU の出力を E2E で照合する
- ビットマップは長辺 256。GPU が線形補間で拡大するので境界は滑らか。`feather` は縦横 2 回の箱ぼかし

### 1.4 v4: 人物補正の空間効果 (lumorphia/prismtone#184)

v3 の部分補正に次の4項目を追加する。既存項目とマスクの意味は変えず、v1〜v3を読むときは全項目を中立値 `0` で補う。

```ts
type EditRecipeV4 = Omit<EditRecipeV3, "version" | "localAdjustments"> & {
  version: 4;
  localAdjustments: LocalAdjustmentV4[];
};

type LocalAdjustmentV4 = Omit<LocalAdjustmentV3, "adjust"> & {
  adjust: LocalAdjustmentV3["adjust"] & {
    blur: number; // 0..32、元画像 px の半径
    bloom: number; // 0..100、高輝度成分をぼかして加算
    vignette: number; // 0..100、画像中心から周辺を減光
    clarity: number; // -100..100、近傍平均との差による局所コントラスト
  };
};
```

- `blur` はプレビュー解像度ではなく元画像のpxで半径を決めるため、プレビューと書き出しで広がりが変わらない
- `blur` / `bloom` / `clarity` は共有の3×3近傍を使う。半径は `max(blur, bloomなら8px, clarityなら4px)`。同じ部分補正に複数を入れても近傍読み取りを1回に抑える
- `bloom` は0.65を超える高輝度成分を加算する。`vignette` は画像全体の中心を基準にするが、ほかの部分補正と同じくマスクと効果量で合成する
- GLSLとCPU参照実装を `e2e/editor.spec.ts` で4項目ごとに照合し、4K + 12件は `e2e/perf-local-adjust.spec.ts` で計測する

## 2. プリセット

プリセットは `Partial<EditRecipeV1["adjust"]>` として `packages/editor-recipe/src/presets.ts` に定義する。適用は「現在の adjust にプリセット値を上書き」であり、幾何情報 (crop 等) には触れない。

初期プリセット案 (10 種、値は実装時に実画像で調整):

| id              | 名称       | 狙い                                             |
| --------------- | ---------- | ------------------------------------------------ |
| `night-city`    | 夜景       | 露光を少し下げ、シャドウを持ち上げ、寒色寄りに   |
| `warm-sunset`   | 夕暮れ     | 暖色、ハイライト抑制、彩度控えめ                 |
| `cool-morning`  | 朝霧       | 寒色、コントラスト低め、シャドウ持ち上げ         |
| `pastel`        | パステル   | コントラスト低、自然な彩度 +、ハイライト持ち上げ |
| `vivid`         | ビビッド   | 自然な彩度 +、コントラスト +                     |
| `film`          | フィルム風 | シャドウ持ち上げ、ハイライト抑制、彩度 -         |
| `mono`          | モノクロ   | 彩度 -100、コントラスト +                        |
| `soft-portrait` | ソフト     | コントラスト -、ハイライト -、自然な彩度 +       |
| `dungeon`       | ダンジョン | 露光 +、シャドウ +、寒色                         |
| `gold-hour`     | ゴールド   | 暖色 +、露光 +、ハイライト -                     |

### 2.1 部分補正のプリセット (lumorphia/prismtone#109)

`packages/editor-recipe/src/local-presets.ts`。選択中の部分補正の `adjust` と `amount` を上書きし、マスクには触れない。手でスライダーを動かしたら `presetId` は外す (全体と同じ)。

| id     | 名称     | 狙い                                   | 値 (初期案)                                                                |
| ------ | -------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `eyes` | 瞳強調   | 円形マスクを左右の目に置く             | 露光 +0.3、彩度 +15、コントラスト +10、シャープ 30                         |
| `skin` | 美肌     | 顔にマスクを置き、輪郭を残して滑らかに | 平滑化 40、露光 +0.15、色温度 +5                                           |
| `gear` | 装備強調 | 見せたい装備をブラシで塗る             | 露光 +0.15、シャドウ +45、コントラスト +15、シャープ 30、彩度 +8、質感 +25 |

シャープは 3×3 のアンシャープ、平滑化は 5×5 の輝度差で重み付けした平均 (輪郭を残す)。近傍の間隔は元画像の px で決めるので、プレビュー (縮小) と書き出し (原寸) で同じ広がりになる。ブラシの `feather` は硬さを下げる方向に効く。

### 2.2 人物補正のプリセット (lumorphia/prismtone#175)

`packages/editor-recipe/src/portrait-presets.ts`。1 人ぶんの「背景・人物・顔・瞳」の 4 役に対する部分補正の値 (`Partial<LocalAdjust>`) と役ごとの効果量。ナチュラル / 明るく / ドラマチック / やわらか / 瞳くっきり の 5 つ。背景にはぼかしと周辺減光、人物には質感、顔と瞳には発光をプリセットごとの強さで組み込む。

- 適用は部分補正 5 件 (背景 → 人物 → 顔 → 瞳 ×2、後の方が上に掛かる) を `groupId` で束ねて 1 手で足す。役はレシピに持たず、マスクの形から決める (`portraitRole`: 反転したビットマップ = 背景、ビットマップ = 人物、多角形 = 顔、楕円 = 瞳)
- グループの効果量 (0..100) は役ごとの効果量 × effect / 100 で各部分補正の `amount` に写す (`scalePortraitAmount`)。読み戻しは `portraitAmount`
- プリセットの切り替えは `applyPortraitPreset` でグループの `adjust` と `amount` を差し替える (マスクは触らない)。個別の値は部分補正タブでそのまま直せる
- 上限 12 件のうち 1 人で 5 件。2 人までは置ける。入り切らなければ置かずに伝える

## 3. undo / redo

編集画面の状態は `{ past: EditRecipeV1[], present: EditRecipeV1, future: EditRecipeV1[] }`。レシピは不変オブジェクトとして扱い、変更のたびに新しいオブジェクトを `present` に置く。

- スライダーのドラッグ中は `present` だけを更新し、ドラッグ終了 (`pointerup`) で `past` に積む (履歴が 1 ピクセルごとに増えるのを防ぐ)
- 「全リセット」は既定値を `present` にする 1 手として履歴に積む
- 履歴上限 100

## 4. シェーダとの対応

PixiJS の `Filter` に adjust を uniform として渡す。全体の補正が 1 パス、部分補正は 1 件 1 パスで、無変換の画像に順に掛けてから幾何を掛ける ([ADR-0021](https://github.com/lumorphia/prismtone/blob/develop/docs/adr/0021-two-stage-render-local-adjustments.md))。色の順序は Lightroom 系に倣う。部分補正は同じ式 (vibrance 無し) の結果を `mix(元, 補正後, マスク × 効果量)` で混ぜる。

```
入力 (sRGB)
  -> linear 化
  -> exposure       : rgb *= 2^exposure
  -> temperature/tint : 白色点の簡易シフト (rgb 各チャンネルへのゲイン)
  -> highlights/shadows : 輝度に基づく重み付きの持ち上げ・抑制
  -> contrast       : 中間灰 (0.18) を軸にした S カーブ
  -> vibrance       : 彩度が低い画素ほど強く彩度を上げる
  -> saturation     : HSL の S を線形スケール
  -> sRGB 化
```

幾何 (回転・水平補正・反転・トリミング) はシェーダではなく `Sprite` の transform と `RenderTexture` の切り出しで行う。

## 5. バージョニング

- `version` を必須にし、読み込み時に `migrateRecipe(input: unknown): EditRecipe` を通す。未知の version は拒否。各版は strict に検証し、版に無い項目が混ざっていれば拒む
- v1 → v2 は `migrateV1toV2` (`localAdjustments: []` で埋める)、v2 → v3 は `migrateV2toV3` (`groupId: null`)、v3 → v4 は `migrateV3toV4` (4効果を中立値 `0`)。読む側は **必ず** `migrateRecipe` を通す: `@lumorphia/editor-recipe` の `upgradeStoredRecipe` (読めないものは null) を、端末の下書き (`@lumorphia/editor-engine` の `createDraftStore`)、pending と投稿下書き (`features/post-form/work-in-progress.ts`) から呼ぶ、投稿詳細 (`routes/post-detail.tsx`)
- API の入出力は `editRecipeInputSchema` (v1 | v2 | v3 | v4 の union)。旧版の投稿は保存したままの版で返り、旧版のクライアントからの投稿も受ける。`edit_recipes.version` にはその版が入る
- **後方非互換な変更 (既存項目の意味や値域の変更) は行わない**。必要なら新しい項目を追加し、旧項目は deprecated として残す
- サーバーは保存時に `version` と zod 検証のみ行い、レシピの意味を解釈しない

## 6. 保存先

| 場所                          | 形式               | 目的                                         |
| ----------------------------- | ------------------ | -------------------------------------------- |
| ブラウザ IndexedDB            | 原本 Blob + レシピ | 端末内での再編集 (最大 5 件, LRU)            |
| `edit_recipes.recipe` (jsonb) | レシピのみ         | 投稿詳細での表示、将来のレシピ共有 (Phase 2) |
| URL クエリ (将来)             | base64url 圧縮     | レシピ共有リンク                             |
