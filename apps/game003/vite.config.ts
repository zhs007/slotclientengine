import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
  },
  resolve: {
    alias: [
      {
        find: "@slotclientengine/rendercore/reel",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/reel/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/symbol",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/symbol/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/viewport",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/viewport/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/win-amount",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/win-amount/index.ts",
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
  server: {
    host: "0.0.0.0",
    port: 5208,
    fs: {
      allow: [resolve(__dirname, "../..")],
    },
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
      exclude: [
        "src/env.ts",
        "src/main.ts",
        "src/styles.css",
        "src/vite-env.d.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
