import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-preview",
    sourcemap: true
  },
  server: {
    host: "0.0.0.0"
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      exclude: [
        "src/index.ts",
        "src/ani/index.ts",
        "src/main.ts",
        "vite.config.ts",
        "eslint.config.cjs",
        ".prettierrc.cjs",
        "tests/setup.ts"
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    }
  }
});
