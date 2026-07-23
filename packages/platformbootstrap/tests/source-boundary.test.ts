import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("platformbootstrap source boundary", () => {
  it("stays protocol and runtime neutral", () => {
    const source = ["types.ts", "validation.ts", "direct.ts", "index.ts"]
      .map((file) => readFileSync(resolve(__dirname, "../src", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /netcore|logiccore|React|Pixi|WebSocket|indexedDB|window\.location|stateData|Zustand|Inversify|GameContainer/u,
    );
    expect(source).not.toMatch(/platformToken|credential|serverUrl/u);
  });
});
