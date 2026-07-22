import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Leo loading UI source boundary", () => {
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
      "game-leo-frameworks",
      "netcore2",
      "gameframeworks",
      "rendercore",
      "pixi",
      "WebSocket",
    ]) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(source).not.toContain("Date.now()");
  });

  it("owns exactly the four reviewed assets", () => {
    expect(readdirSync(resolve(__dirname, "../assets")).sort()).toEqual([
      "a2.webp",
      "a3.webp",
      "loading2.gif",
      "logo_1.webp",
    ]);
  });
});
