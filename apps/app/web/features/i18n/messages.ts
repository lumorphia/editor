import type { Locale } from "./locale.ts";

const EN: Readonly<Record<string, string>> = {
  露光量: "Exposure",
  コントラスト: "Contrast",
  ハイライト: "Highlights",
  シャドウ: "Shadows",
  色温度: "Temperature",
  色かぶり: "Tint",
  自然な彩度: "Vibrance",
  彩度: "Saturation",
  シャープ: "Sharpen",
  美肌: "Smooth skin",
  夜景: "Night",
  夕暮れ: "Sunset",
  朝霧: "Cool morning",
  パステル: "Pastel",
  ビビッド: "Vivid",
  フィルム: "Film",
  モノクロ: "Monochrome",
  ソフト: "Soft",
  ダンジョン: "Dungeon",
  ゴールド: "Gold",
  瞳強調: "Enhance eyes",
  装備強調: "Enhance gear",
  ナチュラル: "Natural",
  明るく: "Bright",
  ドラマチック: "Dramatic",
  やわらか: "Soft",
  瞳くっきり: "Bright eyes",
  円形: "Ellipse",
  ブラシ: "Brush",
  多角形: "Polygon",
  切り抜き: "Selection",
  全体: "Whole character",
  装備: "Gear",
  部品: "Detail",
};

export function translateKnown(locale: Locale, value: string): string {
  return locale === "en" ? (EN[value] ?? value) : value;
}
