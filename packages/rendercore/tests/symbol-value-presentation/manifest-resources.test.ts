import { describe, expect, it } from "vitest";
import {
  createSymbolLandingAppearSymbolsFromManifest,
  createSymbolValuePresentationImagePath,
  createSymbolValuePresentationResourcesFromManifest,
  parseSymbolStateTextureManifest,
} from "../../src/index.js";
import { readCraveJson, readCraveText } from "../crave-fixture.js";

const manifest = readCraveJson("symbol-state-textures.manifest.json");
const imageStringManifest = readCraveJson("image-string.manifest.json");

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
        specialValueImages:
          index === 0
            ? [{ value: 200, image: "./small-200.png" }]
            : index === 2
              ? [{ value: 500, image: "./large-500.png" }]
              : [],
      })),
    };
    const parsed = parseSymbolStateTextureManifest(copy);
    const text = parsed.symbols.GOLD.valuePresentation?.text;
    expect(text?.type).toBe("image-string");
    if (text?.type !== "image-string" || !("tiers" in text))
      throw new Error("expected legacy ImgNumber");
    expect(text.tiers.map((binding) => binding.slot)).toEqual([
      "Num0",
      "Num1",
      "Num2",
    ]);
    expect(Object.isFrozen(text.tiers[0]?.transform)).toBe(true);
    expect(
      text.tiers.map((binding) => binding.specialValueImages ?? []),
    ).toEqual([
      [{ value: 200, image: "./small-200.png" }],
      [],
      [{ value: 500, image: "./large-500.png" }],
    ]);

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

  it("parses JSON-only tiers with one shared Normal ImgNumber binding", () => {
    const copy = createGenericManifest(3);
    copy.states = ["spinBlur"];
    copy.symbols.GOLD.valuePresentation.reelStates.spinBlur =
      "./gold.spin-blur.png";
    copy.symbols.GOLD.valuePresentation.text = {
      type: "image-string",
      tierResources: ["small", "medium", "large"].map(
        (id) => `./dependencies/image-strings/${id}/image-string.manifest.json`,
      ),
      slot: "Num",
      anchor: { x: 0.5, y: 0.5 },
      transform: { x: 2, y: -3, scale: 0.75 },
      followSlotColor: true,
      specialValueImages: [{ value: 200, image: "./special-200.png" }],
      tierSpinBlurProfiles: [
        {
          resource: "./small-blur/image-string.manifest.json",
          specialValueImages: [{ value: 200, image: "./special-200.blur.png" }],
        },
        null,
        null,
      ],
    };
    const text =
      parseSymbolStateTextureManifest(copy).symbols.GOLD.valuePresentation!
        .text;
    if (text.type !== "image-string" || !("tierResources" in text))
      throw new Error("expected shared ImgNumber");
    expect(text.tierResources).toHaveLength(3);
    expect(text.slot).toBe("Num");
    expect(Object.isFrozen(text.tierResources)).toBe(true);
    expect(text.tierSpinBlurProfiles?.[0]?.resource).toContain("small-blur");
    expect(text.tierSpinBlurProfiles?.[1]).toBeNull();

    const mixed = structuredClone(copy);
    mixed.symbols.GOLD.valuePresentation.text.tiers = [];
    expect(() => parseSymbolStateTextureManifest(mixed)).toThrow(/unknown/);
    const misaligned = structuredClone(copy);
    misaligned.symbols.GOLD.valuePresentation.text.tierResources.pop();
    expect(() => parseSymbolStateTextureManifest(misaligned)).toThrow(
      /length must equal/,
    );
    const mismatchedBlur = structuredClone(copy);
    mismatchedBlur.symbols.GOLD.valuePresentation.text.tierSpinBlurProfiles[0].specialValueImages =
      [];
    expect(() => parseSymbolStateTextureManifest(mismatchedBlur)).toThrow(
      /exactly match/,
    );
  });

  it("normalizes legacy shared ImgNumber mappings into every tier", () => {
    const copy = createGenericManifest(3);
    const text = {
      type: "image-string",
      specialValueImages: [{ value: 200, image: "./legacy-200.png" }],
      tiers: ["small", "medium", "large"].map((id, index) => ({
        resource: `./dependencies/image-strings/${id}/image-string.manifest.json`,
        slot: `Num${index}`,
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: true,
      })),
    };
    copy.symbols.GOLD.valuePresentation.text = text;

    const parsed =
      parseSymbolStateTextureManifest(copy).symbols.GOLD.valuePresentation!
        .text;
    if (parsed.type !== "image-string" || !("tiers" in parsed))
      throw new Error("expected legacy ImgNumber");
    expect(parsed.tiers.map((binding) => binding.specialValueImages)).toEqual([
      [{ value: 200, image: "./legacy-200.png" }],
      [{ value: 200, image: "./legacy-200.png" }],
      [{ value: 200, image: "./legacy-200.png" }],
    ]);
    expect(parsed.tiers[0]?.specialValueImages).not.toBe(
      parsed.tiers[1]?.specialValueImages,
    );
    expect(parsed.tiers[0]?.specialValueImages?.[0]).not.toBe(
      parsed.tiers[1]?.specialValueImages?.[0],
    );
    expect("specialValueImages" in parsed).toBe(false);

    const mixed = structuredClone(copy);
    mixed.symbols.GOLD.valuePresentation.text.tiers[0].specialValueImages = [
      { value: 500, image: "./tier-500.png" },
    ];
    expect(() => parseSymbolStateTextureManifest(mixed)).toThrow(
      /must not combine legacy specialValueImages with per-tier specialValueImages/,
    );
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
    if (
      presentation?.text.type !== "image-string" ||
      !("tiers" in presentation.text)
    ) {
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
      "AF",
      "CM",
      "CN",
      "CO",
      "H1",
      "H2",
      "L1",
      "L2",
      "L3",
      "L4",
      "WL",
      "WM",
    ]);
  });

  it("resolves and validates all current official Spine resources", () => {
    const skeletons = Object.fromEntries(
      ["CN_1", "CN_2", "CN_3", "CN_4"].map((name) => [
        `./${name.toLowerCase()}.json`,
        readCraveJson(`${name.toLowerCase()}.json`),
      ]),
    );
    const resources = createSymbolValuePresentationResourcesFromManifest({
      manifest,
      requiredStates: ["spinBlur", "disabled"],
      spineSkeletonModules: skeletons,
      spineAtlasModules: {
        "./symbol.atlas": readCraveText("symbol.atlas"),
      },
      spineTextureModules: { "./symbol.webp": "/Symbol.webp" },
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
      "./cn_1.json",
      "./cn_2.json",
      "./cn_3.json",
      "./cn_4.json",
    ]);
    expect(resources.CN.textImageUrls).toEqual({});
    expect(resources.CN.imageStringTierBindings).toHaveLength(4);
    expect(
      resources.CN.imageStringTierBindings?.map((binding) => binding.slot),
    ).toEqual(["coin", "coin", "coin", "coin"]);
  });

  it("reads the atlas page instead of deriving it from a mapped value texture key", () => {
    const optimizedManifest = structuredClone(manifest);
    for (const tier of optimizedManifest.symbols.CN.valuePresentation.tiers) {
      tier.animation.texture = "./content-addressed-value.webp";
    }
    const skeletons = Object.fromEntries(
      ["CN_1", "CN_2", "CN_3", "CN_4"].map((name) => [
        `./${name.toLowerCase()}.json`,
        readCraveJson(`${name.toLowerCase()}.json`),
      ]),
    );

    const resources = createSymbolValuePresentationResourcesFromManifest({
      manifest: optimizedManifest,
      requiredStates: ["spinBlur", "disabled"],
      spineSkeletonModules: skeletons,
      spineAtlasModules: {
        "./symbol.atlas": readCraveText("symbol.atlas"),
      },
      spineTextureModules: {
        "./content-addressed-value.webp": "/assets/physical-hash.webp",
      },
      imageStringResourcePool: createImageStringPool(),
    });

    expect(resources.CN.tiers[0]).toMatchObject({
      atlasPage: "Symbol.png",
      textureUrl: "/assets/physical-hash.webp",
    });
  });

  it("fails when an image-rendered value has no exact image module", () => {
    const skeletons = Object.fromEntries(
      ["CN_1", "CN_2", "CN_3", "CN_4"].map((name) => [
        `./${name.toLowerCase()}.json`,
        readCraveJson(`${name.toLowerCase()}.json`),
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
          "./symbol.atlas": readCraveText("symbol.atlas"),
        },
        spineTextureModules: { "./symbol.webp": "/Symbol.webp" },
        textImageModules: { "./1.png": "/1.png" },
      }),
    ).toThrow(/value image 2.*missing/i);
  });

  it("parses exact materialized full-value image mappings", () => {
    const mapped = structuredClone(manifest);
    const presentation = mapped.symbols.CN.valuePresentation;
    presentation.text = {
      type: "image",
      slot: "Num",
      x: 0,
      y: 0,
      images: Object.fromEntries(
        presentation.defaultValues.map((value: number) => [
          String(value),
          `./assets/${value}.png`,
        ]),
      ),
    };
    const parsed =
      parseSymbolStateTextureManifest(mapped).symbols.CN.valuePresentation!;
    expect(parsed.text.type).toBe("image");
    if (parsed.text.type !== "image") throw new Error("expected image text");
    expect(createSymbolValuePresentationImagePath(parsed.text, 25)).toBe(
      "./assets/25.png",
    );

    delete presentation.text.images["25"];
    expect(() => parseSymbolStateTextureManifest(mapped)).toThrow(
      /exactly match defaultValues/,
    );
    presentation.text.images["25"] = "./assets/25.png";
    presentation.text.prefix = "./";
    expect(() => parseSymbolStateTextureManifest(mapped)).toThrow(
      /exactly one of prefix or images/,
    );
  });

  it("rejects a configured text slot missing from any tier skeleton", () => {
    const skeleton = readCraveJson("cn_1.json");
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
          "./Symbol.atlas": readCraveText("symbol.atlas"),
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
