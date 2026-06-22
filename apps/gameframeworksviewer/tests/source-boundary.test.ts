import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("source boundary", () => {
  it("keeps viewer source on the gameframeworks facade", () => {
    const files = [
      "src/main.ts",
      "src/scenarios.ts",
      "src/mock-client.ts",
      "src/logic-list-game.ts",
      "src/message-format.ts",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(__dirname, "..", file), "utf8");
      expect(source).not.toContain("@slotclientengine/uiframeworks");
      expect(source).not.toContain("@slotclientengine/netcore");
      expect(source).not.toContain("@slotclientengine/logiccore");
    }
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(Object.keys(packageJson.dependencies)).toEqual([
      "@slotclientengine/gameframeworks",
    ]);
  });
});
