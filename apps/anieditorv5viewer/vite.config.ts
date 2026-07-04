import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
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
      {
        find: "@slotclientengine/vnicore",
        replacement: resolve(__dirname, "../../packages/vnicore/src/index.ts"),
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
      reporter: ["text", "html", "json"],
      exclude: [
        "src/main.ts",
        "src/styles.css",
        "src/vite-env.d.ts",
        "vite.config.ts",
        "eslint.config.cjs",
        "tests/setup.ts",
      ],
    },
  },
});
