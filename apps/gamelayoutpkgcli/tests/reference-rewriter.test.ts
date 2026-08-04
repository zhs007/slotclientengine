import { describe, expect, it } from "vitest";
import {
  rewriteImageStringManifest,
  rewriteLayoutManifest,
  rewritePopupManifest,
  rewriteSymbolManifest,
  rewriteSymbolPackageManifest,
  rewriteVniProject,
} from "../src/reference-rewriter.js";
import { layoutFixture } from "./fixtures.js";

const mapping = new Map([
  ["alpha.png", "alpha.webp"],
  ["digit.png", "digit.webp"],
  ["symbol.png", "symbol.webp"],
  ["symbol-disabled.png", "symbol-disabled.webp"],
  ["popup.png", "popup.webp"],
  ["vni.png", "vni.webp"],
  ["runtime.json", "runtime.hash.json"],
]);

describe("typed asset reference rewriting", () => {
  it("rewrites layout and image-string image fields", () => {
    const layout = rewriteLayoutManifest(layoutFixture(), mapping);
    expect(layout.nodes[0]?.resource).toMatchObject({
      kind: "image",
      path: "alpha.webp",
    });
    const imageString = rewriteImageStringManifest(
      {
        version: 1,
        kind: "image-string",
        id: "digits",
        metrics: { lineHeight: 10, letterSpacing: 0 },
        glyphs: {
          "1": {
            path: "digit.png",
            size: { width: 5, height: 8 },
            offset: { x: 0, y: 1 },
          },
        },
        fixedAdvanceGroups: [],
      },
      mapping,
    );
    expect(imageString.glyphs["1"]?.path).toBe("digit.webp");

    const withVni = rewriteLayoutManifest(
      {
        ...layoutFixture(),
        nodes: [
          ...layoutFixture().nodes,
          {
            id: "vni-fx",
            order: 3,
            resource: {
              kind: "vni",
              project: "runtime.json",
              loop: false,
            },
            placements: {
              default: {
                x: 0,
                y: 0,
                scale: 1,
                rotation: 180,
                center: { x: 0.25, y: 0.75 },
              },
            },
          },
        ],
      },
      mapping,
    );
    expect(withVni.nodes.at(-1)?.resource).toEqual({
      kind: "vni",
      project: "runtime.hash.json",
      loop: false,
    });
    expect(withVni.nodes.at(-1)?.placements.default).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 180,
      center: { x: 0.25, y: 0.75 },
    });

    const withRuntime = rewriteLayoutManifest(
      {
        ...layoutFixture(),
        runtimeResources: {
          "nearwin.fx": {
            kind: "spine",
            skeleton: "symbol.json",
            atlas: "symbol.atlas",
            textures: { "symbol.png": "symbol.png" },
          },
        },
      },
      mapping,
    );
    expect(withRuntime.runtimeResources?.["nearwin.fx"]).toEqual({
      kind: "spine",
      skeleton: "symbol.json",
      atlas: "symbol.atlas",
      textures: { "symbol.png": "symbol.webp" },
    });
  });

  it("rewrites symbol package and all declared symbol image fields", () => {
    const packageManifest = rewriteSymbolPackageManifest(
      {
        version: 1,
        kind: "symbol-package",
        id: "symbols-one",
        cellSize: { width: 10, height: 10 },
        entrypoints: {
          gameConfig: "gameconfig.json",
          symbolManifest: "symbol-manifest.json",
        },
        resources: ["symbol-disabled.png", "symbol.png", "symbol.spine.json"],
      },
      mapping,
    );
    expect(packageManifest.resources).toEqual([
      "symbol-disabled.webp",
      "symbol.spine.json",
      "symbol.webp",
    ]);
    const symbol = rewriteSymbolManifest(
      {
        version: 1,
        states: ["disabled"],
        settings: {},
        symbols: {
          A: {
            normal: "./symbol.png",
            disabled: "./symbol-disabled.png",
            scale: 1,
            animations: {
              normal: {
                kind: "spine",
                skeleton: "./symbol.spine.json",
                atlas: "./symbol.atlas",
                texture: "./symbol.png",
                playback: {
                  mode: "animation",
                  animationName: "Idle",
                  loop: true,
                },
              },
            },
          },
        },
      },
      mapping,
    ) as any;
    expect(symbol.symbols.A.normal).toBe("./symbol.webp");
    expect(symbol.symbols.A.disabled).toBe("./symbol-disabled.webp");
    expect(symbol.symbols.A.animations.normal.texture).toBe("./symbol.webp");
  });

  it("rewrites popup resource identity and its layer bindings", () => {
    const tier = (id: string) => ({
      countDurationSeconds: 1,
      layers: [
        {
          id: `layer-${id}`,
          order: 0,
          resource: "popup.png",
          kind: "image",
          transform: { x: 0, y: 0, scale: 1 },
          anchor: { x: 0.5, y: 0.5 },
          visibleSegments: ["start", "loop", "end"],
        },
        {
          id: `amount-${id}`,
          order: 1,
          resource: "amount",
          kind: "image-string",
          binding: "win-amount",
          transform: { x: 0, y: 0, scale: 1 },
          anchor: { x: 0.5, y: 0.5 },
        },
        {
          id: `effect-${id}`,
          order: 2,
          resource: "runtime.json",
          kind: "vni",
          playback: { mode: "once" },
          transform: { x: 0, y: 0, scale: 1 },
        },
      ],
    });
    const popup = rewritePopupManifest(
      {
        version: 1,
        kind: "popup",
        id: "award",
        type: "award-celebration",
        designViewport: { width: 100, height: 100 },
        amountFormat: {
          rawScale: 1,
          fractionDigits: 0,
          useGrouping: false,
          groupSeparator: ",",
          decimalSeparator: ".",
          prefix: "",
          suffix: "",
          rounding: "floor",
        },
        resources: {
          amount: {
            kind: "image-string",
            manifest:
              "dependencies/image-strings/amount/image-string.manifest.json",
          },
          "popup.png": {
            kind: "image",
            path: "popup.png",
            size: { width: 1, height: 1 },
          },
          "runtime.json": {
            kind: "vni",
            project: "runtime.json",
          },
        },
        awardCelebration: {
          base: tier("base"),
          standard: tier("standard"),
          celebrationTiers: [
            { ...tier("bigwin"), id: "bigwin", thresholdMultiplier: 2 },
            { ...tier("superwin"), id: "superwin", thresholdMultiplier: 3 },
            { ...tier("megawin"), id: "megawin", thresholdMultiplier: 4 },
          ],
        },
      },
      mapping,
    );
    expect(popup.resources["popup.webp"]).toMatchObject({
      kind: "image",
      path: "popup.webp",
    });
    expect(popup.awardCelebration.base.layers[0]?.resource).toBe("popup.webp");
    expect(popup.resources["runtime.hash.json"]).toMatchObject({
      kind: "vni",
      project: "runtime.hash.json",
    });
    expect(popup.awardCelebration.base.layers[2]).toMatchObject({
      resource: "runtime.hash.json",
      playback: { mode: "once" },
    });
  });

  it("rewrites VNI asset.path while preserving authored identity", () => {
    const project = rewriteVniProject(vniProject(), mapping);
    expect(project.assets[0]).toMatchObject({
      id: "asset",
      path: "vni.webp",
      originalName: "authored.png",
      width: 8,
      height: 8,
    });
  });
});

function vniProject() {
  return {
    schemaVersion: "VNI_0.010",
    editor: { name: "VNI", version: "VNI_0.010" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "fixture",
    stage: {
      width: 100,
      height: 100,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "asset",
        type: "image",
        path: "vni.png",
        originalName: "authored.png",
        width: 8,
        height: 8,
      },
    ],
    layerGroups: [
      {
        id: "group",
        name: "Group",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [
      {
        id: "layer",
        name: "Layer",
        type: "image",
        assetId: "asset",
        parentId: null,
        groupId: "group",
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
