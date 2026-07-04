import { describe, expect, it } from "vitest";
import {
  GAME003_LOADING_RESOURCE_URLS,
  game003ExpandGeneratedLoadingResourceUrls,
} from "../src/generated/game-loading.generated.js";
import {
  GAME003_RUNTIME_MODULE_RESOURCE_ID,
  createGame003LoadingResources,
  readGame003RuntimeModule,
} from "../src/loading-resources.js";

describe("game003 loading resources", () => {
  it("combines generated asset resources with the dynamic runtime module", () => {
    const resources = createGame003LoadingResources();
    const ids = resources.map((resource) => resource.id);
    const urls = resources
      .map((resource) => resource.url)
      .filter((url): url is string => typeof url === "string");

    expect(ids.at(-1)).toBe(GAME003_RUNTIME_MODULE_RESOURCE_ID);
    expect(resources.at(-1)?.load).toBeTypeOf("function");
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "game003-bg-landscape",
        "game003-bg-portrait",
        "game003-scene-parts:conveyor1.png",
        "game003-scene-parts:conveyor2.png",
        "game003-scene-parts:mainreelbg.png",
        "game003-symbol-normal-pngs:SC.png",
        "game003-symbol-spin-blur-pngs:SC.spinBlur.png",
        "game003-symbol-disabled-pngs:SC.disabled.png",
        "game003-symbol-vni-projects:L1-wins.json",
        "game003-symbol-vni-projects:L2-wins.json",
        "game003-symbol-vni-projects:L3-wins.json",
        "game003-symbol-vni-projects:L4-wins.json",
        "game003-symbol-vni-projects:L5-wins.json",
        "game003-symbol-spine-skeletons:WL.json",
        "game003-symbol-spine-skeletons:H1.json",
        "game003-symbol-spine-skeletons:H5.json",
        "game003-symbol-spine-skeletons:CL.json",
        "game003-symbol-spine-skeletons:SC.json",
        "game003-symbol-spine-atlas",
        "game003-symbol-spine-texture",
        "game003-bg-bar-symbol-pngs:up.png",
        "game003-bg-bar-symbol-pngs:wild.png",
        "game003-bg-bar-symbol-manifest",
        "game003-minecart",
        "game003-win-amount-vni-projects:bigwin.json",
        "game003-win-amount-vni-projects:superwin.json",
        "game003-win-amount-vni-projects:megawin.json",
      ]),
    );
    for (const assetPrefix of [
      "j1_asset",
      "k_asset",
      "q_asset",
      "j_asset",
      "10_asset",
    ]) {
      expect(
        ids.some((id) =>
          id.startsWith(`game003-symbol-vni-assets:${assetPrefix}`),
        ),
      ).toBe(true);
    }
    expect(
      ids.some((id) =>
        id.startsWith("game003-win-amount-vni-assets:mega_asset"),
      ),
    ).toBe(true);
    expect(
      ids.some((id) => id.startsWith("game003-symbol-spine-skeletons:L1")),
    ).toBe(false);
    expect(
      ids.some((id) => id.startsWith("game003-symbol-spine-skeletons:bg")),
    ).toBe(false);
    expect(ids).not.toContain("game003-symbol-normal-pngs:mainreelbg.png");
  });

  it("keeps generated glob expansion stable and fail-fast", () => {
    const expanded = game003ExpandGeneratedLoadingResourceUrls(
      [],
      [
        {
          id: "group",
          modules: {
            "/assets/z.png": "/z.png",
            "/assets/a.png": "/a.png",
          },
          weight: 4,
        },
      ],
    );

    expect(expanded).toEqual([
      { id: "group:a.png", url: "/a.png", weight: 2 },
      { id: "group:z.png", url: "/z.png", weight: 2 },
    ]);
    expect(() =>
      game003ExpandGeneratedLoadingResourceUrls(
        [{ id: "dup:asset.png", url: "/a.png" }],
        [{ id: "dup", modules: { "/asset.png": "/b.png" } }],
      ),
    ).toThrow(/Duplicate loading resource id/);
    expect(
      game003ExpandGeneratedLoadingResourceUrls(
        [{ id: "a", url: "/dup.png" }],
        [{ id: "b", modules: { "/b.png": "/dup.png" } }],
      ),
    ).toEqual([{ id: "a", url: "/dup.png" }]);
    expect(() =>
      game003ExpandGeneratedLoadingResourceUrls(
        [],
        [{ id: "empty", modules: {} }],
      ),
    ).toThrow(/matched no files/);
  });

  it("exposes a validated runtime module resource", () => {
    const runtime = {
      prepareGame003At99: async () => ({ liveSession: { disconnect() {} } }),
      enterGame003: async () => ({ destroy() {} }),
    };
    expect(
      readGame003RuntimeModule(
        new Map([[GAME003_RUNTIME_MODULE_RESOURCE_ID, runtime]]),
      ),
    ).toBe(runtime);
    expect(() => readGame003RuntimeModule(new Map())).toThrow(/not loaded/);
    expect(() =>
      readGame003RuntimeModule(
        new Map([[GAME003_RUNTIME_MODULE_RESOURCE_ID, {}]]),
      ),
    ).toThrow(/required exports/);
  });

  it("does not expose runtime secrets through loading resource URLs", () => {
    const serialized = JSON.stringify(GAME003_LOADING_RESOURCE_URLS);

    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/serverUrl/);
    expect(serialized).not.toMatch(/gameserv/);
  });
});
