import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCliArgs, runBuildGameStaticCli } from "../src/cli.js";

let roots: string[] = [];
const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots = [];
});

describe("buildgamestatic CLI args", () => {
  it("parses required args and check mode", () => {
    expect(
      parseCliArgs([
        "--",
        "--input",
        "apps/game003/config/game-static.yaml",
        "--out",
        "apps/game003/src/generated/game-static.generated.ts",
        "--game",
        "game003",
        "--check",
      ]),
    ).toEqual({
      inputPath: "apps/game003/config/game-static.yaml",
      outPath: "apps/game003/src/generated/game-static.generated.ts",
      loadingOutPath: undefined,
      gameId: "game003",
      rootDir: undefined,
      check: true,
    });
  });

  it("fails for missing, duplicate and unknown args", () => {
    expect(() =>
      parseCliArgs(["--out", "out.ts", "--game", "game003"]),
    ).toThrow(/--input/);
    expect(() =>
      parseCliArgs([
        "--input",
        "a.yaml",
        "--input",
        "b.yaml",
        "--out",
        "out.ts",
        "--game",
        "game003",
      ]),
    ).toThrow(/--input 不能重复/);
    expect(() =>
      parseCliArgs([
        "--input",
        "a.yaml",
        "--out",
        "out.ts",
        "--game",
        "game003",
        "--watch",
      ]),
    ).toThrow(/未知参数/);
    expect(() =>
      parseCliArgs(["--input", "--out", "out.ts", "--game", "game003"]),
    ).toThrow(/--input 需要/);
    expect(() =>
      parseCliArgs([
        "--input",
        "a.yaml",
        "--out",
        "out.ts",
        "--loading-out",
        "a.ts",
        "--loading-out",
        "b.ts",
        "--game",
        "game003",
      ]),
    ).toThrow(/--loading-out 不能重复/);
    expect(() =>
      parseCliArgs([
        "--input",
        "a.yaml",
        "--out",
        "out.ts",
        "--game",
        "game003",
        "--check",
        "--check",
      ]),
    ).toThrow(/--check 不能重复/);
    expect(() =>
      parseCliArgs(["--input", "a.yaml", "--game", "game003"]),
    ).toThrow(/--out/);
    expect(() =>
      parseCliArgs(["--input", "a.yaml", "--out", "out.ts"]),
    ).toThrow(/--game/);
  });

  it("runs the CLI success and failure paths without throwing", async () => {
    const root = createFixtureRoot();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await runBuildGameStaticCli([
      "--input",
      "apps/game003/config/game-static.yaml",
      "--out",
      "apps/game003/src/generated/game-static.generated.ts",
      "--game",
      "game003",
      "--root",
      root,
    ]);

    expect(logSpy).toHaveBeenCalledWith(
      "buildgamestatic 生成成功：apps/game003/src/generated/game-static.generated.ts",
    );
    expect(process.exitCode).toBe(originalExitCode);

    await runBuildGameStaticCli(["--bad"]);
    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.at(-1)?.[0]).toMatch(/未知参数/);
  });
});

function createFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buildgamestatic-cli-"));
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
      variants:
        landscape:
          background: { path: assets/game003-s1/bg1.jpg, width: 2000, height: 2000 }
          focusRect: { x: 288, y: 588, width: 1424, height: 824 }
          frameFocusRect: { width: 1424, height: 1061 }
          mainReelBackgroundPositionInFocusRect: { x: 294, y: -10 }
          conveyor:
            path: assets/game003-s1/conveyor1.png
            width: 284
            height: 775
            positionInFocusRect: { x: 0, y: 14.5 }
        portrait:
          background: { path: assets/game003-s1/bg2.jpg, width: 1174, height: 2000 }
          focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 }
          frameFocusRect: { width: 1130, height: 1061 }
          minFocusMargin: { left: 22, right: 22 }
          mainReelBackgroundPositionInFocusRect: { x: 0, y: 147 }
          conveyor:
            path: assets/game003-s1/conveyor2.png
            width: 934
            height: 227
            positionInFocusRect: { x: 98, y: -80 }
      mainReelBackground: { path: assets/game003-s1/mainreelbg.png, width: 1130, height: 824 }
      reelWindowInMainReelBackground: { x: 135, y: 87, width: 860, height: 650 }
`,
    "utf8",
  );
  return root;
}
