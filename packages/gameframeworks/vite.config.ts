import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SlotGameFrameworks",
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "gameframeworks",
    },
  },
  resolve: {
    alias: [
      {
        find: "@slotclientengine/uiframeworks/styles.css",
        replacement: resolve(__dirname, "../uiframeworks/src/styles.css"),
      },
      {
        find: "@slotclientengine/uiframeworks",
        replacement: resolve(__dirname, "../uiframeworks/src/index.ts"),
      },
      {
        find: "@slotclientengine/netcore",
        replacement: resolve(__dirname, "../netcore/src/index.ts"),
      },
      {
        find: "@slotclientengine/logiccore",
        replacement: resolve(__dirname, "../logiccore/src/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/styles.css"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
