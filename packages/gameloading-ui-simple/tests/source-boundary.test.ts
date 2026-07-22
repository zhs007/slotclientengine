import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("simple loading UI source boundary", () => {
  it("has no runtime dependencies or forbidden framework/network imports", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies).toEqual({});
    const source = readdirSync(resolve(__dirname, "../src"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(resolve(__dirname, "../src", file), "utf8"))
      .join("\n");
    for (const forbidden of [
      "react",
      "zustand",
      "eventcore",
      "gameframeworks",
      "rendercore",
      "pixi",
      "WebSocket",
    ]) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
