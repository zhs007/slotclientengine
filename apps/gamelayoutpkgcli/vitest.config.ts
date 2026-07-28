import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      thresholds: {
        lines: 70,
        functions: 75,
        branches: 55,
        statements: 70,
      },
    },
  },
});
