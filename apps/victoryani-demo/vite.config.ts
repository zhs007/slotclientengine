import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
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
        "src/main.ts",
        "src/styles.css",
        "src/vite-env.d.ts",
        "vite.config.ts",
        "eslint.config.cjs",
        "tests/setup.ts"
      ]
    }
  }
});