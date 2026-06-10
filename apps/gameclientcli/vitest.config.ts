import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@slotclientengine/netcore": resolve(
        __dirname,
        "../../packages/netcore/src/index.ts",
      ),
      "@slotclientengine/logiccore": resolve(
        __dirname,
        "../../packages/logiccore/src/index.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: ["src/index.ts", "src/types.ts"],
    },
  },
});
