import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("static source restrictions", () => {
  it("does not create forbidden UI primitives in source", () => {
    const files = ["dom.ts", "index.ts", "styles.css"];
    const source = files
      .map((file) => readFileSync(resolve(__dirname, "../src", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/createElement\(['"]canvas|new OffscreenCanvas|<canvas/);
    expect(source).not.toMatch(/<svg|createElementNS|\.svg|\.png|\.jpg|\.jpeg|icon-font|@font-face/);
  });
});
