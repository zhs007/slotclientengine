import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createSymbolLandingAppearSymbolsFromManifest,
  createSymbolValuePresentationResourcesFromManifest,
  parseSymbolStateTextureManifest,
} from "../../src/index.js";

const root = new URL("../../../../assets/game002-s3/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("symbol-state-textures.manifest.json", root), "utf8"),
);

describe("symbol value presentation manifest resources", () => {
  it("accepts generic one, three and five tier manifests", () => {
    for (const count of [1, 3, 5]) {
      const copy = createGenericManifest(count);
      const tiers =
        parseSymbolStateTextureManifest(copy).symbols.GOLD.valuePresentation
          ?.tiers;
      expect(tiers).toHaveLength(count);
      expect(tiers?.at(-1)?.maxExclusive).toBeUndefined();
    }
  });

  it("parses and deeply freezes the current arbitrary tier configuration", () => {
    const parsed = parseSymbolStateTextureManifest(manifest, {
      requiredStates: ["spinBlur", "disabled"],
    });
    const presentation = parsed.symbols.CN.valuePresentation;
    expect(presentation?.tiers.map((tier) => tier.maxExclusive)).toEqual([
      10,
      100,
      1000,
      undefined,
    ]);
    expect(Object.isFrozen(presentation?.tiers)).toBe(true);
    expect(parsed.symbols.CN.animations.appear).toEqual({
      kind: "activeSpine",
      playback: {
        mode: "animation",
        animationName: "Start",
        loop: false,
      },
    });
    expect(Object.isFrozen(presentation?.text)).toBe(true);
    expect(presentation?.text).toEqual({
      type: "image",
      slot: "Num",
      x: 0,
      y: 0,
      prefix: "./",
    });
    expect(Object.isFrozen(presentation?.reelStates)).toBe(true);
    expect(parsed.symbols.CN.normal).toEqual({
      kind: "transparent",
      width: 200,
      height: 200,
    });
    expect(
      createSymbolLandingAppearSymbolsFromManifest({
        manifest,
        displaySymbols: Object.keys(manifest.symbols),
      }),
    ).toEqual([
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
    ]);
  });

  it("resolves and validates all current official Spine resources", () => {
    const skeletons = Object.fromEntries(
      ["CN_1", "CN_2", "CN_3", "CN_4"].map((name) => [
        `./${name}.json`,
        JSON.parse(readFileSync(new URL(`${name}.json`, root), "utf8")),
      ]),
    );
    const resources = createSymbolValuePresentationResourcesFromManifest({
      manifest,
      requiredStates: ["spinBlur", "disabled"],
      spineSkeletonModules: skeletons,
      spineAtlasModules: {
        "./Symbol.atlas": readFileSync(new URL("Symbol.atlas", root), "utf8"),
      },
      spineTextureModules: { "./Symbol.png": "/Symbol.png" },
      textImageModules: Object.fromEntries(
        [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].map((value) => [
          `./${value}.png`,
          `/${value}.png`,
        ]),
      ),
    });
    expect(resources.CN.tiers).toHaveLength(4);
    expect(resources.CN.tiers.map((tier) => tier.spec.skeleton)).toEqual([
      "./CN_1.json",
      "./CN_2.json",
      "./CN_3.json",
      "./CN_4.json",
    ]);
    expect(resources.CN.textImageUrls).toEqual({
      1: "/1.png",
      2: "/2.png",
      5: "/5.png",
      10: "/10.png",
      25: "/25.png",
      50: "/50.png",
      100: "/100.png",
      250: "/250.png",
      500: "/500.png",
      1000: "/1000.png",
    });
  });

  it("fails when an image-rendered value has no exact image module", () => {
    const skeletons = Object.fromEntries(
      ["CN_1", "CN_2", "CN_3", "CN_4"].map((name) => [
        `./${name}.json`,
        JSON.parse(readFileSync(new URL(`${name}.json`, root), "utf8")),
      ]),
    );
    expect(() =>
      createSymbolValuePresentationResourcesFromManifest({
        manifest,
        requiredStates: ["spinBlur", "disabled"],
        spineSkeletonModules: skeletons,
        spineAtlasModules: {
          "./Symbol.atlas": readFileSync(new URL("Symbol.atlas", root), "utf8"),
        },
        spineTextureModules: { "./Symbol.png": "/Symbol.png" },
        textImageModules: { "./1.png": "/1.png" },
      }),
    ).toThrow(/value image 2.*missing/i);
  });

  it("rejects a configured text slot missing from any tier skeleton", () => {
    const skeleton = JSON.parse(
      readFileSync(new URL("CN_1.json", root), "utf8"),
    );
    expect(() =>
      createSymbolValuePresentationResourcesFromManifest({
        manifest: {
          ...createGenericManifest(1),
          symbols: {
            GOLD: {
              ...createGenericManifest(1).symbols.GOLD,
              valuePresentation: {
                ...createGenericManifest(1).symbols.GOLD.valuePresentation,
                text: {
                  ...createGenericManifest(1).symbols.GOLD.valuePresentation
                    .text,
                  slot: "Missing",
                },
                tiers: [
                  {
                    animation: {
                      kind: "spine",
                      skeleton: "./tier.json",
                      atlas: "./Symbol.atlas",
                      texture: "./Symbol.png",
                      playback: {
                        mode: "animation",
                        animationName: "Idle",
                        loop: true,
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        spineSkeletonModules: { "./tier.json": skeleton },
        spineAtlasModules: {
          "./Symbol.atlas": readFileSync(new URL("Symbol.atlas", root), "utf8"),
        },
        spineTextureModules: { "./Symbol.png": "/Symbol.png" },
      }),
    ).toThrow(/slot.*Missing.*not found/i);
  });

  it("rejects empty/reversed/finally bounded tiers and non-Spine fallback", () => {
    for (const [index, mutate] of [
      (copy: any) => (copy.symbols.CN.valuePresentation.tiers = []),
      (copy: any) =>
        (copy.symbols.CN.valuePresentation.tiers[1].maxExclusive = 9),
      (copy: any) =>
        (copy.symbols.CN.valuePresentation.tiers[3].maxExclusive = 2000),
      (copy: any) =>
        (copy.symbols.CN.valuePresentation.tiers[0].animation.kind = "static"),
      (copy: any) => (copy.symbols.CN.normal = "./CN.png"),
      (copy: any) => (copy.symbols.CN.valuePresentation.defaultValues = []),
      (copy: any) => (copy.symbols.CN.valuePresentation.defaultValues = [1, 1]),
      (copy: any) => (copy.symbols.CN.valuePresentation.defaultValues = [0, 1]),
      (copy: any) => (copy.symbols.CN.animations.appear.playback.loop = true),
      (copy: any) =>
        (copy.symbols.CN.animations.appear = {
          kind: "static",
          durationSeconds: 1,
        }),
      (copy: any) => (copy.symbols.CN.valuePresentation.text.type = "video"),
      (copy: any) =>
        (copy.symbols.CN.valuePresentation.text.prefix = "../escape-"),
    ].entries()) {
      const copy = structuredClone(manifest);
      mutate(copy);
      expect(
        () => parseSymbolStateTextureManifest(copy),
        `mutation ${index} must fail`,
      ).toThrow();
    }
  });
});

function createGenericManifest(count: number) {
  return {
    version: 1,
    states: [],
    symbols: {
      GOLD: {
        scale: 1,
        animations: {
          appear: {
            kind: "activeSpine",
            playback: {
              mode: "animation",
              animationName: "Start",
              loop: false,
            },
          },
        },
        valuePresentation: {
          defaultValues: [1, 10, 100],
          reelStates: {
            normal: { kind: "transparent", width: 200, height: 200 },
          },
          tiers: Array.from({ length: count }, (_, index) => ({
            ...(index === count - 1 ? {} : { maxExclusive: 10 ** (index + 1) }),
            animation: {
              kind: "spine",
              skeleton: `./tier-${count}-${index}.json`,
              atlas: "./shared.atlas",
              texture: "./shared.png",
              playback: {
                mode: "animation",
                animationName: "Idle",
                loop: true,
              },
            },
          })),
          text: {
            slot: "ValueSlot",
            x: 0,
            y: 0,
            fontFamily: "Arial",
            fontSize: 32,
            fontWeight: "900",
            fill: "#fff",
            stroke: "#000",
            strokeWidth: 4,
          },
        },
      },
    },
  };
}
