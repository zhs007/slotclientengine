import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      cc: fileURLToPath(new URL("./tests/fakes/cc.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts", "standalone/anieditorv5runtime-cc.ts"],
      exclude: ["src/cocos/cocos-node-driver.ts"],
    },
  },
});
