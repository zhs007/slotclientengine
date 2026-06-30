import { describe, expect, it } from "vitest";
import { GAME003_LOADING_RESOURCE_URLS } from "../src/generated/game-loading.generated.js";
import { GAME003_STATIC_CONFIG } from "../src/generated/game-static.generated.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 generated static config", () => {
  it("locks fixed live config, skin list and gameconfig reference", () => {
    expect(GAME003_STATIC_CONFIG).toMatchObject({
      schemaVersion: 1,
      gameId: "game003",
      brandLabel: "minecart2",
      live: {
        serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
        gamecode: "EfedJuHEaydXNghnmO9KI",
        rejectQueryParams: ["serverUrl"],
      },
      supportedSkins: ["1"],
      reel: {
        kind: "normal",
        reelsName: "bg-reel01",
        reelCount: 5,
        visibleRows: 5,
      },
    });
    expect(GAME003_STATIC_CONFIG.gameConfig).toBeTypeOf("object");
  });

  it("keeps art layout values equivalent to the pre-YAML game003 contract", () => {
    const art = GAME003_STATIC_CONFIG.skins["1"].art;

    expect(art.variants.landscape.focusRect).toEqual({
      x: 288,
      y: 588,
      width: 1424,
      height: 824,
    });
    expect(art.variants.portrait.focusRect).toEqual({
      x: 22,
      y: 469.5,
      width: 1130,
      height: 1061,
    });
    expect(art.variants.landscape.frameFocusRect).toEqual({
      width: 1424,
      height: 1061,
    });
    expect(art.reelAreaInMainReelBackground).toEqual({
      x: 124,
      y: 130,
      width: 885,
      height: 650,
      reelCount: 5,
      reelGap: 15,
      cellWidth: 165,
      cellHeight: 130,
    });
    expect(
      art.variants.landscape.mainReelBackgroundPositionInFocusRect,
    ).toEqual({
      x: 294,
      y: -10,
    });
    expect(art.variants.landscape.conveyor?.positionInFocusRect).toEqual({
      x: 0,
      y: 14.5,
    });
    expect(art.variants.portrait.mainReelBackgroundPositionInFocusRect).toEqual(
      {
        x: 0,
        y: 147,
      },
    );
    expect(art.variants.portrait.conveyor?.positionInFocusRect).toEqual({
      x: 98,
      y: -80,
    });
    expect(art).not.toHaveProperty(["scenePart", "Gap"].join(""));
    expect(art.variants.landscape.conveyor).not.toHaveProperty("placement");
  });

  it("uses manifest symbols and does not carry a second scale table in YAML output", () => {
    const skin = getGame003SkinConfig("1");

    expect(skin.displaySymbols).toContain("H1");
    expect(skin.displaySymbols).toContain("SC");
    expect(skin.emptySymbols).toEqual([]);
    expect(GAME003_STATIC_CONFIG.skins["1"].symbols).not.toHaveProperty(
      "scale",
    );
    expect(skin.symbolScales.H1).toBe(1);
    expect(skin.symbolScales.SC).toBe(1);
  });

  it("fails fast for skin ids outside the generated supported list", () => {
    expect(() => getGame003SkinConfig("2" as never)).toThrow(
      /Unknown game003 skin/,
    );
  });

  it("generates a separate lightweight loading resource config", () => {
    expect(GAME003_LOADING_RESOURCE_URLS.length).toBeGreaterThan(40);
    expect(
      GAME003_LOADING_RESOURCE_URLS.map((resource) => resource.id),
    ).toEqual(
      expect.arrayContaining([
        "game003-bg-landscape",
        "game003-bg-portrait",
        "game003-scene-parts:mainreelbg.png",
        "game003-symbol-normal-pngs:H1.png",
        "game003-symbol-spin-blur-pngs:H1.spinBlur.png",
        "game003-symbol-disabled-pngs:H1.disabled.png",
      ]),
    );
    expect(
      GAME003_LOADING_RESOURCE_URLS.some((resource) =>
        resource.id.startsWith("game003-symbol-normal-pngs:mainreelbg"),
      ),
    ).toBe(false);
  });
});
