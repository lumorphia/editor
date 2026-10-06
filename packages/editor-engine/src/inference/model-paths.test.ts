import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_BASE_URL, modelPaths } from "./model-paths.ts";

describe("modelPaths", () => {
  it("serves models from /models/ by default", () => {
    expect(DEFAULT_MODEL_BASE_URL).toBe("/models/");
    expect(modelPaths(DEFAULT_MODEL_BASE_URL)).toEqual({
      face: "/models/face-landmarker-v1",
      samRoot: "/models/",
      samModelId: "slimsam-77-q8-v1",
      ortWasm: "/models/ort-v1/",
    });
  });

  it("accepts a base URL without a trailing slash", () => {
    expect(modelPaths("https://cdn.example/m").face).toBe(
      "https://cdn.example/m/face-landmarker-v1",
    );
  });
});
