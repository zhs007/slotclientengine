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

  it("generates and checks the lightweight loading resource module", async () => {
    const root = createFixtureRoot();
    appendLoadingBlock(root);
    const options = {
      rootDir: root,
      inputPath: "apps/game003/config/game-static.yaml",
      outPath: "apps/game003/src/generated/game-static.generated.ts",
      loadingOutPath: "apps/game003/src/generated/game-loading.generated.ts",
      gameId: "game003",
      check: false,
    };

    const result = await generateGameStaticConfigFile(options);
    const loadingOutPath = join(root, options.loadingOutPath);

    expect(result.loadingChanged).toBe(true);
    expect(existsSync(loadingOutPath)).toBe(true);
    expect(result.loadingGenerated).toContain("GAME003_LOADING_RESOURCE_URLS");
    expect(result.loadingGenerated).toContain("import.meta.glob");
    expect(result.loadingGenerated).toContain(
      "assets/game003-s1/{conveyor1,conveyor2,mainreelbg}.png",
    );
    expect(result.loadingGenerated).not.toContain("rawGameConfig");
    await expect(
      generateGameStaticConfigFile({ ...options, check: true }),
    ).resolves.toMatchObject({ checked: true, loadingChanged: false });

    writeFileSync(loadingOutPath, "stale loading generated file", "utf8");
    await expect(
      generateGameStaticConfigFile({ ...options, check: true }),
    ).rejects.toThrow(/game-loading\.generated\.ts/);
  });

  it("generates optional VNI symbol module maps only when configured", async () => {
    const root = createFixtureRoot();
    appendVniSymbolGlobs(root);

    const result = await generateGameStaticConfigFile({
      rootDir: root,
      inputPath: "apps/game003/config/game-static.yaml",
      outPath: "apps/game003/src/generated/game-static.generated.ts",
      gameId: "game003",
      check: false,
    });

    expect(result.generated).toContain("game003Skin1VniProjectModules");
    expect(result.generated).toContain("game003Skin1VniAssetModules");
    expect(result.generated).toMatch(
      /import\.meta\.glob\(\s+"..\/..\/..\/..\/assets\/game003-s1\/\*-wins\.json"/,
    );
    expect(result.generated).toMatch(
      /import\.meta\.glob\(\s+"..\/..\/..\/..\/assets\/game003-s1\/assets\/\*\.{png,jpg,jpeg,webp}"/,
    );
    expect(result.generated).toContain(
      "vniProjectModules: game003Skin1VniProjectModules",
    );
    expect(result.generated).toContain(
      "vniAssetModules: game003Skin1VniAssetModules",
    );
  });

  it("generates optional win amount module maps and config", async () => {
    const root = createFixtureRoot();
    appendWinAmountBlock(root);

    const result = await generateGameStaticConfigFile({
      rootDir: root,
      inputPath: "apps/game003/config/game-static.yaml",
      outPath: "apps/game003/src/generated/game-static.generated.ts",
      gameId: "game003",
      check: false,
    });

    expect(result.generated).toContain("game003Skin1WinAmountProjectModules");
    expect(result.generated).toContain("game003Skin1WinAmountAssetModules");
    expect(result.generated).toContain("winAmount: Object.freeze");
    expect(result.generated).toMatch(
      /import\.meta\.glob\(\s+"..\/..\/..\/..\/assets\/game003-s1\/win-amount\/\{bigwin,superwin,megawin\}\.json"/,
    );
    expect(result.generated).toContain('project: "./megawin.json"');
    expect(result.generated).toContain("durationSeconds: 5");
  });

  it("generates optional feature bar manifest, module map and config", async () => {
    const root = createFixtureRoot();
    appendFeatureBarsBlock(root);

    const result = await generateGameStaticConfigFile({
      rootDir: root,
      inputPath: "apps/game003/config/game-static.yaml",
      outPath: "apps/game003/src/generated/game-static.generated.ts",
      gameId: "game003",
      check: false,
    });

    expect(result.generated).toContain(
      "game003Skin1FeatureTrackFeatureBarSymbolManifest",
    );
    expect(result.generated).toContain(
      "game003Skin1FeatureTrackFeatureBarSymbolModules",
    );
    expect(result.generated).toContain("featureBars: Object.freeze");
    expect(result.generated).toContain('componentName: "feature-track"');
    expect(result.generated).toContain("requiredStates: Object.freeze([]");
    expect(result.generated).toMatch(
      /import\.meta\.glob\(\s+"..\/..\/..\/..\/assets\/game003-s1\/\{bonus,boost\}\.png"/,
    );
  });

  it("requires --loading-out exactly when YAML loading resources are present", async () => {
    const root = createFixtureRoot();
    appendLoadingBlock(root);

    await expect(
      generateGameStaticConfigFile({
        rootDir: root,
        inputPath: "apps/game003/config/game-static.yaml",
        outPath: "apps/game003/src/generated/game-static.generated.ts",
        gameId: "game003",
        check: false,
      }),
    ).rejects.toThrow(/--loading-out/);

    const noLoadingRoot = createFixtureRoot();
    await expect(
      generateGameStaticConfigFile({
        rootDir: noLoadingRoot,
        inputPath: "apps/game003/config/game-static.yaml",
        outPath: "apps/game003/src/generated/game-static.generated.ts",
        loadingOutPath: "apps/game003/src/generated/game-loading.generated.ts",
        gameId: "game003",
        check: false,
      }),
    ).rejects.toThrow(/loading.resources/);
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
    "assets/game003-s1/assets",
    "assets/game003-s1/win-amount",
    "assets/game003-s1/win-amount/assets",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []", "utf8");
  writeFileSync(join(root, "package.json"), "{}", "utf8");
  for (const file of [
    "assets/gamecfg003/gameconfig.json",
    "assets/game003-s1/symbol-state-textures.manifest.json",
    "assets/game003-s1/feature-bar-symbols.manifest.json",
    "assets/game003-s1/bonus.png",
    "assets/game003-s1/boost.png",
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
      reelAreaInMainReelBackground: { x: 124, y: 130, reelCount: 5, reelGap: 15, cellWidth: 165, cellHeight: 130 }
`,
    "utf8",
  );
  return root;
}

function appendFeatureBarsBlock(root: string): void {
  const yamlPath = join(root, "apps/game003/config/game-static.yaml");
  writeFileSync(
    yamlPath,
    readFileSync(yamlPath, "utf8").replace(
      "    art:\n",
      `    featureBars:
      featureTrack:
        componentName: feature-track
        queueLength: 5
        visibleCount: 4
        terminalSlotIndex: 4
        emptyFeature: empty
        allowedFeatures: [empty, bonus, boost]
        symbols:
          manifest: assets/game003-s1/feature-bar-symbols.manifest.json
          pngGlob: assets/game003-s1/{bonus,boost}.png
          requireExplicitScale: true
          requiredStates: []
        layout:
          landscape:
            movement: down
            slotRectsInConveyor:
              - { x: 56, y: 72, width: 172, height: 158 }
              - { x: 56, y: 204, width: 172, height: 158 }
              - { x: 56, y: 336, width: 172, height: 158 }
              - { x: 56, y: 468, width: 172, height: 158 }
              - { x: 56, y: 601, width: 172, height: 158 }
          portrait:
            movement: right
            slotRectsInConveyor:
              - { x: 49, y: 35, width: 172, height: 158 }
              - { x: 207, y: 35, width: 172, height: 158 }
              - { x: 365, y: 35, width: 172, height: 158 }
              - { x: 523, y: 35, width: 172, height: 158 }
              - { x: 681, y: 35, width: 172, height: 158 }
    art:\n`,
    ),
    "utf8",
  );
}

function appendVniSymbolGlobs(root: string): void {
  const yamlPath = join(root, "apps/game003/config/game-static.yaml");
  writeFileSync(
    yamlPath,
    readFileSync(yamlPath, "utf8").replace(
      "      pngGlob: assets/game003-s1/*.png\n",
      [
        "      pngGlob: assets/game003-s1/*.png",
        "      vniProjectGlob: assets/game003-s1/*-wins.json",
        "      vniAssetGlob: assets/game003-s1/assets/*.{png,jpg,jpeg,webp}",
        "",
      ].join("\n"),
    ),
    "utf8",
  );
}

function writeWinAmountFixtureFiles(root: string): void {
  for (const file of ["bigwin.json", "superwin.json", "megawin.json"]) {
    writeFileSync(
      join(root, `assets/game003-s1/win-amount/${file}`),
      JSON.stringify({ stage: { duration: file === "megawin.json" ? 10 : 5 } }),
      "utf8",
    );
  }
}

function appendWinAmountBlock(root: string): void {
  writeWinAmountFixtureFiles(root);
  const yamlPath = join(root, "apps/game003/config/game-static.yaml");
  writeFileSync(
    yamlPath,
    `${readFileSync(yamlPath, "utf8")}
    winAmount:
      amountScale: 100
      currency: USD
      locale: en-US
      minorCountDurationSeconds: 1.5
      majorCountDurationSeconds: 3
      thresholds:
        minorMultiplier: 1
        bigMultiplier: 15
        superMultiplier: 30
        megaMultiplier: 50
      text:
        minorFontSize: 54
        majorFontSize: 118
        fill: "#fff7d6"
        stroke: "#5a2500"
        strokeWidth: 8
      layout:
        minorAnchor: reel-area-bottom-center
        majorAnchor: reel-area-center
        minorOffset: { x: 0, y: -28 }
        majorOffset: { x: 0, y: 0 }
      animations:
        projectGlob: assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json
        assetGlob: assets/game003-s1/win-amount/assets/*.{png,jpg,jpeg,webp}
        tiers:
          - id: bigwin
            thresholdMultiplier: 15
            project: ./bigwin.json
            durationSeconds: 5
            loopStartTime: 1
            loopEndTime: 4
            keepParticlesAlive: true
          - id: superwin
            thresholdMultiplier: 30
            project: ./superwin.json
            durationSeconds: 5
            loopStartTime: 1
            loopEndTime: 4
            keepParticlesAlive: true
          - id: megawin
            thresholdMultiplier: 50
            project: ./megawin.json
            durationSeconds: 5
            loopStartTime: 1
            loopEndTime: 4
            keepParticlesAlive: true
`,
    "utf8",
  );
}

function appendLoadingBlock(root: string): void {
  const yamlPath = join(root, "apps/game003/config/game-static.yaml");
  writeFileSync(
    yamlPath,
    `${readFileSync(yamlPath, "utf8")}
loading:
  resources:
    - id: game003-bg-landscape
      path: assets/game003-s1/bg1.jpg
      weight: 8
    - id: game003-scene-parts
      glob: assets/game003-s1/{conveyor1,conveyor2,mainreelbg}.png
      weight: 6
`,
    "utf8",
  );
}
