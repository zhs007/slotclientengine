import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("gameviewer production source boundary", () => {
  it("keeps runtime as payload validation plus one framework facade", () => {
    const runtime = [
      "src/runtime/create-game.ts",
      "src/runtime/entry.ts",
      "src/runtime/launch-channel.ts",
      "src/runtime/launch-payload.ts",
    ]
      .map((path) => readFileSync(resolve(appRoot, path), "utf8"))
      .join("\n");
    expect(runtime).not.toMatch(
      /@slotclientengine\/rendercore|pixi\.js|spine|vnicore/u,
    );
    expect(runtime).not.toMatch(
      /RenderReelSet|RenderGridCellReelSet|createSymbolWinCarousel/u,
    );
    expect(
      readFileSync(
        resolve(appRoot, "src/runtime/create-game.ts"),
        "utf8",
      ).match(/createSceneLayoutSlotGameTemplate/g),
    ).toHaveLength(2);
  });

  it("contains no game-instance identifiers in production TypeScript", () => {
    const paths = [
      "src/main.ts",
      "src/model/store.ts",
      "src/io/imports.ts",
      "src/ui/app-shell.ts",
      "src/runtime/create-game.ts",
      "src/runtime/entry.ts",
      "src/runtime/launch-channel.ts",
      "src/runtime/launch-payload.ts",
    ];
    const source = paths
      .map((path) => readFileSync(resolve(appRoot, path), "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /crave|retrosweets|game00[23]|bg-(?:spin|win)|["'](?:WL|CN)["']/u,
    );
  });
});
