import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SymbolAssetError,
  createSymbolAssetMapFromManifestModules,
  createSymbolRenderPriorityMapFromManifest,
  createSymbolScaleMapFromManifest,
  createSymbolSpineAnimationResourcesFromManifest,
  createSymbolVniAnimationResourcesFromManifest,
  getSymbolDisplaySymbolsFromManifest,
  parseSymbolStateTextureManifest,
} from "../../src/symbol/index.js";

const requiredStates = ["spinBlur", "disabled"] as const;

function createManifest() {
  return {
    version: 1,
    states: ["spinBlur", "disabled"],
    settings: {
      spinBlur: { kind: "verticalBoxBlur", kernelHeight: 21 },
    },
    symbols: {
      L1: {
        normal: "./L1.png",
        spinBlur: "./L1.spinBlur.png",
        disabled: "./L1.disabled.png",
        scale: 1,
        animations: {
          appear: {
            kind: "builtin",
            durationSeconds: 0.42,
          },
          win: {
            kind: "vni",
            project: "./L1-wins.json",
            playback: {
              mode: "range",
              startTime: 0,
              endTime: 2,
              loop: false,
            },
          },
        },
      },
      SC: {
        normal: {
          kind: "layered",
          layers: ["./SC-0.png", "./SC-1.png"],
        },
        spinBlur: "./SC.spinBlur.png",
        disabled: "./SC.disabled.png",
        scale: 0.8,
        animations: {
          appear: {
            kind: "static",
            durationSeconds: 1 / 60,
          },
        },
      },
      H1: {
        normal: "./H1.png",
        spinBlur: "./H1.spinBlur.png",
        disabled: "./H1.disabled.png",
        scale: 1,
        animations: {
          normal: {
            kind: "spine",
            skeleton: "./H1.json",
            atlas: "./Symbol.atlas",
            texture: "./Symbol.png",
            playback: {
              mode: "animation",
              animationName: "Idle",
              loop: true,
            },
            transform: {
              x: 1,
              y: -2,
              scale: 0.5,
            },
          },
          appear: {
            kind: "spine",
            skeleton: "./H1.json",
            atlas: "./Symbol.atlas",
            texture: "./Symbol.png",
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
}

function createProject() {
  return {
    schemaVersion: "VNI_0.010",
    editor: { name: "VNI", version: "VNI_0.010" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "L1 wins",
    stage: {
      width: 100,
      height: 100,
      coordinate: "center",
      duration: 2,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "l1",
        type: "image",
        path: "assets/l1.png",
        originalName: "l1.png",
        width: 32,
        height: 32,
      },
    ],
    layerGroups: [
      {
        id: "group_default",
        name: "Default",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [
      {
        id: "layer-l1",
        name: "L1",
        type: "image",
        assetId: "l1",
        parentId: null,
        groupId: "group_default",
        visible: true,
        locked: false,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        opacity: 1,
        blendMode: "normal",
        animations: [],
        keyframes: [],
      },
    ],
    particles: [],
  };
}

describe("symbol state texture manifest helpers", () => {
  it("strictly parses ordered named image-string nodes targeting Spine states", () => {
    const manifest = createManifest() as any;
    manifest.symbols.H1.imageStringNodes = [
      {
        name: "coin-value",
        resource:
          "./dependencies/image-strings/coin-digits/image-string.manifest.json",
        target: { state: "normal", slot: "Num" },
        initialText: "001",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 1, y: -2, scale: 0.75 },
        followSlotColor: true,
      },
    ];
    const parsed = parseSymbolStateTextureManifest(manifest);
    expect(parsed.symbols.H1.imageStringNodes).toEqual(
      manifest.symbols.H1.imageStringNodes,
    );
    expect(Object.isFrozen(parsed.symbols.H1.imageStringNodes)).toBe(true);
    expect(parsed.symbols.L1.imageStringNodes).toEqual([]);
  });

  it.each([
    [
      "duplicate name",
      (nodes: any[]) => nodes.push({ ...nodes[0] }),
      /duplicate/,
    ],
    ["bad name", (nodes: any[]) => (nodes[0].name = "Bad_Name"), /kebab-case/],
    [
      "bad resource",
      (nodes: any[]) => (nodes[0].resource = "https://x/a.json"),
      /canonical local/,
    ],
    [
      "non-Spine target",
      (nodes: any[]) => (nodes[0].target.state = "win"),
      /Spine/,
    ],
    [
      "unknown slot field",
      (nodes: any[]) => (nodes[0].target.extra = true),
      /unknown/,
    ],
    [
      "unknown node field",
      (nodes: any[]) => (nodes[0].extra = true),
      /unknown/,
    ],
    [
      "unknown target state",
      (nodes: any[]) => (nodes[0].target.state = "missing"),
      /unknown state/,
    ],
    [
      "non-string initial text",
      (nodes: any[]) => (nodes[0].initialText = 1),
      /string/,
    ],
    ["bad anchor", (nodes: any[]) => (nodes[0].anchor.x = 2), /anchor/],
    [
      "bad transform x",
      (nodes: any[]) => (nodes[0].transform.x = Number.NaN),
      /finite/,
    ],
    ["bad scale", (nodes: any[]) => (nodes[0].transform.scale = 0), /positive/],
    [
      "implicit color",
      (nodes: any[]) => delete nodes[0].followSlotColor,
      /boolean/,
    ],
  ])("rejects invalid image-string nodes: %s", (_label, mutate, message) => {
    const manifest = createManifest() as any;
    manifest.symbols.H1.imageStringNodes = [
      {
        name: "coin-value",
        resource:
          "./dependencies/image-strings/coin-digits/image-string.manifest.json",
        target: { state: "normal", slot: "Num" },
        initialText: "1",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: false,
      },
    ];
    mutate(manifest.symbols.H1.imageStringNodes);
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(message);
  });

  it("rejects a non-array imageStringNodes field", () => {
    const manifest = createManifest() as any;
    manifest.symbols.H1.imageStringNodes = {};
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(/array/);
  });

  it("parses settings, display symbols, scales, single normals and layered normals", () => {
    const manifest = createManifest();

    expect(
      getSymbolDisplaySymbolsFromManifest(manifest, { requiredStates }),
    ).toEqual(["L1", "SC", "H1"]);
    expect(
      createSymbolScaleMapFromManifest({
        manifest,
        requiredStates,
        requireExplicitScale: true,
      }),
    ).toEqual({ L1: 1, SC: 0.8, H1: 1 });
    expect(
      createSymbolAssetMapFromManifestModules({
        manifest,
        requiredStates,
        modules: {
          "../../../assets/game003-s1/L1.png": "/L1.png",
          "../../../assets/game003-s1/L1.spinBlur.png": "/L1.spinBlur.png",
          "../../../assets/game003-s1/L1.disabled.png": "/L1.disabled.png",
          "../../../assets/game003-s1/SC-0.png": "/SC-0.png",
          "../../../assets/game003-s1/SC-1.png": "/SC-1.png",
          "../../../assets/game003-s1/SC.spinBlur.png": "/SC.spinBlur.png",
          "../../../assets/game003-s1/SC.disabled.png": "/SC.disabled.png",
          "../../../assets/game003-s1/H1.png": "/H1.png",
          "../../../assets/game003-s1/H1.spinBlur.png": "/H1.spinBlur.png",
          "../../../assets/game003-s1/H1.disabled.png": "/H1.disabled.png",
        },
      }),
    ).toMatchObject({
      L1: {
        normal: "/L1.png",
        states: {
          spinBlur: "/L1.spinBlur.png",
          disabled: "/L1.disabled.png",
        },
      },
      SC: {
        normal: {
          kind: "layered",
          layers: [
            { index: 0, texture: "/SC-0.png" },
            { index: 1, texture: "/SC-1.png" },
          ],
        },
      },
      H1: {
        normal: "/H1.png",
      },
    });
  });

  it("accepts explicit transparent normal sources without requiring a PNG module", () => {
    const manifest = {
      version: 1,
      states: [],
      symbols: {
        normal: {
          normal: { kind: "transparent", width: 172, height: 158 },
          scale: 1,
          animations: {
            appear: { kind: "static", durationSeconds: 1 / 60 },
            win: { kind: "builtin", durationSeconds: 0.58 },
          },
        },
        bonus: {
          normal: "./bonus.png",
          scale: 1,
        },
      },
    };

    expect(
      parseSymbolStateTextureManifest(manifest).symbols.normal,
    ).toMatchObject({
      normal: { kind: "transparent", width: 172, height: 158 },
      scale: 1,
    });
    expect(
      createSymbolAssetMapFromManifestModules({
        manifest,
        modules: {
          "../../../assets/sample/bonus.png": "/bonus.png",
        },
        displaySymbols: ["normal", "bonus"],
        requiredStates: [],
      }),
    ).toEqual({
      normal: {
        normal: { kind: "transparent", width: 172, height: 158 },
        states: {},
      },
      bonus: {
        normal: "/bonus.png",
        states: {},
      },
    });
  });

  it("resolves arbitrary nested paths exactly and supports sparse state textures", () => {
    const manifest = {
      version: 1,
      states: ["spinBlur", "disabled"],
      symbols: {
        A: {
          normal: "./art/base-wild-final.webp",
          spinBlur: "./passes/blur-pass-03.png",
          scale: 1,
        },
        B: {
          normal: "./other/base-wild-final.webp",
          disabled: "./passes/disabled-approved.webp",
          scale: 1,
        },
      },
    };
    expect(
      createSymbolAssetMapFromManifestModules({
        manifest,
        modules: {
          "../../../fixture/art/base-wild-final.webp": "/a.webp",
          "../../../fixture/other/base-wild-final.webp": "/b.webp",
          "../../../fixture/passes/blur-pass-03.png": "/blur.png",
          "../../../fixture/passes/disabled-approved.webp": "/disabled.webp",
        },
      }),
    ).toEqual({
      A: { normal: "/a.webp", states: { spinBlur: "/blur.png" } },
      B: { normal: "/b.webp", states: { disabled: "/disabled.webp" } },
    });
    expect(() =>
      createSymbolAssetMapFromManifestModules({
        manifest,
        modules: {
          "../../../fixture/art/base-wild-final.webp": "/a.webp",
        },
      }),
    ).toThrow(/passes\/blur-pass-03\.png/);
    expect(() =>
      createSymbolAssetMapFromManifestModules({
        manifest,
        modules: {
          "../../../fixture/art/base-wild-final.webp": "/a.webp",
          "../../../fixture/other/base-wild-final.webp": "/b.webp",
          "../../../fixture/passes/blur-pass-03.png": "/blur.png",
          "../../../fixture/passes/disabled-approved.webp": "/disabled.webp",
        },
        requiredStates: ["spinBlur", "disabled"],
      }),
    ).toThrow(/Symbol "A" manifest is missing state "disabled"/);
  });

  it("parses optional render priorities and defaults missing values to zero", () => {
    const manifest = {
      ...createManifest(),
      symbols: {
        ...createManifest().symbols,
        SC: {
          ...createManifest().symbols.SC,
          renderPriority: 3,
        },
      },
    };

    const parsed = parseSymbolStateTextureManifest(manifest, {
      requiredStates,
    });
    expect(parsed.symbols.L1.renderPriority).toBe(0);
    expect(parsed.symbols.SC.renderPriority).toBe(3);
    expect(
      createSymbolRenderPriorityMapFromManifest({
        manifest,
        requiredStates,
        displaySymbols: ["L1", "SC"],
      }),
    ).toEqual({ L1: 0, SC: 3 });
    expect(() =>
      createSymbolRenderPriorityMapFromManifest({
        manifest,
        requiredStates,
        displaySymbols: ["NOPE"],
      }),
    ).toThrow(/NOPE/);
  });

  it("rejects invalid transparent normal dimensions", () => {
    for (const normal of [
      { kind: "transparent", height: 158 },
      { kind: "transparent", width: 172 },
      { kind: "transparent", width: 0, height: 158 },
      { kind: "transparent", width: -1, height: 158 },
      { kind: "transparent", width: Number.NaN, height: 158 },
      { kind: "transparent", width: "172", height: 158 },
    ]) {
      expect(() =>
        parseSymbolStateTextureManifest({
          version: 1,
          states: [],
          symbols: {
            normal: {
              normal,
              scale: 1,
            },
          },
        }),
      ).toThrow(/transparent normal/);
    }
  });

  it("builds VNI animation resources from manifest modules", () => {
    const resources = createSymbolVniAnimationResourcesFromManifest({
      manifest: createManifest(),
      requiredStates,
      vniProjectModules: {
        "../../../assets/game003-s1/L1-wins.json": createProject(),
      },
      vniAssetModules: {
        "../../../assets/game003-s1/assets/l1.png": "/assets/l1.png",
      },
    });

    expect(resources.L1?.win?.project.name).toBe("L1 wins");
    expect(resources.L1?.win?.assetUrls).toEqual({
      "assets/l1.png": "/assets/l1.png",
    });
    expect(resources.L1?.win?.spec.playback.endTime).toBe(2);
  });

  it("orchestrates VNI loop playback with the same state lifecycle contract as Spine", () => {
    const manifest = structuredClone(createManifest()) as any;
    manifest.settings.additionalStateDefinitions = [
      { id: "hover", phase: "stable", playback: "loop" },
    ];
    manifest.symbols.L1.animations.normal = {
      kind: "vni",
      project: "./L1-wins.json",
      playback: { mode: "range", startTime: 0, endTime: 2, loop: true },
    };
    manifest.symbols.L1.animations.hover = {
      kind: "vni",
      project: "./L1-wins.json",
      playback: { mode: "range", startTime: 0, endTime: 2, loop: true },
    };

    const parsed = parseSymbolStateTextureManifest(manifest, {
      requiredStates,
    });
    expect(parsed.symbols.L1?.animations.normal).toMatchObject({
      kind: "vni",
      playback: { loop: true },
    });
    expect(parsed.symbols.L1?.animations.hover).toMatchObject({
      kind: "vni",
      playback: { loop: true },
    });

    const loopingOnce = structuredClone(manifest);
    loopingOnce.symbols.L1.animations.win.playback.loop = true;
    expect(() =>
      parseSymbolStateTextureManifest(loopingOnce, { requiredStates }),
    ).toThrow(/VNI playback\.loop must be false for once state/);

    const nonLoopingStable = structuredClone(manifest);
    nonLoopingStable.symbols.L1.animations.hover.playback.loop = false;
    expect(() =>
      parseSymbolStateTextureManifest(nonLoopingStable, { requiredStates }),
    ).toThrow(/VNI playback\.loop must be true for loop state/);
  });

  it("builds Spine animation resources from manifest modules and validates exact animation names", () => {
    const skeleton = readJsonAsset("H1.json");
    const atlas = readTextAsset("Symbol.atlas");
    const resources = createSymbolSpineAnimationResourcesFromManifest({
      manifest: createManifest(),
      requiredStates,
      spineSkeletonModules: {
        "../../../assets/game003-s1/H1.json": skeleton,
      },
      spineAtlasModules: {
        "../../../assets/game003-s1/Symbol.atlas": atlas,
      },
      spineTextureModules: {
        "../../../assets/game003-s1/Symbol.png": "/assets/Symbol.png",
      },
    });

    expect(resources.H1?.normal).toMatchObject({
      symbol: "H1",
      state: "normal",
      skeleton,
      atlasText: atlas,
      textureUrl: "/assets/Symbol.png",
      atlasPage: "Symbol.png",
      spec: {
        kind: "spine",
        playback: { animationName: "Idle", loop: true },
        transform: { x: 1, y: -2, scale: 0.5 },
      },
    });
    expect(resources.H1?.appear?.spec.playback).toEqual({
      mode: "animation",
      animationName: "Start",
      loop: false,
    });
  });

  it("validates the current game002-s3 Spine 4.3 resource set without copied fixtures", () => {
    const manifest = readJsonAsset("symbol-state-textures.manifest.json");
    const spineSkeletonModules = Object.fromEntries(
      [
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
      ].map((symbol) => [
        `../../../assets/game002-s3/${symbol}.json`,
        readJsonAsset(`${symbol}.json`),
      ]),
    );
    const resources = createSymbolSpineAnimationResourcesFromManifest({
      manifest,
      requiredStates,
      spineSkeletonModules,
      spineAtlasModules: {
        "../../../assets/game002-s3/Symbol.atlas":
          readTextAsset("Symbol.atlas"),
      },
      spineTextureModules: {
        "../../../assets/game002-s3/Symbol.png": "/assets/Symbol.png",
      },
    });

    expect(Object.keys(resources).sort()).toEqual([
      "AF",
      "BN",
      "CM",
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
    expect(resources.WL?.appear?.spec.playback.animationName).toBe("Start");
    expect(resources.H1?.appear?.spec.playback.animationName).toBe("Start");
    for (const symbol of ["BN"]) {
      expect(resources[symbol]?.appear).toBeUndefined();
    }
    for (const symbol of ["WL", "H1", "H2", "L1", "L2", "L3", "L4"]) {
      expect(resources[symbol]?.normal?.spec.playback).toEqual({
        mode: "animation",
        animationName: "Idle",
        loop: true,
      });
      expect(resources[symbol]?.win?.spec.playback).toEqual({
        mode: "animation",
        animationName: "Win",
        loop: false,
      });
      expect(resources[symbol]?.normal?.atlasPage).toBe("Symbol.png");
      expect(resources[symbol]?.win?.atlasPage).toBe("Symbol.png");
    }
    for (const symbol of ["WM", "CM", "AF"]) {
      expect(resources[symbol]?.normal?.spec.playback.animationName).toBe(
        "Idle",
      );
      expect(resources[symbol]?.appear?.spec.playback.animationName).toBe(
        "Start",
      );
      expect(resources[symbol]?.win).toBeUndefined();
    }
    expect(resources.CO?.normal?.spec.playback.animationName).toBe("Loop");
    expect(resources.CO?.appear?.spec.playback.animationName).toBe("Start");
    expect(resources.CO?.win).toBeUndefined();
    expect(resources.BN?.normal?.spec.playback.animationName).toBe("Idle");
  });

  it("fails fast for invalid schema and missing VNI resources", () => {
    const manifest = createManifest();

    for (const renderPriority of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "1",
      null,
    ]) {
      expect(() =>
        parseSymbolStateTextureManifest(
          {
            ...manifest,
            symbols: {
              L1: {
                ...manifest.symbols.L1,
                renderPriority,
              },
            },
          },
          { requiredStates },
        ),
      ).toThrow(/L1.*renderPriority/);
    }
    expect(() =>
      parseSymbolStateTextureManifest(
        {
          ...manifest,
          symbols: {
            L1: {
              ...manifest.symbols.L1,
              fallback: "./BN.png",
            },
          },
        },
        { requiredStates },
      ),
    ).toThrow(SymbolAssetError);
    expect(() =>
      parseSymbolStateTextureManifest(
        {
          ...manifest,
          symbols: {
            L1: {
              ...manifest.symbols.L1,
              animations: {
                sparkle: manifest.symbols.L1.animations.win,
              },
            },
          },
        },
        { requiredStates },
      ),
    ).toThrow(/unknown state/);
    expect(() =>
      createSymbolVniAnimationResourcesFromManifest({
        manifest,
        requiredStates,
        vniProjectModules: {},
        vniAssetModules: {},
      }),
    ).toThrow(/missing from modules/);
    expect(() =>
      parseSymbolStateTextureManifest(
        {
          ...manifest,
          symbols: {
            L1: {
              ...manifest.symbols.L1,
              animations: {
                win: {
                  ...manifest.symbols.L1.animations.win,
                  stageRect: { x: 0, y: 0, width: 32, height: 32 },
                },
              },
            },
          },
        },
        { requiredStates },
      ),
    ).toThrow(/unknown field "stageRect"/);
    expect(() =>
      parseSymbolStateTextureManifest(
        {
          ...manifest,
          symbols: {
            L1: {
              ...manifest.symbols.L1,
              animations: {
                appear: {
                  kind: "builtin",
                  durationSeconds: 0,
                },
              },
            },
          },
        },
        { requiredStates },
      ),
    ).toThrow(/durationSeconds/);
    expect(() =>
      createSymbolVniAnimationResourcesFromManifest({
        manifest,
        requiredStates,
        vniProjectModules: {
          "../../../assets/game003-s1/L1-wins.json": createProject(),
        },
        vniAssetModules: {},
      }),
    ).toThrow(/missing from manifest/);
  });

  it("fails fast for malformed Spine specs and missing Spine modules", () => {
    const manifest = createManifest();
    const skeleton = readJsonAsset("H1.json");
    const atlas = readTextAsset("Symbol.atlas");

    expect(() =>
      createSymbolSpineAnimationResourcesFromManifest({
        manifest,
        requiredStates,
        spineSkeletonModules: {},
        spineAtlasModules: {
          "../../../assets/game003-s1/Symbol.atlas": atlas,
        },
        spineTextureModules: {
          "../../../assets/game003-s1/Symbol.png": "/assets/Symbol.png",
        },
      }),
    ).toThrow(/Spine skeleton is missing/);
    expect(() =>
      createSymbolSpineAnimationResourcesFromManifest({
        manifest: {
          ...manifest,
          symbols: {
            H1: {
              ...manifest.symbols.H1,
              animations: {
                normal: {
                  ...manifest.symbols.H1.animations.normal,
                  playback: {
                    ...manifest.symbols.H1.animations.normal.playback,
                    animationName: "idle",
                  },
                },
              },
            },
          },
        },
        requiredStates,
        spineSkeletonModules: {
          "../../../assets/game003-s1/H1.json": skeleton,
        },
        spineAtlasModules: {
          "../../../assets/game003-s1/Symbol.atlas": atlas,
        },
        spineTextureModules: {
          "../../../assets/game003-s1/Symbol.png": "/assets/Symbol.png",
        },
      }),
    ).toThrow(/missing animation "idle"/);
    expect(() =>
      parseSymbolStateTextureManifest(
        {
          ...manifest,
          symbols: {
            H1: {
              ...manifest.symbols.H1,
              animations: {
                appear: {
                  ...manifest.symbols.H1.animations.appear,
                  playback: {
                    ...manifest.symbols.H1.animations.appear.playback,
                    loop: true,
                  },
                },
              },
            },
          },
        },
        { requiredStates },
      ),
    ).toThrow(/loop must be false/);
    expect(() =>
      parseSymbolStateTextureManifest(
        {
          ...manifest,
          symbols: {
            H1: {
              ...manifest.symbols.H1,
              animations: {
                normal: {
                  ...manifest.symbols.H1.animations.normal,
                  skeleton: "../H1.json",
                },
              },
            },
          },
        },
        { requiredStates },
      ),
    ).toThrow(/must be a local/);
    expect(() =>
      parseSymbolStateTextureManifest(
        {
          ...manifest,
          symbols: {
            H1: {
              ...manifest.symbols.H1,
              animations: {
                normal: {
                  ...manifest.symbols.H1.animations.normal,
                  transform: { scale: 0 },
                },
              },
            },
          },
        },
        { requiredStates },
      ),
    ).toThrow(/transform.scale/);
  });
});

function readTextAsset(fileName: string): string {
  return readFileSync(
    new URL(`../../../../assets/game002-s3/${fileName}`, import.meta.url),
    "utf8",
  );
}

function readJsonAsset(fileName: string): unknown {
  return JSON.parse(readTextAsset(fileName)) as unknown;
}
