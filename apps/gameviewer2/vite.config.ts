import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const alias = (name: string, path: string) => ({
  find: name,
  replacement: resolve(__dirname, path),
});

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      alias(
        "@slotclientengine/rendercore/scene-layout",
        "../../packages/rendercore/src/scene-layout/index.ts",
      ),
      alias(
        "@slotclientengine/rendercore",
        "../../packages/rendercore/src/index.ts",
      ),
      alias(
        "@slotclientengine/logiccore",
        "../../packages/logiccore/src/index.ts",
      ),
      alias(
        "@slotclientengine/browserartifactio",
        "../../packages/browserartifactio/src/index.ts",
      ),
      alias(
        "@slotclientengine/editorresource",
        "../../packages/editorresource/src/index.ts",
      ),
      alias(
        "@slotclientengine/pixiani/core",
        "../../packages/pixiani/src/core/index.ts",
      ),
      alias("@slotclientengine/pixiani", "../../packages/pixiani/src/index.ts"),
      alias(
        "@slotclientengine/vnicore/core",
        "../../packages/vnicore/src/core/index.ts",
      ),
      alias(
        "@slotclientengine/vnicore/pixi",
        "../../packages/vnicore/src/pixi/index.ts",
      ),
    ],
  },
  server: { host: "0.0.0.0", fs: { allow: [resolve(__dirname, "../..")] } },
  test: {
    globals: true,
    environment: "happy-dom",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/main.ts", "src/styles.css", "src/vite-env.d.ts"],
      thresholds: { lines: 65, functions: 65, branches: 55, statements: 65 },
    },
  },
});
