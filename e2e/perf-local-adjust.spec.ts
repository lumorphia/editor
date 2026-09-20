import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_BRUSH_MASK,
  DEFAULT_ELLIPSE_MASK,
  DEFAULT_LOCAL_ADJUST,
  DEFAULT_LOCAL_ADJUSTMENT,
  DEFAULT_RECIPE,
  type EditRecipe,
  type LocalAdjustmentV2,
} from "@prismtone/shared/recipe";

/**
 * 部分補正の性能計測 (#109、docs/spikes/2026-09-20-local-adjust-perf.md)。
 * 通常の E2E では走らせない。PERF=1 pnpm exec playwright test e2e/perf-local-adjust.spec.ts --headed
 * headless (SwiftShader、CPU 描画) は上限の目安。実機の GPU では --headed で取る
 */
test.skip(!process.env.PERF, "PERF=1 のときだけ");

async function makeNoisePng(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      const img = ctx.createImageData(width, height);
      let seed = 1;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        img.data[i] = seed & 255;
        img.data[i + 1] = (seed >> 8) & 255;
        img.data[i + 2] = (seed >> 16) & 255;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL("image/png");
    },
    { width, height },
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

const local = (i: number): LocalAdjustmentV2 => ({
  ...DEFAULT_LOCAL_ADJUSTMENT,
  id: `l${i}`,
  mask:
    i % 2 === 0
      ? { ...DEFAULT_ELLIPSE_MASK, cx: 0.2 + i * 0.08, cy: 0.5, rx: 0.1, ry: 0.15 }
      : {
          ...DEFAULT_BRUSH_MASK,
          strokes: [
            {
              mode: "add",
              size: 0.1,
              hardness: 0.8,
              points: Array.from({ length: 64 }, (_, k) => ({
                x: 0.1 + k * 0.012,
                y: 0.3 + i * 0.05,
              })),
            },
          ],
        },
  adjust: { ...DEFAULT_LOCAL_ADJUST, exposure: 0.3, sharpen: 30, smooth: i % 2 === 0 ? 0 : 40 },
});

test("measure develop / export time and texture memory for 0 / 4 / 8 local adjustments", async ({
  page,
}) => {
  test.setTimeout(600_000);
  await page.addInitScript(() => {
    (window as Window & { __PRISMTONE_E2E__?: boolean }).__PRISMTONE_E2E__ = true;
  });
  await page.goto("/edit");
  const png = await makeNoisePng(page, 4096, 2304);
  await page
    .getByTestId("file-input")
    .setInputFiles({ name: "4k.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() =>
    Boolean((window as Window & { __prismtoneEditor?: unknown }).__prismtoneEditor),
  );
  await expect(page.getByRole("button", { name: "端末に保存" })).toBeEnabled({ timeout: 60_000 });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    return dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  console.log(`renderer: ${gpu}`);
  for (const n of [0, 4, 8]) {
    const recipe: EditRecipe = {
      ...DEFAULT_RECIPE,
      localAdjustments: Array.from({ length: n }, (_, i) => local(i)),
    };
    const r = await page.evaluate(
      (recipe) =>
        (
          window as Window & {
            __prismtoneEditor?: { benchmark: (r: EditRecipe, frames?: number) => Promise<unknown> };
          }
        ).__prismtoneEditor!.benchmark(recipe, 20),
      recipe,
    );
    console.log(`locals=${n} ${JSON.stringify(r)}`);
  }
});
