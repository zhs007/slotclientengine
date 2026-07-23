import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      {
        find: "@slotclientengine/gameframeworks/scene-layout-template",
        replacement: resolve(
          __dirname,
          "../../packages/gameframeworks/src/scene-layout-template/index.ts",
        ),
      },
      {
        find: "@slotclientengine/gameframeworks",
        replacement: resolve(
          __dirname,
          "../../packages/gameframeworks/src/index.ts",
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
        find: "@slotclientengine/logiccore",
        replacement: resolve(
          __dirname,
          "../../packages/logiccore/src/index.ts",
        ),
      },
      {
        find: "@slotclientengine/netcore",
        replacement: resolve(__dirname, "../../packages/netcore/src/index.ts"),
      },
      {
        find: "@slotclientengine/uiframeworks",
        replacement: resolve(
          __dirname,
          "../../packages/uiframeworks/src/index.ts",
        ),
      },
      {
        find: "@slotclientengine/browserartifactio",
        replacement: resolve(
          __dirname,
          "../../packages/browserartifactio/src/index.ts",
        ),
      },
      {
        find: "@slotclientengine/editorresource",
        replacement: resolve(
          __dirname,
          "../../packages/editorresource/src/index.ts",
        ),
      },
      {
        find: "@slotclientengine/pixiani/core",
        replacement: resolve(
          __dirname,
          "../../packages/pixiani/src/core/index.ts",
        ),
      },
      {
        find: "@slotclientengine/pixiani",
        replacement: resolve(__dirname, "../../packages/pixiani/src/index.ts"),
      },
      {
        find: "@slotclientengine/vnicore/core",
        replacement: resolve(
          __dirname,
          "../../packages/vnicore/src/core/index.ts",
        ),
      },
      {
        find: "@slotclientengine/vnicore/pixi",
        replacement: resolve(
          __dirname,
          "../../packages/vnicore/src/pixi/index.ts",
        ),
      },
    ],
  },
  server: { host: "0.0.0.0", fs: { allow: [resolve(__dirname, "../..")] } },
  test: {
    globals: true,
    environment: "happy-dom",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/main.ts", "src/styles.css", "src/vite-env.d.ts"],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 },
    },
  },
});
