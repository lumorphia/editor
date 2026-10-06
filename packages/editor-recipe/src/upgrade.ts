import { migrateRecipe } from "./migrate.ts";
import type { EditRecipe } from "./schema.ts";

/**
 * 端末に残っているレシピを現行の版に上げる (docs/design/04 §5)。
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
