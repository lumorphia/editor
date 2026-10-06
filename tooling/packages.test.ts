import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 公開する 3 つのパッケージの package.json の決まり。公開してから気づくと直せない (同じ版は出し直せない)
const root = new URL("..", import.meta.url);
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, root), "utf8")) as Record<string, unknown> & {
    version: string;
  };

const PACKAGES = ["editor-recipe", "editor-engine", "editor-react"] as const;

describe.each(PACKAGES)("@lumorphia/%s", (dir) => {
  const pkg = read(`packages/${dir}/package.json`);

  it("is published to GitHub Packages", () => {
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig).toEqual({ registry: "https://npm.pkg.github.com" });
  });

  it("points at this repository so GitHub links the package to it", () => {
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/lumorphia/editor.git",
      directory: `packages/${dir}`,
    });
  });

  it("carries the license of the repository", () => {
    expect(pkg.license).toBe("AGPL-3.0-only");
  });

  it("ships the built files", () => {
    expect(pkg.files).toContain("dist");
  });

  it("shares one version with the repository (release-please bumps them together)", () => {
    expect(pkg.version).toBe(read("package.json").version);
  });
});

describe("release-please", () => {
  const config = read("release-please-config.json") as unknown as {
    packages: Record<string, { "extra-files"?: { path: string; jsonpath: string }[] }>;
  };

  it("bumps the version of every published package", () => {
    const files = config.packages["."]?.["extra-files"]?.map((f) => f.path) ?? [];
    expect(files).toEqual(PACKAGES.map((dir) => `packages/${dir}/package.json`));
  });
});
