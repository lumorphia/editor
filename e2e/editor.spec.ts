import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_RECIPE, applyPreset, findPreset, type EditRecipe } from "@prismtone/shared/recipe";
import { applyAdjust } from "../apps/app/web/features/editor/adjust-math.ts";

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

  test("preset, undo, redo and reset drive the UI", async ({ page }) => {
    await openEditorWithImage(page);
    await page.getByRole("button", { name: "モノクロ" }).click();
    await expect(page.getByRole("button", { name: "モノクロ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "取り消し" })).toBeEnabled();
    await page.getByRole("button", { name: "取り消し" }).click();
    await expect(page.getByRole("button", { name: "モノクロ" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.getByRole("button", { name: "やり直し" }).click();
    await expect(page.getByRole("button", { name: "モノクロ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "全リセット" }).click();
    await expect(page.getByRole("button", { name: "モノクロ" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("compare slider toggles, moves by drag and keyboard, and turns off while cropping", async ({
    page,
  }) => {
    await openEditorWithImage(page);
    await page.getByRole("button", { name: "モノクロ" }).click();
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
