import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@slotclientengine/browserartifactio",
        replacement: resolve(__dirname, "../browserartifactio/src/index.ts"),
      },
      {
        find: "@slotclientengine/pixiani/core",
        replacement: resolve(__dirname, "../pixiani/src/core/index.ts"),
      },
      {
        find: "@slotclientengine/pixiani",
        replacement: resolve(__dirname, "../pixiani/src/index.ts"),
      },
      {
        find: "@slotclientengine/logiccore",
        replacement: resolve(__dirname, "../logiccore/src/index.ts"),
      },
      {
        find: "@slotclientengine/vnicore/core",
        replacement: resolve(__dirname, "../vnicore/src/core/index.ts"),
      },
      {
        find: "@slotclientengine/vnicore/pixi",
        replacement: resolve(__dirname, "../vnicore/src/pixi/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/index.ts", "src/symbol/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
