import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
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
    expect(Object.isFrozen(presentation?.text)).toBe(true);
    expect(presentation?.text.slot).toBe("Num");
    expect(Object.isFrozen(presentation?.reelStates)).toBe(true);
    expect(parsed.symbols.CN.normal).toEqual({
      kind: "transparent",
      width: 200,
      height: 200,
    });
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
    });
    expect(resources.CN.tiers).toHaveLength(4);
    expect(resources.CN.tiers.map((tier) => tier.spec.skeleton)).toEqual([
      "./CN_1.json",
      "./CN_2.json",
      "./CN_3.json",
      "./CN_4.json",
    ]);
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
    for (const mutate of [
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
    ]) {
      const copy = structuredClone(manifest);
      mutate(copy);
      expect(() => parseSymbolStateTextureManifest(copy)).toThrow();
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
