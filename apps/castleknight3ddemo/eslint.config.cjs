const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
  { ignores: ["dist/**", "coverage/**"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.eslint.json" },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  prettier,
];
