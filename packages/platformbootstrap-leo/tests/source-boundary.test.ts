import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

describe("platformbootstrap-leo source boundary", () => {
  it("does not recover the legacy framework architecture", () => {
    const source = readdirSync(resolve(__dirname, "../src"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(resolve(__dirname, "../src", name), "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /netcore2?|logiccore|eventcore|React|Pixi|WebSocket|window\.location|stateData|RoundService|GameContainer|Zustand|Inversify/u,
    );
  });
});
