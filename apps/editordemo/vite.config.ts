import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0" },
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
