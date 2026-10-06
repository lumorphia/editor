import tseslint from "typescript-eslint";

// 依存の向き (AGENTS.md): recipe <- engine <- react <- apps/web。
// flat config は同じルールを後ろの設定で上書きするので、パッケージごとに制限を全部並べる

const NODE_APIS = ["node:*", "fs", "path", "crypto", "os", "child_process"];
const HOSTS = {
  group: ["@prismtone/*", "lumorphia-*"],
  message: "エディタはホスト (prismtone など) を知らない。必要なものは EditorHost で受け取る",
};
const DEEP = {
  group: ["@lumorphia/editor-*/src/*", "@lumorphia/editor-*/dist/*"],
  message: "ほかのパッケージは package.json の exports から使う",
};

const restrict = (paths, patterns) => ({
  rules: { "no-restricted-imports": ["error", { paths, patterns }] },
});

const recipe = {
  files: ["packages/editor-recipe/**/*.ts"],
  ...restrict(
    [],
    [
      { group: NODE_APIS, message: "recipe はブラウザでもサーバーでも動く。Node API を使わない" },
      HOSTS,
      {
        group: [
          "@lumorphia/editor-engine",
          "@lumorphia/editor-react",
          "react",
          "react-*",
          "pixi.js",
        ],
        message: "recipe は zod だけに依存する (ホストのサーバーと DB も使う)",
      },
    ],
  ),
};

const engine = {
  files: ["packages/editor-engine/src/**/*.ts"],
  ...restrict(
    [{ name: "react-router", message: "エディタは react-router に依存しない" }],
    [
      { group: NODE_APIS, message: "engine はブラウザで動く。Node API を使わない" },
      HOSTS,
      DEEP,
      {
        group: ["react", "react-dom", "react/*", "react-dom/*", "@lumorphia/editor-react"],
        message: "engine は React に依存しない (UI は editor-react)",
      },
    ],
  ),
};

// engine の CLI (bin/、モデルの取得) とビルドの補助 (scripts/)。Node で動くので Node API はよい
const engineTools = {
  files: ["packages/editor-engine/bin/**/*.ts", "packages/editor-engine/scripts/**/*.ts"],
  ...restrict([], [HOSTS, { group: ["react", "react-dom"], message: "CLI は React に依存しない" }]),
};

const react = {
  files: ["packages/editor-react/**/*.{ts,tsx}"],
  ...restrict(
    [
      {
        name: "react-router",
        message: "エディタは react-router に依存しない。遷移はホストの送り先で",
      },
    ],
    [{ group: NODE_APIS, message: "UI はブラウザで動く。Node API を使わない" }, HOSTS, DEEP],
  ),
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "test-results/**",
      "playwright-report/**",
      // 認識のモデルと WASM (editor-models fetch が置く。git には入らない)
      "apps/*/models/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  recipe,
  engine,
  engineTools,
  react,
);
