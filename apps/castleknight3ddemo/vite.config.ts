import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0" },
  build: {
    rolldownOptions: {
      input: {
        main: "index.html",
        viewer: "viewer.html",
      },
    },
  },
  test: { globals: true, environment: "node" },
});
