import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  publicDir: resolve(__dirname, "../../assets/minecart2"),
  assetsInclude: ["**/*.atlas"],
  build: { assetsInlineLimit: 0 },
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
        find: "@slotclientengine/rendercore/scene-layout/data",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/scene-layout/data/index.ts",
        ),
      },
      {
        find: "@slotclientengine/rendercore/scene-layout/core",
        replacement: resolve(
          __dirname,
          "../../packages/rendercore/src/scene-layout/core/index.ts",
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
    port: 5210,
    fs: { allow: [resolve(__dirname, "../..")] },
  },
  test: {
    environment: "happy-dom",
    coverage: { provider: "v8", reporter: ["text", "json", "html"] },
  },
});
