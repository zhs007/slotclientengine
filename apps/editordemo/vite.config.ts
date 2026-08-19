import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      {
        find: /^@slotclientengine\/logiccore$/u,
        replacement: resolve(
          __dirname,
          "../../packages/logiccore/src/index.ts",
        ),
      },
    ],
  },
  server: {
    host: "0.0.0.0",
    fs: { allow: [resolve(__dirname, "../..")] },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/demo-project.ts", "src/host.ts"],
      thresholds: { lines: 70, functions: 75, branches: 60, statements: 70 },
    },
  },
});
