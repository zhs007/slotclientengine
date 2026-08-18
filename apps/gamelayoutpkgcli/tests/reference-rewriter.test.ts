import { describe, expect, it } from "vitest";
import { upgradeSceneLayoutManifestToLatest } from "@slotclientengine/rendercore/scene-layout/data";
import {
  rewriteImageStringManifest,
  rewriteLayoutManifest,
  rewritePopupManifest,
  rewriteOptimizedAudioAssets,
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
  ["Title.woff2", "title.hash.woff2"],
  ["bonus.manifest.json", "bonus.hash.json"],
  ["effect.json", "effect.hash.json"],
  ["effect.atlas", "effect.hash.atlas"],
  ["effect.png", "effect.webp"],
  ["base.wav", "base.m4a"],
  ["coin.ogg", "coin.m4a"],
]);

describe("typed asset reference rewriting", () => {
  it("rewrites optimized audio paths and media types together", () => {
    expect(
      rewriteOptimizedAudioAssets(
        {
          version: 1,
          music: [
            {
              name: "base",
              asset: {
                sources: [{ path: "base.wav", mediaType: "audio/wav" }],
              },
              loop: true,
              fadeOutSeconds: 1,
              fadeInSeconds: 1,
            },
          ],
          effects: [
            {
              name: "coin",
              asset: {
                sources: [{ path: "coin.ogg", mediaType: "audio/ogg" }],
              },
              playback: "once",
              offsetSeconds: 0,
              voices: { maxConcurrent: 1, overflow: "restart-oldest" },
              bgm: { kind: "keep" },
            },
          ],
          programmaticEffects: ["coin"],
        },
        mapping,
      ),
    ).toMatchObject({
      music: [
        {
          asset: {
            sources: [{ path: "base.m4a", mediaType: "audio/mp4" }],
          },
        },
      ],
      effects: [
        {
          asset: {
            sources: [{ path: "coin.m4a", mediaType: "audio/mp4" }],
          },
        },
      ],
    });
  });

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
      textures: { "symbol.webp": "symbol.webp" },
    });

    const withNone = rewriteLayoutManifest(
      {
        ...layoutFixture(),
        gameModes: {
          ...layoutFixture().gameModes!,
          transitions: [
            {
              from: "Alpha",
              to: "Beta",
              overlay: { kind: "none" },
            },
          ],
        },
      },
      mapping,
    );
    expect(withNone.gameModes?.transitions?.[0]).toEqual({
      from: "Alpha",
      to: "Beta",
      overlay: { kind: "none" },
    });
  });

  it("preserves a canonical v3 runtime allocation while rewriting paths", () => {
    const latest = upgradeSceneLayoutManifestToLatest(layoutFixture());
    const rewritten = rewriteLayoutManifest(latest, mapping);
    expect(rewritten.version).toBe(4);
    if (rewritten.version !== 4) throw new Error("Expected layout v4.");
    expect(rewritten.runtimeAllocation).toEqual(latest.runtimeAllocation);
    expect(rewritten.nodes[0]?.resource).toMatchObject({
      kind: "image",
      path: "alpha.webp",
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
        {
          id: `title-${id}`,
          order: 3,
          resource: "Title.woff2",
          kind: "text",
          name: "congratulations",
          defaultText: "CONGRATULATIONS!",
          transform: { x: 0, y: 0, scale: 1, rotation: 4 },
          anchor: { x: 0.5, y: 0.5 },
          style: {
            fontSize: 72,
            letterSpacing: 1,
            fill: { kind: "solid", color: "#ffffff" },
            arcDegrees: 20,
          },
          visibleSegments: ["start", "loop"],
        },
        {
          id: `bonus-${id}`,
          order: 4,
          resource: "bonus.manifest.json",
          kind: "image-string",
          name: "bonus-count",
          binding: "manual",
          defaultText: "8",
          transform: { x: 0, y: 0, scale: 1 },
          anchor: { x: 0.5, y: 0.5 },
          parent: { kind: "popup-root" },
          visibleSegments: ["loop"],
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
          "Title.woff2": { kind: "font", path: "Title.woff2" },
          "bonus.manifest.json": {
            kind: "image-string",
            manifest: "bonus.manifest.json",
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
    expect(popup.type).toBe("award-celebration");
    if (popup.type !== "award-celebration")
      throw new Error("Expected award celebration popup fixture.");
    expect(popup.awardCelebration.base.layers[0]?.resource).toBe("popup.webp");
    expect(popup.resources["runtime.hash.json"]).toMatchObject({
      kind: "vni",
      project: "runtime.hash.json",
    });
    expect(popup.awardCelebration.base.layers[2]).toMatchObject({
      resource: "runtime.hash.json",
      playback: { mode: "once" },
    });
    expect(popup.awardCelebration.base.layers[3]).toMatchObject({
      kind: "text",
      name: "congratulations",
      resource: "title.hash.woff2",
      style: { arcDegrees: 20 },
    });
    expect(popup.awardCelebration.base.layers[4]).toMatchObject({
      kind: "image-string",
      name: "bonus-count",
      resource: "bonus.hash.json",
    });
    const latest = rewritePopupManifest(popup, new Map());
    expect(latest.version).toBe(7);
    expect(latest.backdrop.visibleStates).toEqual([
      "base",
      "standard",
      "bigwin",
      "superwin",
      "megawin",
    ]);
    if (latest.type !== "award-celebration")
      throw new Error("Expected latest award popup.");
    expect(latest.awardCelebration.base.layers[0]).not.toHaveProperty(
      "visibleStates",
    );
  });

  it("rewrites Spine prompt and string overlay resources without changing node identity", () => {
    const popup = rewritePopupManifest(
      {
        version: 1,
        kind: "popup",
        id: "free-game",
        type: "spine",
        designViewport: { width: 100, height: 100 },
        resources: {
          "effect.json": {
            kind: "spine",
            skeleton: "effect.json",
            atlas: "effect.atlas",
            textures: { "effect.png": "effect.png" },
          },
          "Title.woff2": { kind: "font", path: "Title.woff2" },
          "bonus.manifest.json": {
            kind: "image-string",
            manifest: "bonus.manifest.json",
          },
        },
        spine: {
          resource: "effect.json",
          transform: { x: 0, y: 0, scale: 1 },
          playback: {
            mode: "segmented-animations",
            startAnimation: "Start",
            loopAnimation: "Loop",
            endAnimation: "End",
          },
          prompt: {
            font: "Title.woff2",
            defaultText: "CONTINUE",
            fill: "#ffffff",
            order: 0,
            area: { x: 0, y: 0, width: 80, height: 20 },
          },
          overlays: [
            {
              id: "bonus",
              kind: "image-string",
              name: "bonus-count",
              binding: "manual",
              defaultText: "8",
              order: 1,
              resource: "bonus.manifest.json",
              transform: { x: 0, y: 0, scale: 1, rotation: 0 },
              anchor: { x: 0.5, y: 0.5 },
              visibleSegments: ["loop"],
            },
            {
              id: "title",
              kind: "text",
              name: "heading",
              defaultText: "BONUS!",
              order: 2,
              resource: "Title.woff2",
              transform: { x: 0, y: 0, scale: 1, rotation: 0 },
              anchor: { x: 0.5, y: 0.5 },
              style: {
                fontSize: 32,
                letterSpacing: 0,
                fill: { kind: "solid", color: "#ffffff" },
                arcDegrees: 0,
              },
              visibleSegments: ["start", "loop"],
            },
          ],
        },
      },
      mapping,
    );
    expect(popup.type).toBe("spine");
    if (popup.type !== "spine") throw new Error("Expected Spine popup.");
    expect(popup.version).toBe(7);
    expect(popup.spine).toMatchObject({
      resource: "effect.hash.json",
      overlays: [
        { name: "prompt", resource: "title.hash.woff2" },
        { name: "bonus-count", resource: "bonus.hash.json" },
        { name: "heading", resource: "title.hash.woff2" },
      ],
    });
  });

  it("preserves focus-only v3 fields while rewriting Popup resources", () => {
    const popup = rewritePopupManifest(
      {
        version: 3,
        kind: "popup",
        id: "free-game-v3",
        name: "Free Game V3",
        type: "spine",
        adaptation: {
          mode: "maximized-focus",
          focus: { left: 1000, right: 2000, top: 3000, bottom: 4000 },
        },
        backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
        resources: {
          "effect.json": {
            kind: "spine",
            skeleton: "effect.json",
            atlas: "effect.atlas",
            textures: { "effect.png": "effect.png" },
          },
        },
        spine: {
          resource: "effect.json",
          transform: { x: 0, y: 0, scale: 1 },
          playback: {
            mode: "segmented-animations",
            startAnimation: "Start",
            loopAnimation: "Loop",
            endAnimation: "End",
          },
        },
      },
      new Map([
        ["effect.json", "effect.hash.json"],
        ["effect.atlas", "effect.hash.atlas"],
        ["effect.png", "effect.hash.png"],
      ]),
    );
    expect(popup).toMatchObject({
      version: 7,
      adaptation: {
        focus: { left: 1000, right: 2000, top: 3000, bottom: 4000 },
      },
      spine: { resource: "effect.hash.json" },
    });
    expect(popup).not.toHaveProperty("designViewport");
  });

  it("preserves v4 Spine attachment identities while rewriting resources", () => {
    const popup = rewritePopupManifest(
      {
        version: 4,
        kind: "popup",
        id: "free-game-v4",
        name: "Free Game V4",
        type: "spine",
        adaptation: {
          mode: "maximized-focus",
          focus: { left: 50, right: 50, top: 50, bottom: 50 },
        },
        backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
        resources: {
          "effect.json": {
            kind: "spine",
            skeleton: "effect.json",
            atlas: "effect.atlas",
            textures: { "effect.png": "effect.png" },
          },
        },
        spine: {
          resource: "effect.json",
          transform: { x: 0, y: 0, scale: 1 },
          playback: {
            mode: "segmented-animations",
            startAnimation: "Start",
            loopAnimation: "Loop",
            endAnimation: "End",
          },
          overlays: [
            {
              id: "nested",
              kind: "spine",
              resource: "effect.json",
              order: 1,
              alpha: 1,
              attachment: {
                kind: "spine-slot",
                target: { kind: "main-spine" },
                slot: "Fx",
              },
              transform: { x: 0, y: 0, scale: 1, rotation: 0 },
              playback: {
                mode: "segmented-animations",
                startAnimation: "Start",
                loopAnimation: "Loop",
                endAnimation: "End",
              },
            },
          ],
        },
      },
      new Map([
        ["effect.json", "effect.hash.json"],
        ["effect.atlas", "effect.hash.atlas"],
        ["effect.png", "effect.webp"],
      ]),
    );
    expect(popup).toMatchObject({
      version: 7,
      spine: {
        resource: "effect.hash.json",
        overlays: [
          {
            resource: "effect.hash.json",
            attachment: {
              target: { kind: "main-spine" },
              slot: "Fx",
            },
          },
        ],
      },
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
