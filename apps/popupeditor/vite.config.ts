import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.atlas"],
  resolve: {
    alias: [
      {
        find: "@slotclientengine/rendercore/popup",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/popup/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/index.ts",
        ),
      },
    ],
  },
  server: { host: "0.0.0.0", fs: { allow: [resolve(__dirname, "../..")] } },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/main.ts", "src/styles.css"],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
