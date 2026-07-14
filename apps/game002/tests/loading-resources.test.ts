import { describe, expect, it } from "vitest";
import bigwinProject from "../../../assets/game002-s3/win-amount/bigwin.json";
import megawinProject from "../../../assets/game002-s3/win-amount/megawin.json";
import superwinProject from "../../../assets/game002-s3/win-amount/superwin.json";
import {
  GAME002_LOADING_RESOURCE_URLS,
  GAME002_RUNTIME_MODULE_RESOURCE_ID,
  createGame002LoadingResources,
  readGame002RuntimeModule,
} from "../src/loading-resources.js";

describe("game002 loading resources", () => {
  it("loads the exact s3 symbol, Spine and win-amount closure before runtime", () => {
    const resources = createGame002LoadingResources();
    const ids = resources.map((resource) => resource.id);
    const urls = resources
      .map((resource) => resource.url)
      .filter((url): url is string => typeof url === "string");

    expect(ids.at(-1)).toBe(GAME002_RUNTIME_MODULE_RESOURCE_ID);
    expect(resources.at(-1)?.load).toBeTypeOf("function");
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
    for (const symbol of [
      "WL",
      "H1",
      "H2",
      "L1",
      "L2",
      "L3",
      "L4",
      "WM",
      "CN",
      "CM",
      "CO",
      "AF",
      "BN",
    ]) {
      expect(ids).toContain(`game002-symbol-normal-pngs:${symbol}.png`);
      expect(ids).toContain(
        `game002-symbol-spin-blur-pngs:${symbol}.spinBlur.png`,
      );
      expect(ids).toContain(
        `game002-symbol-disabled-pngs:${symbol}.disabled.png`,
      );
    }
    for (const symbol of [
      "WL",
      "H1",
      "H2",
      "L1",
      "L2",
      "L3",
      "L4",
      "WM",
      "CM",
      "CO",
      "AF",
      "BN",
    ]) {
      expect(ids).toContain(`game002-symbol-spine-skeletons:${symbol}.json`);
    }
    expect(
      ids.filter((id) => id.startsWith("game002-symbol-normal-pngs:")),
    ).toHaveLength(13);
    expect(
      ids.filter((id) => id.startsWith("game002-symbol-spine-skeletons:")),
    ).toHaveLength(12);
    expect(ids).toEqual(
      expect.arrayContaining([
        "game002-background-manifest",
        "game002-background-spine-skeleton",
        "game002-background-spine-atlas",
        "game002-symbol-manifest",
        "game002-symbol-spine-atlas",
        "game002-symbol-spine-texture",
        "game002-win-amount-manifest",
        "game002-win-amount-vni-projects:bigwin.json",
        "game002-win-amount-vni-projects:superwin.json",
        "game002-win-amount-vni-projects:megawin.json",
      ]),
    );
    expect(
      ids
        .filter((id) => id.startsWith("game002-background-spine-textures:"))
        .sort(),
    ).toEqual(
      [
        "game002-background-spine-textures:BG.png",
        "game002-background-spine-textures:BG_2.png",
        "game002-background-spine-textures:BG_3.png",
        "game002-background-spine-textures:BG_4.png",
        "game002-background-spine-textures:BG_5.png",
        "game002-background-spine-textures:BG_6.png",
        "game002-background-spine-textures:BG_7.png",
        "game002-background-spine-textures:BG_8.png",
      ].sort(),
    );
    expect(JSON.stringify(resources)).not.toContain("bg.jpg");
    for (const resource of resources.filter((candidate) =>
      candidate.id.startsWith("game002-background-spine-textures:"),
    )) {
      expect(resource.url).toContain("spineAtlasPage=");
    }
    const referencedAssetIds = getReferencedWinAmountAssetIds();
    expect(
      ids
        .filter((id) => id.startsWith("game002-win-amount-vni-assets:"))
        .sort(),
    ).toEqual(referencedAssetIds);
    for (const excluded of [
      "CN_1",
      "CN_2",
      "CN_3",
      "CN_4",
      "Nearwin",
      "WM_Fx",
      "Reel_CO_CM",
      "Special Feature",
    ]) {
      expect(ids.some((id) => id.includes(excluded))).toBe(false);
    }
  });

  it("validates the runtime module exports", () => {
    const runtime = {
      prepareGame002At99: async () => ({ liveSession: { disconnect() {} } }),
      enterGame002: async () => ({ destroy() {} }),
    };
    expect(
      readGame002RuntimeModule(
        new Map([[GAME002_RUNTIME_MODULE_RESOURCE_ID, runtime]]),
      ),
    ).toBe(runtime);
    expect(() => readGame002RuntimeModule(new Map())).toThrow(/not loaded/);
    expect(() =>
      readGame002RuntimeModule(
        new Map([[GAME002_RUNTIME_MODULE_RESOURCE_ID, {}]]),
      ),
    ).toThrow(/required exports/);
  });

  it("never exposes live secrets in static loading URLs", () => {
    const serialized = JSON.stringify(GAME002_LOADING_RESOURCE_URLS);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/serverUrl/);
    expect(serialized).not.toMatch(/gameserv/);
  });
});

function getReferencedWinAmountAssetIds(): string[] {
  return [bigwinProject, superwinProject, megawinProject]
    .flatMap((project) => project.assets)
    .map((asset) => {
      const filename = asset.path.split("/").at(-1);
      if (!filename) {
        throw new Error(`bad win amount asset path ${asset.path}`);
      }
      return `game002-win-amount-vni-assets:${filename}`;
    })
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .sort();
}
