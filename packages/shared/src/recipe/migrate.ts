import { z } from "zod";
import {
  editRecipeSchemaV1,
  editRecipeSchemaV2,
  editRecipeSchemaV3,
  localAdjustmentSchemaV2,
  localAdjustmentSchemaV3,
  MAX_LOCAL_ADJUSTMENTS,
  MAX_LOCAL_ADJUSTMENTS_V2,
  type EditRecipe,
  type EditRecipeV1,
  type EditRecipeV2,
  type EditRecipeV3,
} from "./schema.ts";

export class RecipeMigrationError extends Error {
  override readonly name = "RecipeMigrationError";
}

const versioned = z.object({ version: z.number().int() });

// strict は object にしか付かないので、部分補正とマスクの中まで strict にした版を組み立てる。
// v2 に groupId が混ざっていれば拒む (version の書き間違いを通さない)
const strictV2 = editRecipeSchemaV2.strict().extend({
  localAdjustments: localAdjustmentSchemaV2.strict().array().max(MAX_LOCAL_ADJUSTMENTS_V2),
});
const strictV3 = editRecipeSchemaV3.strict().extend({
  localAdjustments: localAdjustmentSchemaV3.strict().array().max(MAX_LOCAL_ADJUSTMENTS),
});

/** v1 -> v2: 部分補正を空で足す (#109) */
export function migrateV1toV2(v1: EditRecipeV1): EditRecipeV2 {
  return { ...v1, version: 2, localAdjustments: [] };
}

/** v2 -> v3: 部分補正に groupId: null を足す (#175)。マスクはそのまま (v2 の 2 種は v3 でも有効) */
export function migrateV2toV3(v2: EditRecipeV2): EditRecipeV3 {
  return {
    ...v2,
    version: 3,
    localAdjustments: v2.localAdjustments.map((l) => ({ ...l, groupId: null })),
  };
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
      return migrateV2toV3(migrateV1toV2(parseOrThrow(editRecipeSchemaV1.strict(), input, "v1")));
    case 2:
      return migrateV2toV3(parseOrThrow(strictV2, input, "v2"));
    case 3:
      return parseOrThrow(strictV3, input, "v3");
    default:
      throw new RecipeMigrationError(`unsupported recipe version: ${head.data.version}`);
  }
}
