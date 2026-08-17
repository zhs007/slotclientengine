import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.atlas"],
  resolve: {
    alias: [
      {
        find: "@slotclientengine/rendercore/scene-layout/editor",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/scene-layout/editor.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/popup/editor",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/popup/editor/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/popup/core",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/popup/core/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/image-string/data",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/image-string/data/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/image-string/editor",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/image-string/editor/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/symbol/data",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/symbol/data/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/symbol/editor",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/symbol/editor/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/scene-layout",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/scene-layout/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/index.ts",
        ),
      },
      {
        find: "@slotclientengine/logiccore",
        replacement: resolve(
          __dirname,
          "../../packages/logiccore/src/index.ts",
        ),
      },
    ],
  },
  server: {
    host: "0.0.0.0",
    fs: { allow: [resolve(__dirname, "../..")] },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/main.ts", "src/styles.css", "src/vite-env.d.ts"],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
