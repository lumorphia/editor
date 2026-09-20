import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_BRUSH_MASK,
  DEFAULT_ELLIPSE_MASK,
  DEFAULT_LOCAL_ADJUST,
  DEFAULT_LOCAL_ADJUSTMENT,
  DEFAULT_RECIPE,
  applyPreset,
  findPreset,
  type EditRecipe,
} from "@prismtone/shared/recipe";
import { applyAdjust, applyRecipeAt } from "../apps/app/web/features/editor/adjust-math.ts";
import { login } from "./helpers.ts";

// 4 色のブロックからなるテスト画像 (200x100)。左から赤・緑・青・灰
const BLOCKS: [number, number, number][] = [
  [200, 40, 60],
  [40, 180, 80],
  [50, 90, 220],
  [128, 128, 128],
];

async function makePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate((blocks) => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 100;
    const ctx = c.getContext("2d")!;
    blocks.forEach(([r, g, b], i) => {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(i * 50, 0, 50, 100);
    });
    return c.toDataURL("image/png");
  }, BLOCKS);
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

async function openEditorWithImage(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __PRISMTONE_E2E__?: boolean }).__PRISMTONE_E2E__ = true;
  });
  await page.goto("/edit");
  await expect(page.getByRole("button", { name: "画像を開く" })).toBeVisible();
  const png = await makePng(page);
  await page
    .getByTestId("file-input")
    .setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "端末に保存" })).toBeEnabled();
  await page.waitForFunction(() =>
    Boolean((window as Window & { __prismtoneEditor?: unknown }).__prismtoneEditor),
  );
}

type Pixels = { width: number; height: number; type: string; pixels: number[][] };

async function exportPixels(
  page: Page,
  recipe: EditRecipe,
  points: { x: number; y: number }[],
): Promise<Pixels> {
  return page.evaluate(
    ({ recipe, points }) =>
      (
        window as Window & {
          __prismtoneEditor?: {
            exportPixels: (r: EditRecipe, p: { x: number; y: number }[]) => Promise<Pixels>;
          };
        }
      ).__prismtoneEditor!.exportPixels(recipe, points),
    { recipe, points },
  );
}

const CENTERS = BLOCKS.map((_, i) => ({ x: i * 50 + 25, y: 50 }));

function expectClose(actual: number[], expected: number[], tolerance: number) {
  actual.forEach((v, i) =>
    expect(
      Math.abs(v - expected[i]!),
      `channel ${i}: ${actual} vs ${expected}`,
    ).toBeLessThanOrEqual(tolerance),
  );
}

test.describe("editor", () => {
  test("default recipe exports the source pixels unchanged", async ({ page }) => {
    await openEditorWithImage(page);
    const out = await exportPixels(page, DEFAULT_RECIPE, CENTERS);
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);
    out.pixels.forEach((px, i) => expectClose(px, BLOCKS[i]!, 2));
  });

  test("GPU output matches the CPU reference for every preset", async ({ page }) => {
    await openEditorWithImage(page);
    const { PRESETS } = await import("@prismtone/shared/recipe");
    for (const preset of PRESETS) {
      const recipe = applyPreset(DEFAULT_RECIPE, preset);
      const out = await exportPixels(page, recipe, CENTERS);
      out.pixels.forEach((px, i) => {
        const src = BLOCKS[i]!.map((v) => v / 255) as [number, number, number];
        const expected = applyAdjust(src, recipe.adjust).map((v) => Math.round(v * 255));
        expectClose(px, expected, 3);
      });
    }
  });

  test("saturation -100 yields neutral gray, exposure +1 doubles linear light", async ({
    page,
  }) => {
    await openEditorWithImage(page);
    const mono = applyPreset(DEFAULT_RECIPE, findPreset("mono")!);
    const gray = await exportPixels(
      page,
      { ...mono, adjust: { ...mono.adjust, contrast: 0 } },
      CENTERS,
    );
    for (const [r, g, b] of gray.pixels) {
      expect(Math.abs(r! - g!)).toBeLessThanOrEqual(2);
      expect(Math.abs(g! - b!)).toBeLessThanOrEqual(2);
    }
    const bright = await exportPixels(
      page,
      { ...DEFAULT_RECIPE, adjust: { ...DEFAULT_RECIPE.adjust, exposure: 1 } },
      [CENTERS[3]!],
    );
    // 128/255 -> linear 0.2158 -> x2 = 0.4317 -> sRGB 0.6906 -> 176
    expectClose(bright.pixels[0]!, [176, 176, 176], 3);
  });

  test("geometry: rotation and crop change the output size", async ({ page }) => {
    await openEditorWithImage(page);
    const rotated: EditRecipe = {
      ...DEFAULT_RECIPE,
      geometry: { ...DEFAULT_RECIPE.geometry, rotation: 90 },
    };
    const r = await exportPixels(page, rotated, [{ x: 50, y: 25 }]);
    expect(r.width).toBe(100);
    expect(r.height).toBe(200);
    // 右回転後: 元の左端 (赤) は上端に来る
    expectClose(r.pixels[0]!, BLOCKS[0]!, 2);

    const cropped: EditRecipe = {
      ...DEFAULT_RECIPE,
      geometry: { ...DEFAULT_RECIPE.geometry, crop: { x: 0.5, y: 0, w: 0.5, h: 1 } },
    };
    const c = await exportPixels(page, cropped, [
      { x: 25, y: 50 },
      { x: 75, y: 50 },
    ]);
    expect(c.width).toBe(100);
    expectClose(c.pixels[0]!, BLOCKS[2]!, 2);
    expectClose(c.pixels[1]!, BLOCKS[3]!, 2);
  });

  test("a local adjustment applies inside its ellipse mask only, and follows rotation and crop (#109)", async ({
    page,
  }) => {
    await openEditorWithImage(page);
    const size = { width: 200, height: 100 };
    // 赤ブロックの中心に半径 20px の円。ぼかし無し
    const eye = {
      ...DEFAULT_LOCAL_ADJUSTMENT,
      id: "eye",
      mask: { ...DEFAULT_ELLIPSE_MASK, cx: 0.125, cy: 0.5, rx: 0.1, ry: 0.2, feather: 0 },
      adjust: { ...DEFAULT_LOCAL_ADJUST, exposure: 1, saturation: -50 },
      amount: 100,
    };
    const recipe: EditRecipe = {
      ...DEFAULT_RECIPE,
      adjust: { ...DEFAULT_RECIPE.adjust, contrast: 20 },
      localAdjustments: [eye],
    };
    const cpu = (rgb: [number, number, number], uv: { x: number; y: number }) =>
      applyRecipeAt(rgb.map((v) => v / 255) as [number, number, number], uv, recipe, size).map(
        (v) => Math.round(v * 255),
      );

    const out = await exportPixels(page, recipe, [
      { x: 25, y: 50 }, // マスクの中心
      { x: 75, y: 50 }, // 緑 (マスク外)
      { x: 25, y: 5 }, // 赤だがマスクの外 (縦半径 20px)
    ]);
    expectClose(out.pixels[0]!, cpu(BLOCKS[0]!, { x: 0.125, y: 0.5 }), 3);
    expectClose(out.pixels[1]!, cpu(BLOCKS[1]!, { x: 0.375, y: 0.5 }), 3);
    expectClose(out.pixels[2]!, cpu(BLOCKS[0]!, { x: 0.125, y: 0.05 }), 3);
    // マスク内は外と違う (補正が効いている)
    expect(out.pixels[0]).not.toEqual(out.pixels[2]);

    // 90 度回転 + 左半分をトリミングしても、同じ画素が同じ値になる。
    // 回転後 (100x200) で赤ブロックは上端 0..50、マスクの中心は (50, 25)。crop は上半分
    const rotated: EditRecipe = {
      ...recipe,
      geometry: { ...recipe.geometry, rotation: 90, crop: { x: 0, y: 0, w: 1, h: 0.5 } },
    };
    const r = await exportPixels(page, rotated, [
      { x: 50, y: 25 },
      { x: 95, y: 25 },
    ]);
    expect(r.width).toBe(100);
    expect(r.height).toBe(100);
    expectClose(r.pixels[0]!, out.pixels[0]!, 3);
    expectClose(r.pixels[1]!, out.pixels[2]!, 3);

    // 非表示なら掛からない
    const hidden: EditRecipe = { ...recipe, localAdjustments: [{ ...eye, visible: false }] };
    const h = await exportPixels(page, hidden, [{ x: 25, y: 50 }]);
    expectClose(
      h.pixels[0]!,
      cpu(BLOCKS[0]!, { x: 0.375, y: 0.5 }).map((_, i) =>
        Math.round(
          applyAdjust(BLOCKS[0]!.map((v) => v / 255) as [number, number, number], recipe.adjust)[
            i
          ]! * 255,
        ),
      ),
      3,
    );
  });

  test("a brush mask applies along its strokes, erase takes it back, and smoothing leaves flat areas alone (#109)", async ({
    page,
  }) => {
    await openEditorWithImage(page);
    const size = { width: 200, height: 100 };
    const stroke = (x: number, mode: "add" | "erase" = "add") => ({
      mode,
      size: 0.15, // 直径 30px、半径 15px
      hardness: 1,
      points: [{ x, y: 0.5 }],
    });
    // 緑と青のブロックの中心を塗り、青の方を消す。露光 +1 と美肌 (平滑化) を掛ける
    const gear = {
      ...DEFAULT_LOCAL_ADJUSTMENT,
      id: "gear",
      mask: {
        ...DEFAULT_BRUSH_MASK,
        strokes: [stroke(0.375), stroke(0.625), stroke(0.625, "erase")],
      },
      adjust: { ...DEFAULT_LOCAL_ADJUST, exposure: 1, smooth: 60, sharpen: 40 },
      amount: 100,
    };
    const recipe: EditRecipe = { ...DEFAULT_RECIPE, localAdjustments: [gear] };
    const cpu = (rgb: [number, number, number], uv: { x: number; y: number }) =>
      applyRecipeAt(rgb.map((v) => v / 255) as [number, number, number], uv, recipe, size).map(
        (v) => Math.round(v * 255),
      );
    const out = await exportPixels(page, recipe, [
      { x: 75, y: 50 }, // 緑の中心 (塗った)
      { x: 125, y: 50 }, // 青の中心 (塗って消した)
      { x: 25, y: 50 }, // 赤 (塗っていない)
    ]);
    // 平坦部なので平滑化・シャープは値を変えず、露光だけが効く
    expectClose(out.pixels[0]!, cpu(BLOCKS[1]!, { x: 0.375, y: 0.5 }), 3);
    expectClose(out.pixels[1]!, BLOCKS[2]!, 2);
    expectClose(out.pixels[2]!, BLOCKS[0]!, 2);
    expect(out.pixels[0]).not.toEqual(BLOCKS[1]);
  });

  test("the brush tool paints and erases on the canvas, one history step per stroke (#109)", async ({
    page,
  }) => {
    await openEditorWithImage(page);
    await page.getByRole("tab", { name: "部分補正" }).click();
    // 装備強調はブラシで始まる
    await page.getByRole("button", { name: "装備強調" }).click();
    await expect(page.getByTestId("local-list")).toContainText("装備強調 (ブラシ)");
    await expect(page.getByTestId("brush-settings")).toBeVisible();
    await expect(page.getByTestId("brush-overlay")).toBeVisible();
    await expect(page.getByTestId("local-sliders").getByLabel("美肌")).toBeVisible();

    const host = await page.getByTestId("canvas-host").boundingBox();
    if (!host) throw new Error("no canvas");
    const y = host.y + host.height / 2;
    const x0 = host.x + host.width * 0.3;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 60, y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("history-last")).toContainText("ブラシ");

    // 塗っている間だけ範囲が赤く重なり、離すと消えて補正 (露光 +2) だけが見える
    const view = await page.evaluate(() =>
      (
        window as Window & {
          __prismtoneEditor?: {
            viewRect: () => { x: number; y: number; width: number; height: number };
          };
        }
      ).__prismtoneEditor!.viewRect(),
    );
    const uv = {
      x: (x0 + 30 - host.x - view.x) / view.width,
      y: (y - host.y - view.y) / view.height,
    };
    const readAt = () =>
      page.evaluate(
        (p) =>
          (
            window as Window & {
              __prismtoneEditor?: { previewPixels: (q: { x: number; y: number }[]) => number[][] };
            }
          ).__prismtoneEditor!.previewPixels([p])[0]!,
        uv,
      );
    const exposure = page.getByTestId("local-sliders").getByLabel("露光量");
    await exposure.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
    // 装備強調の +0.15 に +2.00 が乗る
    await expect(page.getByTestId("history-last")).toContainText("露光量 +2.15");
    const released = await readAt();
    expect(released[1]).toBeGreaterThan(BLOCKS[1]![1]! + 20); // 緑ブロックの上、露光で明るい
    expect(released[1]).toBeGreaterThan(released[0]!); // 赤く染まっていない (緑が主のまま)
    await page.mouse.move(x0 + 30, y);
    await page.mouse.down();
    const pressed = await readAt();
    expect(pressed[0]).toBeGreaterThan(released[0]! + 40); // 押している間は赤が乗る
    await page.mouse.up();
    await expect(page.getByTestId("history-last")).toContainText("ブラシ");

    await page.getByRole("button", { name: "消す", exact: true }).click();
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 20, y, { steps: 3 });
    await page.mouse.up();
    await expect(page.getByTestId("history-last")).toContainText("消しゴム");
    await page.getByTestId("history-undo").click();
    await expect(page.getByTestId("history-last")).toContainText("ブラシ");
  });

  test("the local panel adds an ellipse, drags it, undoes, hides, and survives a redo of the export (#109)", async ({
    page,
  }) => {
    // 「投稿へ」から戻ってくる導線を使うのでログインしておく
    await login(page, "/edit");
    await openEditorWithImage(page);
    await page.getByRole("tab", { name: "部分補正" }).click();
    await page.getByRole("button", { name: "瞳強調" }).click();
    await expect(page.getByTestId("local-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("local-list")).toContainText("瞳強調 (円形)");
    await expect(page.getByTestId("history-last")).toContainText("部分補正を追加: 瞳強調");
    await expect(page.getByTestId("ellipse-overlay")).toBeVisible();
    await expect(page.getByTestId("local-sliders")).toBeVisible();

    // 中心ハンドルを右へ 40px ドラッグすると 1 手の履歴になり、ハンドルもついてくる
    const move = page.getByTestId("ellipse-handle-move");
    const before = await move.boundingBox();
    if (!before) throw new Error("no handle");
    const cx = before.x + before.width / 2;
    const cy = before.y + before.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 20, cy, { steps: 4 });
    await page.mouse.move(cx + 40, cy, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId("history-last")).toContainText("マスクを動かす");
    const after = await move.boundingBox();
    expect(Math.abs(after!.x - before.x - 40)).toBeLessThan(2);
    await page.getByTestId("history-undo").click();
    const back = await move.boundingBox();
    expect(Math.abs(back!.x - before.x)).toBeLessThan(2);
    await page.getByTestId("history-redo").click();

    // スライダーは選択中の範囲に効く (露光量)。値の表示で確かめる
    const exposure = page.getByTestId("local-sliders").getByLabel("露光量");
    await exposure.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("history-last")).toContainText("部分補正: 露光量 +0.35");
    // 手で変えたのでプリセットの強調は外れる
    await expect(page.getByRole("button", { name: "瞳強調" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // 隠すとオーバーレイは残るが (選択中)、非表示の印になる
    await page.getByRole("button", { name: "表示中" }).click();
    await expect(page.getByTestId("local-list")).toContainText("非表示");

    // 投稿へ → 現像をやり直す で戻っても部分補正が残っている (下書きの復元、v2 のレシピ)
    await page.getByRole("button", { name: "投稿へ" }).click();
    await page.waitForURL("**/edit/post");
    await page.getByTestId("pending-image-redo-0").click();
    await page.waitForURL(/\/edit(\?|$)/);
    await page.getByRole("tab", { name: "部分補正" }).click();
    await expect(page.getByTestId("local-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("local-list")).toContainText("非表示");

    // 全リセットで消える
    await page.getByRole("button", { name: "全リセット" }).click();
    await expect(page.getByTestId("local-list")).toHaveCount(0);
    await expect(page.getByTestId("ellipse-overlay")).toHaveCount(0);
  });

  test("zoom: buttons, ctrl+wheel around the cursor, wheel pan, and fit; overlays follow", async ({
    page,
  }) => {
    await openEditorWithImage(page);
    const viewRect = () =>
      page.evaluate(() =>
        (
          window as Window & {
            __prismtoneEditor?: { viewRect: () => { x: number; scale: number; width: number } };
          }
        ).__prismtoneEditor!.viewRect(),
      );
    const fit = await viewRect();
    await expect(page.getByTestId("zoom-percent")).toHaveText(`${Math.round(fit.scale * 100)}%`);

    await page.getByRole("button", { name: "拡大" }).click();
    const zoomed = await viewRect();
    expect(zoomed.scale / fit.scale).toBeCloseTo(1.25, 2);
    await expect(page.getByTestId("zoom-percent")).toHaveText(`${Math.round(zoomed.scale * 100)}%`);

    // 円形マスクのハンドルは表示に追従する (中心のハンドルは画像の中心 = view の中央)
    await page.getByRole("tab", { name: "部分補正" }).click();
    await page.getByTestId("local-add-ellipse").click();
    const handle = page.getByTestId("ellipse-handle-move");
    const h1 = await handle.boundingBox();
    // Ctrl + ホイールで画像の左上 (ホストの左上寄り) を軸に拡大 → 中心ハンドルは右下へ動く
    const host = await page.getByTestId("canvas-host").boundingBox();
    await page.mouse.move(host!.x + 10, host!.y + 10);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect.poll(async () => (await viewRect()).scale).toBeGreaterThan(zoomed.scale);
    const h2 = await handle.boundingBox();
    expect(h2!.x).toBeGreaterThan(h1!.x);
    expect(h2!.y).toBeGreaterThan(h1!.y);

    // ホイールで移動
    const before = await viewRect();
    await page.mouse.wheel(0, 50);
    await expect.poll(async () => (await viewRect()).x).toBe(before.x);
    const after = await viewRect();
    expect(after.scale).toBe(before.scale);

    await page.getByRole("button", { name: "フィット" }).click();
    await expect.poll(async () => (await viewRect()).scale).toBeCloseTo(fit.scale, 5);
    // 等倍
    await page.getByTestId("zoom-percent").click();
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  });

  test("shrinking the window keeps the side panel and refits the image", async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 900 });
    await openEditorWithImage(page);
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect
      .poll(async () => {
        const aside = await page.locator("aside").boundingBox();
        return aside ? aside.x + aside.width : 0;
      })
      .toBeLessThanOrEqual(1100);
    const host = await page.getByTestId("canvas-host").boundingBox();
    const view = await page.evaluate(() =>
      (
        window as Window & { __prismtoneEditor?: { viewRect: () => { width: number } } }
      ).__prismtoneEditor!.viewRect(),
    );
    expect(view.width).toBeLessThanOrEqual(host!.width);
    expect(view.width).toBeGreaterThan(host!.width * 0.9);
  });

  test("a large image is developed over its whole preview, and a local adjustment lands where it was placed", async ({
    page,
  }) => {
    // 3000x2000 はプレビューで 2048 に縮む。縮小した合成の段でも画像全体が描かれ、右下の部分補正も効く
    await page.addInitScript(() => {
      (window as Window & { __PRISMTONE_E2E__?: boolean }).__PRISMTONE_E2E__ = true;
    });
    await page.goto("/edit");
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 3000;
      c.height = 2000;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgb(128,128,128)";
      g.fillRect(0, 0, 3000, 2000);
      return c.toDataURL("image/png");
    });
    await page.getByTestId("file-input").setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: Buffer.from(png.split(",")[1]!, "base64"),
    });
    await expect(page.getByRole("button", { name: "端末に保存" })).toBeEnabled();
    await page.waitForFunction(() =>
      Boolean((window as Window & { __prismtoneEditor?: unknown }).__prismtoneEditor),
    );
    // 右下 (0.9, 0.9) に露光 +2 の円形マスク
    await page.getByRole("tab", { name: "部分補正" }).click();
    await page.getByTestId("local-add-ellipse").click();
    const move = page.getByTestId("ellipse-handle-move");
    const view = await page.evaluate(() =>
      (
        window as Window & {
          __prismtoneEditor?: {
            viewRect: () => { x: number; y: number; width: number; height: number };
          };
        }
      ).__prismtoneEditor!.viewRect(),
    );
    const host = (await page.getByTestId("canvas-host").boundingBox())!;
    const from = (await move.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(host.x + view.x + 0.9 * view.width, host.y + view.y + 0.9 * view.height, {
      steps: 5,
    });
    await page.mouse.up();
    const exposure = page.getByTestId("local-sliders").getByLabel("露光量");
    await exposure.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("history-last")).toContainText("露光量 +2.00");

    const px = await page.evaluate(() =>
      (
        window as Window & {
          __prismtoneEditor?: { previewPixels: (p: { x: number; y: number }[]) => number[][] };
        }
      ).__prismtoneEditor!.previewPixels([
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.1 },
        { x: 0.98, y: 0.5 },
      ]),
    );
    // マスクの中心は明るく、離れた左上はそのまま、右端 (マスクの外) も (透明 = 黒ではなく) 灰色で描かれている
    expect(px[0]![0]).toBeGreaterThan(200);
    expectClose(px[1]!, [128, 128, 128], 2);
    expectClose(px[2]!, [128, 128, 128], 2);

    // 書き出し (原寸 3000x2000) も四隅まで描かれ、マスクの中心は明るい
    const recipe = await page.evaluate(() =>
      (
        window as Window & { __prismtoneEditor?: { currentRecipe: () => EditRecipe } }
      ).__prismtoneEditor!.currentRecipe(),
    );
    const out = await exportPixels(page, recipe, [
      { x: 10, y: 10 },
      { x: 2990, y: 1990 },
      { x: 2700, y: 1800 },
      { x: 2940, y: 1000 },
    ]);
    expect(out.width).toBe(3000);
    expect(out.height).toBe(2000);
    expectClose(out.pixels[0]!, [128, 128, 128], 2);
    expectClose(out.pixels[1]!, [128, 128, 128], 2);
    expect(out.pixels[2]![0]).toBeGreaterThan(200);
    expectClose(out.pixels[3]!, [128, 128, 128], 2);
  });

  test("preset, undo, redo and reset drive the UI", async ({ page }) => {
    await openEditorWithImage(page);
    await page.getByRole("button", { name: "モノクロ", exact: true }).click();
    await expect(page.getByRole("button", { name: "モノクロ", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("history-undo")).toBeEnabled();
    await expect(page.getByTestId("history-undo")).toHaveAttribute(
      "title",
      "プリセット: モノクロ を取り消す (Ctrl+Z)",
    );
    await expect(page.getByTestId("history-last")).toContainText("プリセット: モノクロ");
    await page.getByTestId("history-undo").click();
    await expect(page.getByRole("button", { name: "モノクロ", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.getByTestId("history-redo").click();
    await expect(page.getByRole("button", { name: "モノクロ", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "全リセット" }).click();
    await expect(page.getByRole("button", { name: "モノクロ", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("compare slider toggles, moves by drag and keyboard, and turns off while cropping", async ({
    page,
  }) => {
    await openEditorWithImage(page);
    await page.getByRole("button", { name: "モノクロ", exact: true }).click();
    const toggle = page.getByTestId("compare-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const slider = page.getByTestId("compare-slider");
    await expect(slider).toBeVisible();

    // ドラッグで境界が動く
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 5 });
    await page.mouse.up();
    const range = page.getByTestId("compare-range");
    expect(Number(await range.inputValue())).toBeGreaterThan(700);

    // キーボードでも動く
    await range.focus();
    await page.keyboard.press("ArrowLeft");
    expect(Number(await range.inputValue())).toBeLessThan(800);

    // 切り抜きを始めると比較は切れ、ボタンも押せない
    await page.getByRole("tab", { name: "幾何" }).click();
    await page.getByRole("button", { name: "トリミング", exact: true }).click();
    await expect(slider).toHaveCount(0);
    await expect(toggle).toBeDisabled();
  });

  test("save downloads an image file", async ({ page }) => {
    await openEditorWithImage(page);
    const download = page.waitForEvent("download");
    await page.getByTestId("save").click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^test-prismtone\.(webp|jpg)$/);
  });

  test("rejects non-image files with a message", async ({ page }) => {
    await page.goto("/edit");
    await page
      .getByTestId("file-input")
      .setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("not a png") });
    await expect(page.getByRole("alert")).toContainText("PNG または JPEG");
  });
});
