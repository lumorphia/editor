import { z } from "zod";
import {
  editRecipeSchemaV1,
  editRecipeSchemaV2,
  type EditRecipe,
  type EditRecipeV1,
  type EditRecipeV2,
} from "./schema.ts";

export class RecipeMigrationError extends Error {
  override readonly name = "RecipeMigrationError";
}

const versioned = z.object({ version: z.number().int() });

/** v1 -> v2: 部分補正を空で足す (#109) */
export function migrateV1toV2(v1: EditRecipeV1): EditRecipeV2 {
  return { ...v1, version: 2, localAdjustments: [] };
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new RecipeMigrationError(
      `invalid ${label} recipe: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return parsed.data;
}

/**
 * 任意の入力を現行バージョンのレシピに変換する。
 * 未知の version、検証に失敗する入力は RecipeMigrationError を投げる。
 * 旧 version は順に変換する (v1 -> v2 -> ...)。新しい version を足すときはここに case を足す。
 * 各版は strict に検証し、版に無い項目が混ざっていれば拒む (version の書き間違いを通さない)。
 */
export function migrateRecipe(input: unknown): EditRecipe {
  const head = versioned.safeParse(input);
  if (!head.success) {
    throw new RecipeMigrationError("recipe has no valid version");
  }
  switch (head.data.version) {
    case 1:
      return migrateV1toV2(parseOrThrow(editRecipeSchemaV1.strict(), input, "v1"));
    case 2:
      return parseOrThrow(editRecipeSchemaV2.strict(), input, "v2");
    default:
      throw new RecipeMigrationError(`unsupported recipe version: ${head.data.version}`);
  }
}
