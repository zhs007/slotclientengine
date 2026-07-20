import { describe, expect, it } from "vitest";
import {
  createSymbolPackageResource,
  materializeSymbolPackageContents,
  materializeSymbolPackageFiles,
  parseSymbolPackageManifest,
} from "../../src/symbol/index.js";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 7]);
const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);

describe("symbol package materialization", () => {
  it("rewrites legacy uppercase resource paths to a lowercase hash-flat closure", async () => {
    const packageManifest = parseSymbolPackageManifest({
      version: 1,
      kind: "symbol-package",
      id: "legacy-symbols",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["AF.disabled.png"],
    });
    const result = await materializeSymbolPackageContents({
      packageManifest,
      rawGameConfig: {
        paytable: { "0": { code: 0, symbol: "AF", pays: [1] } },
        symbolCodes: { AF: 0 },
        reels: { main: [[0]] },
      },
      rawSymbolManifest: {
        version: 1,
        states: ["disabled"],
        symbols: {
          AF: {
            normal: {
              kind: "transparent",
              width: 160,
              height: 160,
            },
            disabled: "./AF.disabled.png",
            scale: 1,
          },
        },
      },
      assets: new Map([["AF.disabled.png", png]]),
    });

    expect(
      [...result.files.keys()].every((path) => path === path.toLowerCase()),
    ).toBe(true);
    expect(result.packageManifest.resources).toEqual([
      expect.stringMatching(/^assets\/[a-f0-9]{64}\.png$/u),
    ]);
    expect(result.rawSymbolManifest).toMatchObject({
      symbols: {
        AF: {
          disabled: expect.stringMatching(/^\.\/assets\/[a-f0-9]{64}\.png$/u),
        },
      },
    });
    const prepared = await createSymbolPackageResource({
      packageManifest: result.packageManifest,
      files: result.files,
      loadTextures: false,
    });
    expect(prepared.displaySymbols).toEqual(["AF"]);
    prepared.destroy();

    const fromLegacyFiles = await materializeSymbolPackageFiles({
      packageManifest,
      files: new Map([
        ["symbols.package.json", encode(packageManifest)],
        ["gameconfig.json", encode(result.rawGameConfig)],
        [
          "symbol-state-textures.manifest.json",
          encode({
            version: 1,
            states: ["disabled"],
            symbols: {
              AF: {
                normal: {
                  kind: "transparent",
                  width: 160,
                  height: 160,
                },
                disabled: "./AF.disabled.png",
                scale: 1,
              },
            },
          }),
        ],
        ["AF.disabled.png", png],
      ]),
    });
    expect(fromLegacyFiles.files).toEqual(result.files);
  });

  it("prepares hash-flat Spine paths after materializing a legacy animation", async () => {
    const packageManifest = parseSymbolPackageManifest({
      version: 1,
      kind: "symbol-package",
      id: "legacy-spine",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["AF.atlas", "AF.json", "AF.png"],
    });
    const rawGameConfig = {
      paytable: { "0": { code: 0, symbol: "AF", pays: [1] } },
      symbolCodes: { AF: 0 },
      reels: { main: [[0]] },
    };
    const rawSymbolManifest = {
      version: 1,
      states: ["appear"],
      symbols: {
        AF: {
          normal: { kind: "transparent", width: 160, height: 160 },
          scale: 1,
          animations: {
            appear: {
              kind: "spine",
              skeleton: "./AF.json",
              atlas: "./AF.atlas",
              texture: "./AF.png",
              playback: {
                mode: "animation",
                animationName: "Start",
                loop: false,
              },
            },
          },
        },
      },
    };
    const result = await materializeSymbolPackageFiles({
      packageManifest,
      files: new Map([
        ["symbols.package.json", encode(packageManifest)],
        ["gameconfig.json", encode(rawGameConfig)],
        ["symbol-state-textures.manifest.json", encode(rawSymbolManifest)],
        ["AF.json", encode(spineSkeleton())],
        ["AF.atlas", atlas("AF.png")],
        ["AF.png", webp],
      ]),
    });

    expect(result.rawSymbolManifest).toMatchObject({
      symbols: {
        AF: {
          animations: {
            appear: {
              skeleton: expect.stringMatching(
                /^\.\/assets\/[a-f0-9]{64}\.json$/u,
              ),
              atlas: expect.stringMatching(
                /^\.\/assets\/[a-f0-9]{64}\.atlas$/u,
              ),
              texture: expect.stringMatching(
                /^\.\/assets\/[a-f0-9]{64}\.webp$/u,
              ),
            },
          },
        },
      },
    });
    const prepared = await createSymbolPackageResource({
      packageManifest: result.packageManifest,
      files: result.files,
      loadTextures: false,
    });
    expect(prepared.displaySymbols).toEqual(["AF"]);
    prepared.destroy();
  });

  it("upgrades legacy full-value image prefixes to exact hash-flat mappings", async () => {
    const resources = ["1.png", "CN.atlas", "CN.json", "CN.png"].sort();
    const packageManifest = parseSymbolPackageManifest({
      version: 1,
      kind: "symbol-package",
      id: "legacy-value-images",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources,
    });
    const rawGameConfig = {
      paytable: { "0": { code: 0, symbol: "CN", pays: [1] } },
      symbolCodes: { CN: 0 },
      reels: { main: [[0]] },
    };
    const rawSymbolManifest = {
      version: 1,
      states: [],
      symbols: {
        CN: {
          scale: 1,
          valuePresentation: {
            defaultValues: [1],
            reelStates: {
              normal: { kind: "transparent", width: 160, height: 160 },
            },
            tiers: [
              {
                animation: {
                  kind: "spine",
                  skeleton: "./CN.json",
                  atlas: "./CN.atlas",
                  texture: "./CN.png",
                  playback: {
                    mode: "animation",
                    animationName: "Loop",
                    loop: true,
                  },
                },
              },
            ],
            text: { type: "image", slot: "Num", x: 0, y: 0, prefix: "./" },
          },
        },
      },
    };
    const result = await materializeSymbolPackageFiles({
      packageManifest,
      files: new Map([
        ["symbols.package.json", encode(packageManifest)],
        ["gameconfig.json", encode(rawGameConfig)],
        ["symbol-state-textures.manifest.json", encode(rawSymbolManifest)],
        ["1.png", png],
        ["CN.json", encode(valueSpineSkeleton())],
        ["CN.atlas", atlas("CN.png")],
        ["CN.png", png],
      ]),
    });

    const text = (
      result.rawSymbolManifest as {
        symbols: { CN: { valuePresentation: { text: unknown } } };
      }
    ).symbols.CN.valuePresentation.text;
    expect(text).toEqual({
      type: "image",
      slot: "Num",
      x: 0,
      y: 0,
      images: {
        "1": expect.stringMatching(/^\.\/assets\/[a-f0-9]{64}\.png$/u),
      },
    });
    expect(result.packageManifest.resources).not.toContain("1.png");
    const prepared = await createSymbolPackageResource({
      packageManifest: result.packageManifest,
      files: result.files,
      loadTextures: false,
    });
    expect(prepared.displaySymbols).toEqual(["CN"]);
    prepared.destroy();
  });

  it("rejects malformed legacy raster bytes before emitting a partial closure", async () => {
    const packageManifest = transparentPackage(["Broken.PNG"]);
    await expect(
      materializeSymbolPackageContents({
        packageManifest,
        ...transparentInputs(),
        assets: new Map([["Broken.PNG", new Uint8Array([1, 2, 3])]]),
      }),
    ).rejects.toThrow(/不是受支持/);
  });

  it("rejects malformed JSON and VNI-like projects without treating them as skeleton JSON", async () => {
    const packageManifest = transparentPackage(["Broken.JSON"]);
    await expect(
      materializeSymbolPackageContents({
        packageManifest,
        ...transparentInputs(),
        assets: new Map([["Broken.JSON", new TextEncoder().encode("{")]]),
      }),
    ).rejects.toThrow(/Broken\.JSON 无效/);
    await expect(
      materializeSymbolPackageContents({
        packageManifest,
        ...transparentInputs(),
        assets: new Map([
          [
            "Broken.JSON",
            new TextEncoder().encode(
              JSON.stringify({
                schemaVersion: "VNI_bad",
                assets: [],
                layers: [],
              }),
            ),
          ],
        ]),
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid Spine atlas structure and missing page mappings", async () => {
    const packageManifest = transparentPackage(["Broken.ATLAS"]);
    await expect(
      materializeSymbolPackageContents({
        packageManifest,
        ...transparentInputs(),
        assets: new Map([
          [
            "Broken.ATLAS",
            new TextEncoder().encode("region\n  rotate: false\n"),
          ],
        ]),
      }),
    ).rejects.toThrow(/page 结构无效/);
    await expect(
      materializeSymbolPackageContents({
        packageManifest,
        ...transparentInputs(),
        assets: new Map([
          [
            "Broken.ATLAS",
            new TextEncoder().encode(
              "Missing.PNG\nsize: 1,1\nfilter: Linear,Linear\n",
            ),
          ],
        ]),
      }),
    ).rejects.toThrow(/结构化资源依赖未物化：Missing\.PNG/);
  });
});

function transparentPackage(resources: readonly string[]) {
  return parseSymbolPackageManifest({
    version: 1,
    kind: "symbol-package",
    id: "legacy-invalid",
    cellSize: { width: 160, height: 160 },
    entrypoints: {
      gameConfig: "gameconfig.json",
      symbolManifest: "symbol-state-textures.manifest.json",
    },
    resources,
  });
}

function transparentInputs() {
  return {
    rawGameConfig: {
      paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
      symbolCodes: { A: 0 },
      reels: { main: [[0]] },
    },
    rawSymbolManifest: {
      version: 1,
      states: [],
      symbols: {
        A: {
          normal: { kind: "transparent", width: 160, height: 160 },
          scale: 1,
        },
      },
    },
  };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function spineSkeleton() {
  return {
    skeleton: { spine: "4.3.23", width: 1, height: 1 },
    bones: [{ name: "root" }],
    slots: [],
    skins: [{ name: "default", attachments: {} }],
    animations: { Start: {} },
  };
}

function valueSpineSkeleton() {
  return {
    skeleton: { spine: "4.3.23", width: 1, height: 1 },
    bones: [{ name: "root" }],
    slots: [{ name: "Num", bone: "root" }],
    skins: [{ name: "default", attachments: {} }],
    animations: { Loop: {} },
  };
}

function atlas(page: string): Uint8Array {
  return new TextEncoder().encode(
    `${page}\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n`,
  );
}
