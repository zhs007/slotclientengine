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
const imageStringManifest = JSON.parse(
  readFileSync(
    new URL(
      "dependencies/image-strings/cn-digits/image-string.manifest.json",
      root,
    ),
    "utf8",
  ),
);

function createImageStringPool() {
  const resource = Object.freeze({
    manifest: imageStringManifest,
    textures: Object.freeze({}),
    destroyed: false,
    assertUsable() {},
    async destroy() {},
  });
  return {
    resources: new Map([
      [
        "dependencies/image-strings/cn-digits/image-string.manifest.json",
        resource,
      ],
    ]),
    get: () => resource,
    async destroy() {},
  } as never;
}

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

  it("strictly parses per-tier ImgNumber bindings without a second threshold table", () => {
    const copy = createGenericManifest(3);
    copy.symbols.GOLD.valuePresentation.text = {
      type: "image-string",
      tiers: ["small", "shared", "shared"].map((id, index) => ({
        resource: `./dependencies/image-strings/${id}/image-string.manifest.json`,
        slot: `Num${index}`,
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: index, y: -index, scale: 1 },
        followSlotColor: index !== 1,
      })),
    };
    const parsed = parseSymbolStateTextureManifest(copy);
    const text = parsed.symbols.GOLD.valuePresentation?.text;
    expect(text?.type).toBe("image-string");
    if (text?.type !== "image-string") throw new Error("expected ImgNumber");
    expect(text.tiers.map((binding) => binding.slot)).toEqual([
      "Num0",
      "Num1",
      "Num2",
    ]);
    expect(Object.isFrozen(text.tiers[0]?.transform)).toBe(true);

    for (const mutate of [
      (value: any) => value.text.tiers.pop(),
      (value: any) =>
        value.text.tiers.push(structuredClone(value.text.tiers[0])),
      (value: any) => (value.text.tiers[0].resource = "../escape.json"),
      (value: any) => (value.text.tiers[0].slot = ""),
      (value: any) => (value.text.tiers[0].anchor.x = 2),
      (value: any) => (value.text.tiers[0].transform.scale = 0),
      (value: any) => (value.text.tiers[0].unknown = true),
      (value: any) => (value.text.prefix = "./"),
    ]) {
      const invalid = structuredClone(copy);
      mutate(invalid.symbols.GOLD.valuePresentation);
      expect(() => parseSymbolStateTextureManifest(invalid)).toThrow();
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
    expect(presentation?.text.type).toBe("image-string");
    if (presentation?.text.type !== "image-string") {
      throw new Error("expected current CN presentation to use ImgNumber");
    }
    expect(presentation.text.tiers).toHaveLength(4);
    expect(Object.isFrozen(presentation.text.tiers)).toBe(true);
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
      imageStringResourcePool: createImageStringPool(),
    });
    expect(resources.CN.tiers).toHaveLength(4);
    expect(resources.CN.tiers.map((tier) => tier.spec.skeleton)).toEqual([
      "./CN_1.json",
      "./CN_2.json",
      "./CN_3.json",
      "./CN_4.json",
    ]);
    expect(resources.CN.textImageUrls).toEqual({});
    expect(resources.CN.imageStringTierBindings).toHaveLength(4);
    expect(
      resources.CN.imageStringTierBindings?.map((binding) => binding.slot),
    ).toEqual(["Num", "Num", "Num", "Num"]);
  });

  it("fails when an image-rendered value has no exact image module", () => {
    const skeletons = Object.fromEntries(
      ["CN_1", "CN_2", "CN_3", "CN_4"].map((name) => [
        `./${name}.json`,
        JSON.parse(readFileSync(new URL(`${name}.json`, root), "utf8")),
      ]),
    );
    const imageManifest = structuredClone(manifest);
    imageManifest.symbols.CN.valuePresentation.text = {
      type: "image",
      slot: "Num",
      x: 0,
      y: 0,
      prefix: "./",
    };
    expect(() =>
      createSymbolValuePresentationResourcesFromManifest({
        manifest: imageManifest,
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

function createGenericManifest(count: number): any {
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
