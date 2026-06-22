import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      {
        find: "@slotclientengine/gameframeworks/styles.css",
        replacement: resolve(
          __dirname,
          "../../packages/gameframeworks/src/styles.css",
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
        find: "@slotclientengine/uiframeworks/styles.css",
        replacement: resolve(
          __dirname,
          "../../packages/uiframeworks/src/styles.css",
        ),
      },
      {
        find: "@slotclientengine/uiframeworks",
        replacement: resolve(
          __dirname,
          "../../packages/uiframeworks/src/index.ts",
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
    ],
  },
  server: {
    host: "0.0.0.0",
    port: 5203,
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
      exclude: ["src/main.ts", "src/styles.css", "src/vite-env.d.ts"],
    },
  },
});
