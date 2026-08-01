import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("gameviewer2 source boundary", () => {
  it("depends on rendercore without server or component frameworks", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(appRoot, "package.json"), "utf8"),
    );
    expect(manifest.dependencies).toEqual({
      "@slotclientengine/rendercore": "workspace:*",
    });
    const source = [
      "src/main.ts",
      "src/ui/app-shell.ts",
      "src/runtime/entry.ts",
      "src/runtime/launch-channel.ts",
    ]
      .map((path) => readFileSync(resolve(appRoot, path), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/netcore|gameframeworks|component/u);
  });
});
