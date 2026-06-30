import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateGameStaticConfigFile } from "../src/generator.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots = [];
});

describe("buildgamestatic generator", () => {
  it("generates deterministic relative imports and check mode detects drift", async () => {
    const root = createFixtureRoot();
    const options = {
      rootDir: root,
      inputPath: "apps/game003/config/game-static.yaml",
      outPath: "apps/game003/src/generated/game-static.generated.ts",
      gameId: "game003",
      check: false,
    };

    const first = await generateGameStaticConfigFile(options);
    const outPath = join(root, options.outPath);

    expect(first.changed).toBe(true);
    expect(existsSync(outPath)).toBe(true);
    expect(first.generated).toContain(
      'from "../../../../assets/game003-s1/bg1.jpg?url"',
    );
    expect(first.generated).toMatch(
      /import\.meta\.glob\(\s+"..\/..\/..\/..\/assets\/game003-s1\/\*\.png"/,
    );
    expect(first.generated).not.toContain(root);
    expect(first.generated).not.toMatch(/260630|Date|Math\.random/);

    const second = await generateGameStaticConfigFile(options);
    expect(second.changed).toBe(false);
    await expect(
      generateGameStaticConfigFile({ ...options, check: true }),
    ).resolves.toMatchObject({ checked: true });

    writeFileSync(outPath, "stale generated file", "utf8");
    await expect(
      generateGameStaticConfigFile({ ...options, check: true }),
    ).rejects.toThrow(/生成文件不同步/);
    expect(readFileSync(outPath, "utf8")).toBe("stale generated file");
  });

  it("fails when --game does not match YAML gameId", async () => {
    const root = createFixtureRoot();

    await expect(
      generateGameStaticConfigFile({
        rootDir: root,
        inputPath: "apps/game003/config/game-static.yaml",
        outPath: "apps/game003/src/generated/game-static.generated.ts",
        gameId: "game999",
        check: false,
      }),
    ).rejects.toThrow(/--game 必须/);
  });
});

function createFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buildgamestatic-generator-"));
  roots.push(root);
  for (const dir of [
    "apps/game003/config",
    "apps/game003/src/generated",
    "assets/gamecfg003",
    "assets/game003-s1",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []", "utf8");
  writeFileSync(join(root, "package.json"), "{}", "utf8");
  for (const file of [
    "assets/gamecfg003/gameconfig.json",
    "assets/game003-s1/symbol-state-textures.manifest.json",
    "assets/game003-s1/bg1.jpg",
    "assets/game003-s1/bg2.jpg",
    "assets/game003-s1/mainreelbg.png",
    "assets/game003-s1/conveyor1.png",
    "assets/game003-s1/conveyor2.png",
  ]) {
    writeFileSync(join(root, file), "{}", "utf8");
  }
  writeFileSync(
    join(root, "apps/game003/config/game-static.yaml"),
    `schemaVersion: 1
gameId: game003
brandLabel: game003
live:
  serverUrl: wss://gameserv.rgstest.slammerstudios.com/
  gamecode: EfedJuHEaydXNghnmO9KI
  rejectQueryParams: [serverUrl]
supportedSkins: ["1"]
gameConfig: assets/gamecfg003/gameconfig.json
reel:
  kind: normal
  reelsName: bg-reel01
  reelCount: 5
  visibleRows: 5
  direction: forward
  minimumSpinCycles: 8
  baseDurationMs: 1300
  speedSymbolsPerSecond: 44
  startDelayMs: 80
  stopDelayMs: 120
skins:
  "1":
    label: skin 1
    symbols:
      manifest: assets/game003-s1/symbol-state-textures.manifest.json
      pngGlob: assets/game003-s1/*.png
      emptySymbols: []
      requireExplicitScale: true
      requiredStates: [spinBlur, disabled]
    art:
      mode: orientation-focus
      scenePartGap: 10
      variants:
        landscape:
          background: { path: assets/game003-s1/bg1.jpg, width: 2000, height: 2000 }
          focusRect: { x: 288, y: 588, width: 1424, height: 824 }
          frameFocusRect: { width: 1424, height: 1061 }
          conveyor: { path: assets/game003-s1/conveyor1.png, width: 284, height: 775, placement: left-bottom-of-main-reel }
        portrait:
          background: { path: assets/game003-s1/bg2.jpg, width: 1174, height: 2000 }
          focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 }
          frameFocusRect: { width: 1130, height: 1061 }
          minFocusMargin: { left: 22, right: 22 }
          conveyor: { path: assets/game003-s1/conveyor2.png, width: 934, height: 227, placement: top-center-of-main-reel }
      mainReelBackground: { path: assets/game003-s1/mainreelbg.png, width: 1130, height: 824 }
      reelWindowInMainReelBackground: { x: 135, y: 87, width: 860, height: 650 }
`,
    "utf8",
  );
  return root;
}
