import { describe, expect, it } from "vitest";
import {
  createSymbolPackageResource,
  materializeMappedSymbolPackageContents,
  materializeSymbolPackageContents,
  materializeSymbolPackageFiles,
  parseSymbolPackageManifest,
} from "../../src/symbol/index.js";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 7]);
const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);

describe("symbol package materialization", () => {
  it("preserves mapped JPG/JPEG/WebP keys and rewrites image-string internals", async () => {
    const packageManifest = parseSymbolPackageManifest({
      version: 1,
      kind: "symbol-package",
      id: "mapped-images",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["A.jpeg", "A.jpg", "A.webp"],
    });
    const rawGameConfig = {
      paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
      symbolCodes: { A: 0 },
      reels: { main: [[0]] },
    };
    const rawSymbolManifest = {
      version: 1,
      states: ["disabled", "spinBlur", "win"],
      symbols: {
        A: {
          normal: "./A.jpg",
          disabled: "./A.jpg",
          spinBlur: "./A.jpeg",
          win: "./A.webp",
          scale: 1,
        },
      },
    };
    const imageString = {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 1, letterSpacing: 0 },
      glyphs: {
        "0": {
          path: "glyph.png",
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    const inputs = new Map<string, Uint8Array>([
      ["A.jpg", new Uint8Array([0xff, 0xd8, 0xff])],
      ["A.jpeg", new Uint8Array([0xff, 0xd8, 0xff, 1])],
      ["A.webp", webp],
      ["nested/image-string.manifest.json", encode(imageString)],
      ["nested/glyph.png", png],
    ]);
    const mapped = await materializeMappedSymbolPackageContents({
      packageManifest,
      rawGameConfig,
      rawSymbolManifest,
      assets: inputs,
    });
    expect(mapped.packageManifest.resources).toEqual([
      "A.jpeg",
      "A.jpg",
      "A.webp",
    ]);

    await expect(
      materializeMappedSymbolPackageContents({
        packageManifest,
        rawGameConfig,
        rawSymbolManifest,
        assets: new Map([...inputs, ["unsupported.bin", new Uint8Array()]]),
      }),
    ).rejects.toThrow(/extension/);
  });

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

    const mapped = await materializeMappedSymbolPackageContents({
      packageManifest,
      rawGameConfig: result.rawGameConfig,
      rawSymbolManifest: {
        version: 1,
        states: ["disabled"],
        symbols: {
          AF: {
            normal: { kind: "transparent", width: 160, height: 160 },
            disabled: "./AF.disabled.png",
            scale: 1,
          },
        },
      },
      assets: new Map([["AF.disabled.png", png]]),
    });
    expect(mapped.packageManifest.resources).toEqual(["AF.disabled.png"]);
    expect(mapped.files.has("assets.map.json")).toBe(true);
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

    const mapped = await materializeMappedSymbolPackageContents({
      packageManifest,
      rawGameConfig,
      rawSymbolManifest,
      assets: new Map([
        ["AF.json", encode(spineSkeleton())],
        ["AF.atlas", atlas("AF.png")],
        ["AF.png", webp],
      ]),
    });
    expect(mapped.packageManifest.resources).toEqual([
      "AF.atlas",
      "AF.json",
      "AF.png",
    ]);
    expect(mapped.rawSymbolManifest).toMatchObject({
      symbols: { AF: { animations: { appear: { atlas: "./AF.atlas" } } } },
    });
  });

  it("prepares hash-flat VNI paths after materializing a legacy animation", async () => {
    const packageManifest = parseSymbolPackageManifest({
      version: 1,
      kind: "symbol-package",
      id: "legacy-vni",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["animation/assets/image.png", "animation/project.json"],
    });
    const rawGameConfig = {
      paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
      symbolCodes: { A: 0 },
      reels: { main: [[0]] },
    };
    const rawSymbolManifest = {
      version: 1,
      states: [],
      symbols: {
        A: {
          normal: { kind: "transparent", width: 160, height: 160 },
          scale: 1,
          animations: {
            win: {
              kind: "vni",
              project: "./animation/project.json",
              playback: {
                mode: "range",
                startTime: 0,
                endTime: 1,
                loop: false,
              },
            },
          },
        },
      },
    };
    const project = {
      schemaVersion: "VNI_0.022",
      editor: { name: "VNI", version: "VNI_0.022" },
      engineTarget: { name: "cocos_creator", version: "3.8.6" },
      name: "A win",
      stage: {
        width: 160,
        height: 160,
        coordinate: "center",
        duration: 1,
        backgroundColor: "#000000",
      },
      assets: [
        {
          id: "image",
          type: "image",
          path: "assets/image.png",
          originalName: "image.png",
          width: 1,
          height: 1,
          fileWidth: 1,
          fileHeight: 1,
          fileScale: 1,
        },
      ],
      layerGroups: [],
      layers: [],
      particles: [],
      exportProfile: {
        id: "runtime_100",
        purpose: "runtime",
        assetScale: 1,
      },
    };
    const result = await materializeSymbolPackageContents({
      packageManifest,
      rawGameConfig,
      rawSymbolManifest,
      assets: new Map([
        ["animation/project.json", encode(project)],
        ["animation/assets/image.png", png],
      ]),
    });

    const materializedProjectPath = result.packageManifest.resources.find(
      (path) => path.endsWith(".json"),
    );
    expect(materializedProjectPath).toMatch(/^assets\/[a-f0-9]{64}\.json$/u);
    const materializedProject = JSON.parse(
      new TextDecoder().decode(result.assets.get(materializedProjectPath!)!),
    );
    expect(materializedProject.assets[0].path).toMatch(/^[a-f0-9]{64}\.png$/u);

    const prepared = await createSymbolPackageResource({
      packageManifest: result.packageManifest,
      files: result.files,
      loadTextures: false,
    });
    expect(prepared.displaySymbols).toEqual(["A"]);
    prepared.destroy();

    const mapped = await materializeMappedSymbolPackageContents({
      packageManifest,
      rawGameConfig,
      rawSymbolManifest,
      assets: new Map([
        ["animation/project.json", encode(project)],
        ["animation/assets/image.png", png],
      ]),
    });
    expect(mapped.packageManifest.resources).toEqual([
      "image.png",
      "project.json",
    ]);
    expect(mapped.rawSymbolManifest).toMatchObject({
      symbols: { A: { animations: { win: { project: "./project.json" } } } },
    });
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
