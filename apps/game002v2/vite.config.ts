import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  publicDir: resolve(__dirname, "../../assets/crave"),
  assetsInclude: ["**/*.atlas"],
  build: { assetsInlineLimit: 0 },
  optimizeDeps: { include: ["@slotclientengine/netcore"] },
  resolve: {
    alias: [
      {
        find: "@slotclientengine/logiccore",
        replacement: resolve(
          __dirname,
          "../../packages/logiccore/src/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/symbol/core",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/symbol/core/index.ts",
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
    port: 5207,
    fs: { allow: [resolve(__dirname, "../..")] },
  },
  test: { globals: true, environment: "happy-dom" },
});
