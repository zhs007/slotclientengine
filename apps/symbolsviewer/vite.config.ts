import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.atlas"],
  resolve: {
    alias: [
      {
        find: "@slotclientengine/rendercore/symbol",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/symbol/index.ts",
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
    fs: {
      allow: [resolve(__dirname, "../..")],
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/main.ts", "src/styles.css", "src/vite-env.d.ts"],
    },
  },
});
