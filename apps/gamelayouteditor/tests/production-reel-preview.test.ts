import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseSymbolPackageGameConfig,
  parseSymbolStateTextureManifest,
} from "@slotclientengine/rendercore/symbol/data";
import { describe, expect, it } from "vitest";
import {
  inspectReelSets,
  sampleRandomReelScene,
} from "../src/preview/random-reel-scene.js";

const craveRoot = resolve(process.cwd(), "../../assets/fixtures/crave-mapped");
const craveMap = JSON.parse(
  readFileSync(resolve(craveRoot, "assets.map.json"), "utf8"),
) as { readonly files: Readonly<Record<string, { readonly path: string }>> };
const minecart2Root = resolve(
  process.cwd(),
  "../../assets/fixtures/minecart2-mapped",
);
const minecart2Map = JSON.parse(
  readFileSync(resolve(minecart2Root, "assets.map.json"), "utf8"),
) as { readonly files: Readonly<Record<string, { readonly path: string }>> };

function readCraveJson(key: string): unknown {
  const path = craveMap.files[key]?.path;
  if (!path) throw new Error(`Crave fixture "${key}" is unavailable.`);
  return JSON.parse(readFileSync(resolve(craveRoot, path), "utf8")) as unknown;
}

function readMinecart2Json(key: string): unknown {
  const path = minecart2Map.files[key]?.path;
  if (!path) throw new Error(`Minecart2 fixture "${key}" is unavailable.`);
  return JSON.parse(
    readFileSync(resolve(minecart2Root, path), "utf8"),
  ) as unknown;
}

describe("production public reel preview compatibility", () => {
  it.each([
    {
      gameConfig: () => readJson("../../../assets/gamecfg002/gameconfig.json"),
      symbolManifest: () =>
        readCraveJson("pkg-10-game002-s3-symbol-state-textures.manifest.json"),
      reelSet: "reels-001",
      columns: 6,
    },
    {
      gameConfig: () => readMinecart2Json("pkg-9-minecart2-gameconfig.json"),
      symbolManifest: () =>
        readMinecart2Json(
          "pkg-9-minecart2-symbol-state-textures.manifest.json",
        ),
      reelSet: "bg-reel01",
      columns: 5,
    },
  ])(
    "validates and samples $reelSet without reading server reels",
    ({ gameConfig, symbolManifest, reelSet, columns }) => {
      const parsedConfig = parseSymbolPackageGameConfig(gameConfig());
      const manifest = parseSymbolStateTextureManifest(symbolManifest());
      const displaySymbols = Object.keys(manifest.symbols);
      const infos = inspectReelSets({
        gameConfig: parsedConfig.gameConfig,
        displaySymbols,
        columns,
      });
      expect(infos.find((info) => info.name === reelSet)).toEqual({
        name: reelSet,
        reelCount: columns,
        compatible: true,
      });
      const scene = sampleRandomReelScene({
        gameConfig: parsedConfig.gameConfig,
        displaySymbols,
        reelSetName: reelSet,
        columns,
        rows: 4,
        randomSource: { nextUint32: () => 0 },
      });
      const reels = parsedConfig.gameConfig.getReels(reelSet);
      expect(scene.stopYs).toEqual(Array.from({ length: columns }, () => 0));
      for (let x = 0; x < columns; x += 1) {
        for (let y = 0; y < 4; y += 1) {
          expect(scene.codes[x][y]).toBe(reels.get(x, y));
        }
      }
    },
  );

  it("exposes game002 bgcoinweight while keeping game003 table-free", () => {
    const game002 = parseSymbolPackageGameConfig(
      readJson("../../../assets/gamecfg002/gameconfig.json"),
    ).gameConfig;
    expect(game002.getNumberWeightTableNames()).toEqual(["bgcoinweight"]);
    expect(game002.getNumberWeightTable("bgcoinweight")).toEqual([
      { value: 1, weight: 100 },
      { value: 2, weight: 75 },
      { value: 5, weight: 30 },
      { value: 10, weight: 5 },
      { value: 25, weight: 5 },
      { value: 50, weight: 5 },
      { value: 100, weight: 5 },
      { value: 250, weight: 5 },
      { value: 500, weight: 5 },
      { value: 1000, weight: 5 },
    ]);

    const game003 = parseSymbolPackageGameConfig(
      readJson("../../../assets/gamecfg003/gameconfig.json"),
    ).gameConfig;
    expect(game003.getNumberWeightTableNames()).toEqual([]);
  });
});

function readJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  ) as unknown;
}
