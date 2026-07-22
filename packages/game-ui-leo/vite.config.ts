import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "LeoSlotGameUi",
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "game-ui-leo",
    },
    assetsInlineLimit: 0,
    rollupOptions: {
      external: [
        "@slotclientengine/gameframeworks",
        "@slotclientengine/uiframeworks",
        "react",
        "react/jsx-runtime",
        "react-dom/client",
      ],
    },
  },
  resolve: {
    alias: [
      {
        find: "@slotclientengine/gameframeworks",
        replacement: resolve(__dirname, "../gameframeworks/src/index.ts"),
      },
      {
        find: "@slotclientengine/uiframeworks",
        replacement: resolve(__dirname, "../uiframeworks/src/index.ts"),
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
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
