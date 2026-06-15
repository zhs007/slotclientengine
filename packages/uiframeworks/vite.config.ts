import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SlotUiFrameworks",
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "uiframeworks",
    },
    rollupOptions: {
      external: [
        "@slotclientengine/netcore",
        "@slotclientengine/logiccore",
        "lucide",
      ],
    },
  },
  resolve: {
    alias: [
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
        lines: 81,
        functions: 81,
        branches: 81,
        statements: 81,
      },
    },
  },
});
