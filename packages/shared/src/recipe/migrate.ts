import { z } from "zod";
import { editRecipeSchema, type EditRecipe } from "./schema.ts";

export class RecipeMigrationError extends Error {
  override readonly name = "RecipeMigrationError";
}

const versioned = z.object({ version: z.number().int() });

/**
 * 任意の入力を現行バージョンのレシピに変換する。
 * 未知の version、検証に失敗する入力は RecipeMigrationError を投げる。
 * 新しい version を追加するときは、旧 version から順に変換する関数をここに足す。
 */
export function migrateRecipe(input: unknown): EditRecipe {
  const head = versioned.safeParse(input);
  if (!head.success) {
    throw new RecipeMigrationError("recipe has no valid version");
  }
  switch (head.data.version) {
    case 1: {
      const parsed = editRecipeSchema.safeParse(input);
      if (!parsed.success) {
        throw new RecipeMigrationError(
          `invalid v1 recipe: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        );
      }
      return parsed.data;
    }
    default:
      throw new RecipeMigrationError(`unsupported recipe version: ${head.data.version}`);
  }
}
