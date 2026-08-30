import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0" },
  test: { globals: true, environment: "node" },
});
