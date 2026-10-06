import { expect, test } from "./test.ts";

// 現像の UI (packages/editor-react) のクラスは、ホストの Tailwind が走査しないと CSS に入らない (@source)。
// 抜けると見た目だけでなく操作も壊れる (touch-none が無いとピンチでページごと拡大する)

test("the editor canvas takes over touch gestures from the page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-host")).toHaveCSS("touch-action", "none");
});

test("the selected editor tab is underlined", async ({ page }) => {
  await page.goto("/");
  const selected = page.locator('[role="tab"][aria-selected="true"]').first();
  await expect(selected).not.toHaveCSS("border-bottom-color", "rgba(0, 0, 0, 0)");
});
