import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      {
        find: "@slotclientengine/rendercore/image-string",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/image-string/index.ts",
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
        find: "@slotclientengine/browserartifactio",
        replacement: resolve(
          __dirname,
          "../../packages/browserartifactio/src/index.ts",
        ),
      },
    ],
  },
  server: { host: "0.0.0.0", fs: { allow: [resolve(__dirname, "../..")] } },
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
