import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = process.cwd();
const REPO_ROOT = resolve(APP_ROOT, "../..");

describe("gamelayouteditor production ownership boundary", () => {
  it("does not implement image-string glyph layout or depend on Spine runtime internals", () => {
    const source = readSourceTree(join(APP_ROOT, "src"));
    expect(source).not.toMatch(/@esotericsoftware\/spine-pixi-v8/);
    expect(source).not.toMatch(
      /codePointAt|fixedAdvanceGroups|new\s+Sprite\s*\(/,
    );
    expect(source).not.toMatch(
      /\.state\.setAnimation|\.tracks\b|attachSlotObject/,
    );
    expect(source).not.toMatch(
      /\.reels\s*\[|resetToVisibleSymbols|getChildAt\s*\(/,
    );
  });

  it("uses one shared Spine transition controller in background and scene-layout", () => {
    const controllerPath = join(
      REPO_ROOT,
      "packages/rendercore/src/spine/state-controller.ts",
    );
    const background = readFileSync(
      join(
        REPO_ROOT,
        "packages/rendercore/src/background/spine-background-player.ts",
      ),
      "utf8",
    );
    const sceneLayout = readFileSync(
      join(REPO_ROOT, "packages/rendercore/src/scene-layout/runtime.ts"),
      "utf8",
    );
    expect(readFileSync(controllerPath, "utf8")).toMatch(
      /export class SpineStateController/,
    );
    expect(background).toMatch(/new SpineStateController/);
    expect(sceneLayout).toMatch(/new SpineStateController/);
    expect(background).not.toMatch(/#resolve|#reject|#targetState/);
  });

  it("keeps game and live-server semantics out of the shared layout package", () => {
    const shared = [
      readSourceTree(join(REPO_ROOT, "packages/rendercore/src/scene-layout")),
      readSourceTree(join(REPO_ROOT, "packages/rendercore/src/background")),
      readFileSync(
        join(REPO_ROOT, "packages/rendercore/src/spine/state-controller.ts"),
        "utf8",
      ),
    ].join("\n");
    expect(shared).not.toMatch(/game002|Nearwin|\bCN\b|\bWL\b|bg-win/);
    expect(shared).not.toMatch(
      /Math\.random|serverReel|server reel|token|cookie/i,
    );
  });
});

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return readSourceTree(path);
      return /\.(?:ts|tsx)$/u.test(entry.name)
        ? readFileSync(path, "utf8")
        : "";
    })
    .join("\n");
}
