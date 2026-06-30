import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadGameStaticYamlConfig,
  parseGameStaticYamlValue,
} from "../src/yaml-loader.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots = [];
});

describe("buildgamestatic YAML loader", () => {
  it("rejects unknown fields and unsupported reel kinds", () => {
    expect(() =>
      parseGameStaticYamlValue(
        { ...createYamlObject(), extra: true },
        { rootDir: createFixtureRoot(), inputPath: "game.yaml" },
      ),
    ).toThrow(/未知字段 "extra"/);

    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, kind: "grid-cell" },
        },
        { rootDir: createFixtureRoot(), inputPath: "game.yaml" },
      ),
    ).toThrow(/只支持 reel.kind=normal/);
  });

  it("rejects invalid scalar values before generation", () => {
    const root = createFixtureRoot();
    const cases: Array<readonly [unknown, RegExp]> = [
      [{ ...createYamlObject(), schemaVersion: 2 }, /schemaVersion/],
      [
        {
          ...createYamlObject(),
          live: { ...createYamlObject().live, serverUrl: "https://bad.test" },
        },
        /ws:\/\/ 或 wss:\/\//,
      ],
      [
        { ...createYamlObject(), supportedSkins: ["1", "1"] },
        /supportedSkins 包含重复值/,
      ],
      [
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, direction: "sideways" },
        },
        /reel.direction/,
      ],
      [
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, reelCount: 0 },
        },
        /reel.reelCount 必须是正整数/,
      ],
      [
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, startDelayMs: -1 },
        },
        /reel.startDelayMs 必须是有限非负数/,
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              symbols: {
                ...createYamlObject().skins["1"].symbols,
                requireExplicitScale: "yes",
              },
            },
          },
        },
        /requireExplicitScale/,
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              symbols: {
                ...createYamlObject().skins["1"].symbols,
                requiredStates: ["spinBlur", "spinBlur"],
              },
            },
          },
        },
        /requiredStates 包含重复值/,
      ],
    ];

    for (const [value, pattern] of cases) {
      expect(() =>
        parseGameStaticYamlValue(value, {
          rootDir: root,
          inputPath: "game.yaml",
        }),
      ).toThrow(pattern);
    }
  });

  it("rejects missing referenced files and invalid path shapes", () => {
    const root = createFixtureRoot();
    writeFileSync(
      join(root, "apps/game003/config/game-static.yaml"),
      createYamlText({ gameConfig: "assets/missing.json" }),
      "utf8",
    );

    expect(() =>
      loadGameStaticYamlConfig({
        rootDir: root,
        inputPath: "apps/game003/config/game-static.yaml",
      }),
    ).toThrow(/引用文件不存在/);

    expect(() =>
      parseGameStaticYamlValue(
        { ...createYamlObject(), gameConfig: "../bad.json" },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/不能包含/);
  });

  it("loads a valid YAML fixture with comments ignored", () => {
    const root = createFixtureRoot();
    writeFileSync(
      join(root, "apps/game003/config/game-static.yaml"),
      createYamlText(),
      "utf8",
    );

    const config = loadGameStaticYamlConfig({
      rootDir: root,
      inputPath: "apps/game003/config/game-static.yaml",
    });

    expect(config.gameId).toBe("game003");
    expect(config.skins["1"].art.variants.portrait.minFocusMargin).toEqual({
      left: 22,
      right: 22,
    });
  });
});

function createFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buildgamestatic-yaml-"));
  roots.push(root);
  for (const dir of [
    "apps/game003/config",
    "assets/gamecfg003",
    "assets/game003-s1",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
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
  return root;
}

function createYamlObject() {
  return {
    schemaVersion: 1,
    gameId: "game003",
    brandLabel: "game003",
    live: {
      serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
      gamecode: "EfedJuHEaydXNghnmO9KI",
      rejectQueryParams: ["serverUrl"],
    },
    supportedSkins: ["1"],
    gameConfig: "assets/gamecfg003/gameconfig.json",
    reel: {
      kind: "normal",
      reelsName: "bg-reel01",
      reelCount: 5,
      visibleRows: 5,
      direction: "forward",
      minimumSpinCycles: 8,
      baseDurationMs: 1300,
      speedSymbolsPerSecond: 44,
      startDelayMs: 80,
      stopDelayMs: 120,
    },
    skins: {
      "1": {
        label: "skin 1",
        symbols: {
          manifest: "assets/game003-s1/symbol-state-textures.manifest.json",
          pngGlob: "assets/game003-s1/*.png",
          emptySymbols: [],
          requireExplicitScale: true,
          requiredStates: ["spinBlur", "disabled"],
        },
        art: {
          mode: "orientation-focus",
          scenePartGap: 10,
          variants: {
            landscape: {
              background: {
                path: "assets/game003-s1/bg1.jpg",
                width: 2000,
                height: 2000,
              },
              focusRect: { x: 288, y: 588, width: 1424, height: 824 },
              frameFocusRect: { width: 1424, height: 1061 },
              conveyor: {
                path: "assets/game003-s1/conveyor1.png",
                width: 284,
                height: 775,
                placement: "left-bottom-of-main-reel",
              },
            },
            portrait: {
              background: {
                path: "assets/game003-s1/bg2.jpg",
                width: 1174,
                height: 2000,
              },
              focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 },
              frameFocusRect: { width: 1130, height: 1061 },
              minFocusMargin: { left: 22, right: 22 },
              conveyor: {
                path: "assets/game003-s1/conveyor2.png",
                width: 934,
                height: 227,
                placement: "top-center-of-main-reel",
              },
            },
          },
          mainReelBackground: {
            path: "assets/game003-s1/mainreelbg.png",
            width: 1130,
            height: 824,
          },
          reelWindowInMainReelBackground: {
            x: 135,
            y: 87,
            width: 860,
            height: 650,
          },
        },
      },
    },
  };
}

function createYamlText(overrides: Record<string, string> = {}): string {
  return `# 人工注释不会参与程序语义
schemaVersion: 1
gameId: game003
brandLabel: game003
live:
  serverUrl: wss://gameserv.rgstest.slammerstudios.com/
  gamecode: EfedJuHEaydXNghnmO9KI
  rejectQueryParams:
    - serverUrl
supportedSkins:
  - "1"
gameConfig: ${overrides.gameConfig ?? "assets/gamecfg003/gameconfig.json"}
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
      requiredStates:
        - spinBlur
        - disabled
    art:
      mode: orientation-focus
      scenePartGap: 10
      variants:
        landscape:
          background:
            path: assets/game003-s1/bg1.jpg
            width: 2000
            height: 2000
          focusRect: { x: 288, y: 588, width: 1424, height: 824 }
          frameFocusRect: { width: 1424, height: 1061 }
          conveyor:
            path: assets/game003-s1/conveyor1.png
            width: 284
            height: 775
            placement: left-bottom-of-main-reel
        portrait:
          background:
            path: assets/game003-s1/bg2.jpg
            width: 1174
            height: 2000
          focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 }
          frameFocusRect: { width: 1130, height: 1061 }
          minFocusMargin: { left: 22, right: 22 }
          conveyor:
            path: assets/game003-s1/conveyor2.png
            width: 934
            height: 227
            placement: top-center-of-main-reel
      mainReelBackground:
        path: assets/game003-s1/mainreelbg.png
        width: 1130
        height: 824
      reelWindowInMainReelBackground:
        x: 135
        y: 87
        width: 860
        height: 650
`;
}
