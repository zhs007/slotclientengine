import { describe, expect, it } from "vitest";
import {
  SymbolAssetError,
  createSymbolAssetMapFromManifestModules,
  createSymbolScaleMapFromManifest,
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
  it("parses settings, display symbols, scales, single normals and layered normals", () => {
    const manifest = createManifest();

    expect(
      getSymbolDisplaySymbolsFromManifest(manifest, { requiredStates }),
    ).toEqual(["L1", "SC"]);
    expect(
      createSymbolScaleMapFromManifest({
        manifest,
        requiredStates,
        requireExplicitScale: true,
      }),
    ).toEqual({ L1: 1, SC: 0.8 });
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

  it("fails fast for invalid schema and missing VNI resources", () => {
    const manifest = createManifest();

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
});
