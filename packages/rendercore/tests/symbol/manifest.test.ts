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
  upgradeSymbolStateTextureManifest,
} from "../../src/symbol/index.js";

const requiredStates = ["spinBlur", "disabled"] as const;
const TEST_SPINE_SKELETON = {
  skeleton: { spine: "4.3.23" },
  animations: { Idle: {}, Start: {} },
};
const TEST_SPINE_ATLAS =
  "Symbol.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n";

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
  it("strictly upgrades v1 lifecycle defaults into a frozen canonical v2 manifest", () => {
    const legacy = createManifest() as any;
    legacy.settings.additionalStateDefinitions = [
      { id: "burst", phase: "once", playback: "once" },
    ];

    const upgraded = upgradeSymbolStateTextureManifest(legacy) as any;
    const definitions = upgraded.settings.stateDefinitions;

    expect(upgraded.version).toBe(2);
    expect(upgraded.settings.additionalStateDefinitions).toBeUndefined();
    expect(definitions.find((item: any) => item.id === "remove")).toMatchObject(
      { afterComplete: "terminal" },
    );
    expect(definitions.find((item: any) => item.id === "win")).toMatchObject({
      afterComplete: "return-to-default",
    });
    expect(definitions.find((item: any) => item.id === "burst")).toMatchObject({
      afterComplete: "return-to-default",
    });
    expect(parseSymbolStateTextureManifest(upgraded).version).toBe(2);
    expect(upgradeSymbolStateTextureManifest(upgraded)).toEqual(upgraded);
    expect(Object.isFrozen(upgraded.settings.stateDefinitions)).toBe(true);
  });

  it("uses explicit v2 completion behavior and rejects incomplete or mixed definitions", () => {
    const canonical = upgradeSymbolStateTextureManifest(
      createManifest(),
    ) as any;
    const explicit = structuredClone(canonical);
    explicit.settings.stateDefinitions.find(
      (item: any) => item.id === "remove",
    ).afterComplete = "return-to-default";

    expect(
      parseSymbolStateTextureManifest(explicit).statePreset.states.find(
        (item) => item.id === "remove",
      )?.afterComplete,
    ).toBe("return-to-default");

    const missing = structuredClone(canonical);
    delete missing.settings.stateDefinitions.find(
      (item: any) => item.id === "win",
    ).afterComplete;
    expect(() => parseSymbolStateTextureManifest(missing)).toThrow(
      /requires afterComplete/,
    );

    const mixed = structuredClone(canonical);
    mixed.settings.additionalStateDefinitions = [];
    expect(() => parseSymbolStateTextureManifest(mixed)).toThrow(/unknown/);
  });

  it("strictly parses additive composite animation layers", () => {
    const manifest = createManifest() as any;
    manifest.symbols.SC.animations.win = {
      kind: "composite",
      base: { kind: "normal" },
      layers: [
        {
          id: "glow-back",
          placement: "underlay",
          animation: {
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
        {
          id: "burst-front",
          placement: "overlay",
          animation: {
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
      ],
    };

    const parsed = parseSymbolStateTextureManifest(manifest);

    expect(parsed.symbols.SC.animations.win).toEqual(
      expect.objectContaining({
        kind: "composite",
        base: { kind: "normal" },
        layers: [
          expect.objectContaining({ id: "glow-back", placement: "underlay" }),
          expect.objectContaining({
            id: "burst-front",
            placement: "overlay",
          }),
        ],
      }),
    );
  });

  it.each([
    ["empty layers", (value: any) => (value.layers = []), /non-empty/],
    [
      "duplicate id",
      (value: any) => value.layers.push(structuredClone(value.layers[0])),
      /duplicate layer id/,
    ],
    [
      "bad placement",
      (value: any) => (value.layers[0].placement = "middle"),
      /placement/,
    ],
    ["bad id", (value: any) => (value.layers[0].id = "Bad_Id"), /kebab-case/],
    [
      "nested composite",
      (value: any) => (value.layers[0].animation = structuredClone(value)),
      /cannot contain/,
    ],
    [
      "missing state texture",
      (value: any) => (value.base.kind = "stateTexture"),
      /state texture/,
    ],
  ])("rejects invalid composite animation: %s", (_label, mutate, pattern) => {
    const manifest = createManifest() as any;
    const composite = {
      kind: "composite",
      base: { kind: "normal" },
      layers: [
        {
          id: "front",
          placement: "overlay",
          animation: {
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
      ],
    };
    mutate(composite);
    manifest.symbols.SC.animations.win = composite;
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(pattern);
  });

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
    expect(parsed.symbols.H1.imageStringNodes).toEqual([
      expect.objectContaining({
        name: "coin-value",
        targets: [{ state: "normal", slot: "Num" }],
      }),
    ]);
    expect(Object.isFrozen(parsed.symbols.H1.imageStringNodes)).toBe(true);
    expect(parsed.symbols.L1.imageStringNodes).toEqual([]);
  });

  it("shares one named ImgNumber slot across Spine states and keeps non-Spine targets exact", () => {
    const manifest = createManifest() as any;
    manifest.symbols.H1.imageStringNodes = [
      {
        name: "coin-value",
        resource:
          "./dependencies/image-strings/coin-digits/image-string.manifest.json",
        spineSlot: "Num",
        targets: [{ state: "win" }],
        initialText: "1",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: true,
      },
    ];
    const node =
      parseSymbolStateTextureManifest(manifest).symbols.H1.imageStringNodes[0]!;
    expect(node.spineSlot).toBe("Num");
    expect(node.targets).toEqual([{ state: "win" }]);

    manifest.symbols.H1.imageStringNodes[0].targets.push({
      state: "appear",
    });
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(
      /must be non-Spine/,
    );
  });

  it("parses an exact spinBlur ImgNumber profile and rejects divergent special values", () => {
    const manifest = createManifest() as any;
    manifest.symbols.L1.imageStringNodes = [
      {
        name: "coin-value",
        resource: "./digits.image-string.manifest.json",
        targets: [{ state: "spinBlur" }],
        initialText: "1",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: true,
        specialValueImages: [{ value: 100, image: "./max.png" }],
        spinBlurProfile: {
          resource: "./digits-blur.image-string.manifest.json",
          specialValueImages: [{ value: 100, image: "./max.blur.png" }],
        },
      },
    ];
    expect(
      parseSymbolStateTextureManifest(manifest).symbols.L1.imageStringNodes[0]
        ?.spinBlurProfile,
    ).toEqual({
      resource: "./digits-blur.image-string.manifest.json",
      specialValueImages: [{ value: 100, image: "./max.blur.png" }],
    });

    manifest.symbols.L1.imageStringNodes[0].spinBlurProfile.specialValueImages[0].value = 200;
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(
      /values must exactly match/,
    );
    manifest.symbols.L1.imageStringNodes[0].spinBlurProfile.specialValueImages[0].value = 100;
    manifest.symbols.L1.imageStringNodes[0].targets = [{ state: "win" }];
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(
      /requires a non-Spine spinBlur target/,
    );
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
      "slot on non-Spine target",
      (nodes: any[]) => (nodes[0].target.state = "win"),
      /only allowed for a Spine-backed state/,
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

  it("parses canonical multi-target nodes and rejects duplicates or mixed legacy fields", () => {
    const manifest = createManifest() as any;
    manifest.symbols.H1.imageStringNodes = [
      {
        name: "coin-value",
        resource:
          "./dependencies/image-strings/coin-digits/image-string.manifest.json",
        targets: [
          { state: "normal", slot: "Num" },
          { state: "appear", slot: "Num" },
        ],
        initialText: "1",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: false,
      },
    ];
    expect(
      parseSymbolStateTextureManifest(manifest).symbols.H1.imageStringNodes[0]
        ?.targets,
    ).toEqual([
      { state: "normal", slot: "Num" },
      { state: "appear", slot: "Num" },
    ]);
    manifest.symbols.H1.imageStringNodes[0].targets.push({
      state: "normal",
      slot: "Num",
    });
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(
      /duplicate state\/slot/,
    );
    manifest.symbols.H1.imageStringNodes[0].targets.pop();
    manifest.symbols.H1.imageStringNodes[0].target = {
      state: "normal",
      slot: "Num",
    };
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(
      /both target and targets/,
    );
  });

  it("parses direct non-Spine targets and strict special value images", () => {
    const manifest = createManifest() as any;
    manifest.symbols.L1.imageStringNodes = [
      {
        name: "coin-value",
        resource:
          "./dependencies/image-strings/coin-digits/image-string.manifest.json",
        targets: [{ state: "normal" }, { state: "win" }],
        initialText: "200",
        specialValueImages: [
          { value: 200, image: "./mini.png" },
          { value: 500, image: "./maxi.webp" },
        ],
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: false,
      },
    ];
    const parsed = parseSymbolStateTextureManifest(manifest);
    expect(parsed.symbols.L1.imageStringNodes[0]).toMatchObject({
      targets: [{ state: "normal" }, { state: "win" }],
      specialValueImages: [
        { value: 200, image: "./mini.png" },
        { value: 500, image: "./maxi.webp" },
      ],
    });

    manifest.symbols.L1.imageStringNodes[0].specialValueImages.push({
      value: 200,
      image: "./duplicate.png",
    });
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(
      /duplicate value/,
    );
    manifest.symbols.L1.imageStringNodes[0].specialValueImages.pop();
    manifest.symbols.L1.imageStringNodes[0].specialValueImages[0].extra = true;
    expect(() => parseSymbolStateTextureManifest(manifest)).toThrow(/unknown/);
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
          "../../../assets/sample-skin/L1.png": "/L1.png",
          "../../../assets/sample-skin/L1.spinBlur.png": "/L1.spinBlur.png",
          "../../../assets/sample-skin/L1.disabled.png": "/L1.disabled.png",
          "../../../assets/sample-skin/SC-0.png": "/SC-0.png",
          "../../../assets/sample-skin/SC-1.png": "/SC-1.png",
          "../../../assets/sample-skin/SC.spinBlur.png": "/SC.spinBlur.png",
          "../../../assets/sample-skin/SC.disabled.png": "/SC.disabled.png",
          "../../../assets/sample-skin/H1.png": "/H1.png",
          "../../../assets/sample-skin/H1.spinBlur.png": "/H1.spinBlur.png",
          "../../../assets/sample-skin/H1.disabled.png": "/H1.disabled.png",
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
        "../../../assets/sample-skin/L1-wins.json": createProject(),
      },
      vniAssetModules: {
        "../../../assets/sample-skin/assets/l1.png": "/assets/l1.png",
      },
    });

    expect(resources.L1?.win?.project.name).toBe("L1 wins");
    expect(resources.L1?.win?.assetUrls).toEqual({
      "assets/l1.png": "/assets/l1.png",
    });
    expect(resources.L1?.win?.spec.playback.endTime).toBe(2);
  });

  it("resolves hash-flat VNI assets relative to the materialized project module", () => {
    const manifest = structuredClone(createManifest()) as any;
    manifest.symbols.L1.animations.win.project = "./assets/project.json";
    const project = createProject();
    project.assets[0].path = "texture.png";

    const resources = createSymbolVniAnimationResourcesFromManifest({
      manifest,
      requiredStates,
      vniProjectModules: {
        "assets/project.json": project,
      },
      vniAssetModules: {
        "assets/texture.png": "/blob/correct",
        "other/texture.png": "/blob/decoy",
      },
    });

    expect(resources.L1?.win?.assetUrls).toEqual({
      "texture.png": "/blob/correct",
    });
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
    const skeleton = TEST_SPINE_SKELETON;
    const atlas = TEST_SPINE_ATLAS;
    const resources = createSymbolSpineAnimationResourcesFromManifest({
      manifest: createManifest(),
      requiredStates,
      spineSkeletonModules: {
        "../../../assets/sample-skin/H1.json": skeleton,
      },
      spineAtlasModules: {
        "../../../assets/sample-skin/Symbol.atlas": atlas,
      },
      spineTextureModules: {
        "../../../assets/sample-skin/Symbol.png": "/assets/Symbol.png",
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

  it("binds an optimized Spine texture key without comparing it to the atlas page name", () => {
    const manifest = structuredClone(createManifest());
    for (const animation of Object.values(manifest.symbols.H1.animations)) {
      if (animation?.kind === "spine") {
        animation.texture = "./content-addressed-texture.webp";
      }
    }

    const resources = createSymbolSpineAnimationResourcesFromManifest({
      manifest,
      requiredStates,
      spineSkeletonModules: {
        "../../../assets/sample-skin/H1.json": TEST_SPINE_SKELETON,
      },
      spineAtlasModules: {
        "../../../assets/sample-skin/Symbol.atlas": TEST_SPINE_ATLAS,
      },
      spineTextureModules: {
        "../../../assets/sample-skin/content-addressed-texture.webp":
          "/assets/physical-hash.webp",
      },
    });

    expect(resources.H1?.normal?.atlasPage).toBe("Symbol.png");
    expect(resources.H1?.normal?.textureUrl).toBe("/assets/physical-hash.webp");
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
          "../../../assets/sample-skin/L1-wins.json": createProject(),
        },
        vniAssetModules: {},
      }),
    ).toThrow(/missing from manifest/);
  });

  it("fails fast for malformed Spine specs and missing Spine modules", () => {
    const manifest = createManifest();
    const skeleton = TEST_SPINE_SKELETON;
    const atlas = TEST_SPINE_ATLAS;

    expect(() =>
      createSymbolSpineAnimationResourcesFromManifest({
        manifest,
        requiredStates,
        spineSkeletonModules: {},
        spineAtlasModules: {
          "../../../assets/sample-skin/Symbol.atlas": atlas,
        },
        spineTextureModules: {
          "../../../assets/sample-skin/Symbol.png": "/assets/Symbol.png",
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
          "../../../assets/sample-skin/H1.json": skeleton,
        },
        spineAtlasModules: {
          "../../../assets/sample-skin/Symbol.atlas": atlas,
        },
        spineTextureModules: {
          "../../../assets/sample-skin/Symbol.png": "/assets/Symbol.png",
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
