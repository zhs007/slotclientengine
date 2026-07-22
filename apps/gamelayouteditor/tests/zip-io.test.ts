import { strToU8, zipSync } from "fflate";
import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { decodeEditorAssetsMap } from "@slotclientengine/editorresource";
import {
  exportLayoutZip,
  materializeLayoutOwnedAssets,
  stableManifestJson,
} from "../src/io/exported-layout-zip.js";
import {
  extractBoundedZip,
  importLayoutZip,
  LAYOUT_ZIP_LIMITS,
  validateLayoutAssets,
} from "../src/io/imported-layout-zip.js";
import { assetBytes, imageManifest } from "./fixtures.js";
import {
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { popupFiles } from "./popup-fixture.js";

const decodeImage = async () => ({ width: 1, height: 1 });

const encode = (value: unknown) => strToU8(`${JSON.stringify(value)}\n`);

function mappedEntry(
  entries: ReadonlyMap<string, Uint8Array>,
  key: string,
): Uint8Array | undefined {
  const map = decodeEditorAssetsMap(entries.get("assets.map.json")!);
  const entry = map.files[key];
  return entry ? entries.get(entry.path) : undefined;
}

function compositePackageFixture() {
  const dependencyPath = "image-string.manifest.json";
  const imageStringManifest = {
    version: 1,
    kind: "image-string",
    id: "digits",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs: {
      "0": {
        path: "0.png",
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    },
    fixedAdvanceGroups: [],
  };
  const symbolPackage = {
    version: 1,
    kind: "symbol-package",
    id: "demo-symbols",
    cellSize: { width: 20, height: 20 },
    entrypoints: {
      gameConfig: "gameconfig.json",
      symbolManifest: "symbol-state-textures.manifest.json",
    },
    resources: ["a.png"],
  };
  const gameConfig = {
    paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
    symbolCodes: { A: 0 },
    reels: { main: [[0], [0]] },
  };
  const symbolManifest = {
    version: 1,
    states: [],
    symbols: { A: { normal: "./a.png", scale: 1 } },
  };
  const manifest = {
    ...imageManifest,
    nodes: [
      {
        ...imageManifest.nodes[0],
        resource: { ...imageManifest.nodes[0].resource, path: "bg.png" },
      },
      {
        id: "amount",
        order: 2,
        resource: {
          kind: "image-string" as const,
          manifest: dependencyPath,
          text: "000",
          anchor: { x: 0.5, y: 0.5 },
        },
        placements: { default: { x: 50, y: 50, scale: 1 } },
      },
    ],
    reels: { main: { ...imageManifest.reels.main, order: 1 } },
    symbolPackages: {
      "demo-symbols": {
        manifest: "symbols.package.json",
        reel: "main" as const,
        reelSet: "main",
        renderMode: "standard" as const,
      },
    },
    gameModes: {
      initialMode: "BaseGame",
      transitions: [],
      modes: [
        {
          id: "BaseGame",
          backgroundNodes: { default: "bg" },
          nodeStates: {},
          symbolPackage: "demo-symbols",
        },
      ],
    },
  };
  const assets = new Map([["bg.png", assetBytes.get("assets/bg.png")!]]);
  assets.set(dependencyPath, encode(imageStringManifest));
  assets.set("0.png", new Uint8Array([4]));
  const symbolFiles = new Map([
    ["symbols.package.json", encode(symbolPackage)],
    ["gameconfig.json", encode(gameConfig)],
    ["symbol-state-textures.manifest.json", encode(symbolManifest)],
    ["a.png", new Uint8Array([5])],
  ]);
  return {
    manifest,
    assets,
    symbolFiles,
    symbolFilesById: new Map([["demo-symbols", symbolFiles]]),
  };
}

describe("layout zip IO", () => {
  it("maps uppercase owned filename keys to lowercase hashed package paths", async () => {
    const key = "BG_2.webp";
    const manifest = {
      ...imageManifest,
      nodes: imageManifest.nodes.map((node) => ({
        ...node,
        resource: { ...node.resource, path: key },
      })),
    };
    const webp = new Uint8Array([82, 73, 70, 70, 1, 0, 0, 0, 87, 69, 66, 80]);
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const exported = await exportLayoutZip({
        manifest,
        assets: new Map([[key, webp]]),
        decodeImage,
      });
      const entries = extractBoundedZip(exported.bytes);
      expect(
        [...entries.keys()].every((path) => path === path.toLowerCase()),
      ).toBe(true);
      const map = decodeEditorAssetsMap(entries.get("assets.map.json")!);
      expect(map.files[key]?.path).toMatch(/^assets\/[a-f0-9]{64}\.webp$/u);
      expect(entries.get(map.files[key]!.path)).toEqual(webp);
      expect(
        JSON.parse(
          new TextDecoder().decode(entries.get("layout.manifest.json")),
        ).nodes[0].resource.path,
      ).toBe(key);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("deterministically round-trips an owned MP4 video transition without re-encoding", async () => {
    const sourcePath = `assets/${"c".repeat(64)}.mp4`;
    const mp4 = new Uint8Array([
      0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 1, 2, 3, 4,
    ]);
    const manifest = {
      ...imageManifest,
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: { default: "bg" },
            nodeStates: {},
          },
          {
            id: "FreeGame",
            backgroundNodes: { default: "bg" },
            nodeStates: {},
          },
        ],
        transitions: [
          {
            from: "BaseGame",
            to: "FreeGame",
            overlay: {
              resource: {
                kind: "video" as const,
                path: sourcePath,
                mimeType: "video/mp4" as const,
              },
              fit: "contain" as const,
              fadeOutSeconds: 0.5,
            },
          },
        ],
      },
    };
    const assets = new Map(assetBytes);
    assets.set(sourcePath, mp4);
    const decodeVideo = async () => ({
      width: 1280,
      height: 720,
      durationSeconds: 3.625,
      hasAudio: true as const,
    });
    const first = await exportLayoutZip({
      manifest,
      assets,
      decodeImage,
      decodeVideo,
    });
    const imported = await importLayoutZip(first.bytes, {
      decodeImage,
      decodeVideo,
    });
    const project = manifestToEditorProject(
      imported.manifest,
      imported.assets,
      imported.videoMetadata,
    );
    expect(project.gameModes.transitions).toEqual([
      expect.objectContaining({
        kind: "video",
        fromModeId: "BaseGame",
        toModeId: "FreeGame",
        fit: "contain",
        fadeOutSeconds: 0.5,
      }),
    ]);
    const video = [...project.resources.values()].find(
      (resource) => resource.kind === "video",
    );
    expect(video).toMatchObject({
      size: { width: 1280, height: 720 },
      durationSeconds: 3.625,
      hasAudio: true,
    });
    const second = await exportLayoutZip({
      manifest: editorProjectToManifest(project),
      assets: project.assets,
      decodeImage,
      decodeVideo,
    });
    expect(second.bytes).toEqual(first.bytes);
    const firstEntries = extractBoundedZip(first.bytes);
    const secondEntries = extractBoundedZip(second.bytes);
    expect([...secondEntries.keys()]).toEqual([...firstEntries.keys()]);
    expect(stableManifestJson(imported.manifest)).toBe(
      new TextDecoder().decode(secondEntries.get("layout.manifest.json")),
    );
    const importedOverlay =
      imported.manifest.gameModes!.transitions![0]!.overlay;
    if (importedOverlay.resource.kind !== "video")
      throw new Error("expected video transition");
    const videoPath = importedOverlay.resource.path;
    expect(mappedEntry(firstEntries, videoPath)).toEqual(mp4);
    expect(mappedEntry(secondEntries, videoPath)).toEqual(mp4);
    imported.destroy();

    const malformed = new Map(assetBytes);
    malformed.set(sourcePath, new Uint8Array([1, 2, 3]));
    await expect(
      exportLayoutZip({
        manifest,
        assets: malformed,
        decodeImage,
        decodeVideo,
      }),
    ).rejects.toThrow(/ISO MP4/);
  });

  it("deterministically round-trips transition-only Spine resources and directed edges", async () => {
    const skeleton = {
      skeleton: { spine: "4.3.23" },
      bones: [{ name: "root" }],
      events: { SwitchScene: {}, SwitchBack: {}, Duplicate: {} },
      animations: {
        BG_FG: { events: [{ time: 0, name: "SwitchScene" }] },
        FG_BG: { events: [{ time: 0.4, name: "SwitchBack" }] },
        NoEvent: {},
        Duplicate: {
          events: [
            { time: 0.2, name: "Duplicate" },
            { time: 0.8, name: "Duplicate" },
          ],
        },
      },
    };
    const transitionResource = {
      kind: "spine" as const,
      skeleton: "assets/transition.json",
      atlas: "assets/transition.atlas",
      textures: { "transition.png": "assets/transition.png" },
    };
    const transition = (
      from: string,
      to: string,
      animation: string,
      switchEvent: string,
    ) => ({
      from,
      to,
      overlay: {
        resource: transitionResource,
        animation,
        switchEvent,
        placements: { default: { x: 50, y: 60, scale: 1 } },
      },
    });
    const manifest = {
      ...imageManifest,
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: { default: "bg" },
            nodeStates: {},
          },
          {
            id: "FreeGame",
            backgroundNodes: { default: "bg" },
            nodeStates: {},
          },
        ],
        transitions: [
          transition("BaseGame", "FreeGame", "BG_FG", "SwitchScene"),
          transition("FreeGame", "BaseGame", "FG_BG", "SwitchBack"),
        ],
      },
    };
    const assets = new Map(assetBytes);
    assets.set("assets/transition.json", encode(skeleton));
    assets.set(
      "assets/transition.atlas",
      new TextEncoder().encode(
        "transition.png\nsize: 1,1\nfilter: Linear,Linear\n",
      ),
    );
    assets.set(
      "assets/transition.png",
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9]),
    );

    const first = await exportLayoutZip({ manifest, assets, decodeImage });
    const second = await exportLayoutZip({ manifest, assets, decodeImage });
    expect(first.bytes).toEqual(second.bytes);
    const imported = await importLayoutZip(first.bytes, { decodeImage });
    const project = manifestToEditorProject(imported.manifest, imported.assets);
    expect(project.gameModes.transitions).toMatchObject([
      {
        fromModeId: "BaseGame",
        toModeId: "FreeGame",
        animation: "BG_FG",
        switchEvent: "SwitchScene",
        placements: { default: { x: 50, y: 60, scale: 1 } },
      },
      {
        fromModeId: "FreeGame",
        toModeId: "BaseGame",
        animation: "FG_BG",
        switchEvent: "SwitchBack",
      },
    ]);
    const resourceIds = project.gameModes.transitions.map(
      (item) => item.resourceId,
    );
    expect(new Set(resourceIds).size).toBe(1);
    expect(project.resources.get(resourceIds[0])).toMatchObject({
      kind: "spine",
      animationNames: expect.arrayContaining([
        "BG_FG",
        "Duplicate",
        "FG_BG",
        "NoEvent",
      ]),
      animationEvents: {
        BG_FG: [{ name: "SwitchScene", time: 0 }],
        FG_BG: [{ name: "SwitchBack", time: 0.4 }],
        NoEvent: [],
        Duplicate: [
          { name: "Duplicate", time: 0.2 },
          { name: "Duplicate", time: 0.8 },
        ],
      },
    });
    imported.destroy();
  });

  it("vendors multiple referenced popups once and restores mode bindings losslessly", async () => {
    const baseFiles = popupFiles();
    const freeFiles = popupFiles();
    const freeManifest = JSON.parse(
      new TextDecoder().decode(freeFiles.get("popup.manifest.json")),
    );
    freeFiles.set(
      "popup.manifest.json",
      encode({ ...freeManifest, id: "free-popup" }),
    );
    const orphanFiles = popupFiles();
    const manifest = {
      ...imageManifest,
      nodes: [
        {
          ...imageManifest.nodes[0],
          resource: { ...imageManifest.nodes[0].resource, path: "bg.png" },
        },
      ],
      popups: {
        "fixture-popup": {
          type: "award-celebration" as const,
          manifest: "fixture-popup.manifest.json",
          placements: { default: { x: 1, y: 2, scale: 1 } },
        },
        "free-popup": {
          type: "award-celebration" as const,
          manifest: "free-popup.manifest.json",
          placements: { default: { x: -3, y: 4, scale: 0.8 } },
        },
      },
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            nodeStates: {},
            awardCelebrationPopup: "fixture-popup",
          },
          {
            id: "FreeGame",
            nodeStates: {},
            awardCelebrationPopup: "free-popup",
          },
          {
            id: "BonusGame",
            nodeStates: {},
            awardCelebrationPopup: "fixture-popup",
          },
          { id: "NoCelebration", nodeStates: {} },
        ],
      },
    };
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const options = {
        manifest,
        assets: new Map([["bg.png", assetBytes.get("assets/bg.png")!]]),
        popupFilesById: new Map([
          ["fixture-popup", baseFiles],
          ["free-popup", freeFiles],
          ["orphan-popup", orphanFiles],
        ]),
        decodeImage,
      };
      const first = await exportLayoutZip(options);
      const second = await exportLayoutZip(options);
      expect(first.bytes).toEqual(second.bytes);
      const entries = extractBoundedZip(first.bytes);
      const assetMap = decodeEditorAssetsMap(entries.get("assets.map.json")!);
      expect(assetMap.files).toHaveProperty("fixture-popup.manifest.json");
      expect(assetMap.files).toHaveProperty("free-popup.manifest.json");
      expect(Object.keys(assetMap.files)).not.toContain("orphan-popup");
      const imported = await importLayoutZip(first.bytes, { decodeImage });
      const project = manifestToEditorProject(
        imported.manifest,
        imported.assets,
      );
      expect(project.gameModes).toMatchObject({
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            nodeStates: {},
            awardCelebrationPopupId: "fixture-popup",
          },
          {
            id: "FreeGame",
            nodeStates: {},
            awardCelebrationPopupId: "free-popup",
          },
          {
            id: "BonusGame",
            nodeStates: {},
            awardCelebrationPopupId: "fixture-popup",
          },
          {
            id: "NoCelebration",
            nodeStates: {},
            awardCelebrationPopupId: null,
          },
        ],
      });
      expect(project.popupDependencies.get("fixture-popup")?.keys).toEqual(
        [...baseFiles.keys()]
          .map((key) =>
            key === "popup.manifest.json" ? "fixture-popup.manifest.json" : key,
          )
          .sort(),
      );
      expect(project.popupDependencies.get("free-popup")?.placements).toEqual({
        default: { x: -3, y: 4, scale: 0.8 },
      });
      imported.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });
  it("validates shared Spine leaves before export flattening", async () => {
    const spineResource = {
      kind: "spine" as const,
      skeleton: "legacy/hero.json",
      atlas: "legacy/hero.atlas",
      textures: { "hero.png": "legacy/hero.png" },
      defaultAnimation: "Idle",
      loop: true as const,
    };
    const manifest = {
      ...imageManifest,
      nodes: [
        {
          ...imageManifest.nodes[0],
          id: "bg",
          resource: spineResource,
        },
        {
          ...imageManifest.nodes[0],
          id: "hero-b",
          order: 2,
          resource: spineResource,
        },
      ],
    };
    const texture = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const materialized = await materializeLayoutOwnedAssets({
      manifest,
      assets: new Map([
        ["legacy/hero.png", texture],
        [
          "legacy/hero.atlas",
          new TextEncoder().encode("hero.png\nsize: 1,1\n"),
        ],
        [
          "legacy/hero.json",
          new TextEncoder().encode(
            JSON.stringify({
              skeleton: { spine: "4.3.23" },
              animations: { Idle: {} },
            }),
          ),
        ],
        ["dependencies/example/kept.bin", new Uint8Array([7])],
        ["legacy/unused.png", texture],
      ]),
    });
    const first = materialized.manifest.nodes[0]!.resource;
    const second = materialized.manifest.nodes[1]!.resource;
    expect(first.kind).toBe("spine");
    expect(second).toEqual(first);
    if (first.kind !== "spine") throw new Error("expected Spine resource");
    expect(first.skeleton).toBe("legacy/hero.json");
    expect(first.atlas).toBe("legacy/hero.atlas");
    expect(first.textures).toEqual({ "hero.png": "legacy/hero.png" });
    const page = Object.keys(first.textures)[0]!;
    expect(
      new TextDecoder().decode(materialized.assets.get(first.atlas)),
    ).toContain(page);
    expect(materialized.assets.has("dependencies/example/kept.bin")).toBe(true);
    expect(materialized.assets.has("legacy/unused.png")).toBe(true);
  });

  it("preserves readable Spine page filename keys before payload dedupe", async () => {
    const texture = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9]);
    const manifest = {
      ...imageManifest,
      nodes: [
        {
          ...imageManifest.nodes[0],
          resource: {
            kind: "spine" as const,
            skeleton: "legacy/shared.json",
            atlas: "legacy/shared.atlas",
            textures: {
              "page-a.png": "legacy/page-a.png",
              "page-b.png": "legacy/page-b.png",
            },
            defaultAnimation: "Idle",
            loop: true as const,
          },
        },
      ],
    };
    const materialized = await materializeLayoutOwnedAssets({
      manifest,
      assets: new Map([
        ["legacy/page-a.png", texture],
        ["legacy/page-b.png", texture.slice()],
        [
          "legacy/shared.atlas",
          new TextEncoder().encode(
            "page-a.png\nsize: 1,1\n\npage-b.png\nsize: 1,1\n",
          ),
        ],
        [
          "legacy/shared.json",
          new TextEncoder().encode(
            JSON.stringify({
              skeleton: { spine: "4.3.23" },
              animations: { Idle: {} },
            }),
          ),
        ],
      ]),
    });
    const resource = materialized.manifest.nodes[0]!.resource;
    if (resource.kind !== "spine") throw new Error("expected Spine resource");
    const pages = Object.keys(resource.textures);
    const paths = Object.values(resource.textures);
    expect(pages).toEqual(["page-a.png", "page-b.png"]);
    expect(paths).toEqual(["legacy/page-a.png", "legacy/page-b.png"]);
    expect(
      pages.every((page) =>
        new TextDecoder()
          .decode(materialized.assets.get(resource.atlas))
          .includes(`${page}\nsize:`),
      ),
    ).toBe(true);
    expect(
      [...materialized.assets.keys()].filter((path) => path.endsWith(".png")),
    ).toHaveLength(2);
  });

  it("rejects a Spine atlas whose declared texture page is absent", async () => {
    const manifest = {
      ...imageManifest,
      nodes: [
        {
          ...imageManifest.nodes[0],
          resource: {
            kind: "spine" as const,
            skeleton: "legacy/hero.json",
            atlas: "legacy/hero.atlas",
            textures: { "hero.png": "legacy/hero.png" },
            defaultAnimation: "Idle",
            loop: true as const,
          },
        },
      ],
    };
    await expect(
      materializeLayoutOwnedAssets({
        manifest,
        assets: new Map([
          [
            "legacy/hero.png",
            new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
          ],
          [
            "legacy/hero.atlas",
            new TextEncoder().encode("other.png\nsize: 1,1\n"),
          ],
          [
            "legacy/hero.json",
            new TextEncoder().encode(
              JSON.stringify({
                skeleton: { spine: "4.3.23" },
                animations: { Idle: {} },
              }),
            ),
          ],
        ]),
      }),
    ).rejects.toThrow(/缺少 page/);
  });

  it("round-trips vendored image-string and symbols closures without orphan bytes", async () => {
    const fixture = compositePackageFixture();
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const first = await exportLayoutZip({ ...fixture, decodeImage });
      const second = await exportLayoutZip({ ...fixture, decodeImage });
      expect(first.bytes).toEqual(second.bytes);
      const entries = extractBoundedZip(first.bytes);
      expect(
        [...entries.keys()].filter((path) => !path.startsWith("assets/")),
      ).toEqual(["assets.map.json", "layout.manifest.json"]);
      const assetMap = decodeEditorAssetsMap(entries.get("assets.map.json")!);
      expect(Object.keys(assetMap.files).sort()).toEqual([
        "0.png",
        "a.png",
        "bg.png",
        "gameconfig.json",
        "image-string.manifest.json",
        "symbol-state-textures.manifest.json",
        "symbols.package.json",
      ]);
      const imported = await importLayoutZip(first.bytes, { decodeImage });
      expect(imported.manifest).toMatchObject({
        id: fixture.manifest.id,
        adaptation: fixture.manifest.adaptation,
        symbolPackages: fixture.manifest.symbolPackages,
      });
      const project = manifestToEditorProject(
        imported.manifest,
        imported.assets,
      );
      expect(project.symbolDependencies.get("demo-symbols")).toMatchObject({
        packageId: "demo-symbols",
      });
      const canonical = editorProjectToManifest(project);
      expect(canonical).not.toHaveProperty("symbolPackage");
      expect(canonical.symbolPackages).toEqual({
        "demo-symbols": {
          manifest: "symbols.package.json",
          reel: "main",
          reelSet: "main",
          renderMode: "standard",
        },
      });
      expect(canonical.gameModes).toEqual({
        initialMode: "BaseGame",
        transitions: [],
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: { default: "bg" },
            nodeStates: {},
            symbolPackage: "demo-symbols",
          },
        ],
      });
      expect(project.assets.has("a.png")).toBe(true);
      imported.destroy();

      const withoutSymbols = {
        ...fixture.manifest,
        symbolPackages: undefined,
        gameModes: {
          ...fixture.manifest.gameModes,
          modes: fixture.manifest.gameModes.modes.map(
            ({ symbolPackage: _symbolPackage, ...mode }) => mode,
          ),
        },
      };
      const unbound = await exportLayoutZip({
        manifest: withoutSymbols,
        assets: fixture.assets,
        decodeImage,
      });
      expect(
        [...extractBoundedZip(unbound.bytes).keys()].some((path) =>
          path.includes("symbols.package"),
        ),
      ).toBe(false);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("preserves legal uppercase filename keys in symbols dependencies", async () => {
    const fixture = compositePackageFixture();
    const legacyManifest = {
      version: 1,
      kind: "symbol-package",
      id: "demo-symbols",
      cellSize: { width: 20, height: 20 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["A.disabled.png"],
    };
    const legacyFiles = new Map<string, Uint8Array>([
      ["symbols.package.json", encode(legacyManifest)],
      [
        "gameconfig.json",
        encode({
          paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
          symbolCodes: { A: 0 },
          reels: { main: [[0], [0]] },
        }),
      ],
      [
        "symbol-state-textures.manifest.json",
        encode({
          version: 1,
          states: ["disabled"],
          symbols: {
            A: {
              normal: { kind: "transparent", width: 20, height: 20 },
              disabled: "./A.disabled.png",
              scale: 1,
            },
          },
        }),
      ],
      ["A.disabled.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 8])],
    ]);

    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const exported = await exportLayoutZip({
        manifest: fixture.manifest,
        assets: fixture.assets,
        symbolFilesById: new Map([["demo-symbols", legacyFiles]]),
        decodeImage,
      });
      const entries = extractBoundedZip(exported.bytes);
      const map = decodeEditorAssetsMap(entries.get("assets.map.json")!);
      expect(map.files).toHaveProperty("A.disabled.png");
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("rejects missing, mismatched, or incomplete symbols dependency inputs", async () => {
    const fixture = compositePackageFixture();
    await expect(
      exportLayoutZip({
        manifest: fixture.manifest,
        assets: fixture.assets,
        decodeImage,
      }),
    ).rejects.toThrow(/未提供 bytes/);

    const incomplete = new Map(fixture.symbolFiles);
    incomplete.delete("a.png");
    await expect(
      exportLayoutZip({
        manifest: fixture.manifest,
        assets: fixture.assets,
        symbolFilesById: new Map([["demo-symbols", incomplete]]),
        decodeImage,
      }),
    ).rejects.toThrow(/缺少 bytes/);
  });

  it("exports deterministic bytes and round-trips the exact closure", async () => {
    const assetsWithUnused = new Map(assetBytes);
    assetsWithUnused.set("assets/unused.png", new Uint8Array([9, 9]));
    const first = await exportLayoutZip({
      manifest: imageManifest,
      assets: assetsWithUnused,
      decodeImage,
    });
    const second = await exportLayoutZip({
      manifest: imageManifest,
      assets: assetBytes,
      decodeImage,
    });
    expect(first.fileName).toBe("fixture-layout.zip");
    expect(first.bytes).toEqual(second.bytes);
    const imported = await importLayoutZip(first.bytes, { decodeImage });
    expect(imported.manifest).toMatchObject({
      id: imageManifest.id,
      adaptation: imageManifest.adaptation,
    });
    const importedImage = imported.manifest.nodes[0]!.resource;
    expect(importedImage.kind).toBe("image");
    if (importedImage.kind !== "image") throw new Error("expected image");
    expect(importedImage.path).toBe("bg.png");
    expect(imported.assets.get(importedImage.path)).toEqual(
      assetBytes.get("assets/bg.png"),
    );
    imported.destroy();
    const entries = extractBoundedZip(first.bytes);
    const map = decodeEditorAssetsMap(entries.get("assets.map.json")!);
    expect(map.files).not.toHaveProperty("unused.png");
    expect(assetsWithUnused.has("assets/unused.png")).toBe(true);
  });

  it("fails when a used closure byte is missing but ignores unrelated library bytes", async () => {
    await expect(
      exportLayoutZip({
        manifest: imageManifest,
        assets: new Map([["assets/unused.png", new Uint8Array([1])]]),
        decodeImage,
      }),
    ).rejects.toThrow(/缺少 bytes/);
  });

  it("rejects extra, unsafe and noncanonical entries", async () => {
    const manifest = strToU8(`${JSON.stringify(imageManifest)}\n`);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": manifest,
          "assets/bg.png": new Uint8Array([1]),
          "assets/extra.png": new Uint8Array([2]),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/精确一致/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": manifest,
          "Assets/BG.PNG": new Uint8Array([1]),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/小写/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": manifest,
          "../escape.png": new Uint8Array([1]),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/非法 segment/);
  });

  it("rejects missing/invalid manifests, missing assets and decoded size drift", async () => {
    await expect(
      importLayoutZip(zipSync({ "assets/bg.png": new Uint8Array([1]) }), {
        decodeImage,
      }),
    ).rejects.toThrow(/layout.manifest.json/);
    await expect(
      importLayoutZip(zipSync({ "layout.manifest.json": strToU8("{") }), {
        decodeImage,
      }),
    ).rejects.toThrow(/无效/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": strToU8(JSON.stringify(imageManifest)),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/精确一致/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": strToU8(JSON.stringify(imageManifest)),
          "assets/bg.png": new Uint8Array([1]),
        }),
        { decodeImage: async () => ({ width: 2, height: 1 }) },
      ),
    ).rejects.toThrow(/尺寸漂移/);
  });

  it("rejects non-zip bytes", async () => {
    await expect(
      importLayoutZip(new Uint8Array([1, 2, 3]), { decodeImage }),
    ).rejects.toThrow(/zip/);
  });

  it("enforces direct asset and archive size contracts and idempotent cleanup", async () => {
    await expect(
      validateLayoutAssets(imageManifest, new Map(), { decodeImage }),
    ).rejects.toThrow(/资源闭包/);
    expect(() =>
      extractBoundedZip("not bytes" as unknown as Uint8Array),
    ).toThrow(/Uint8Array/);
    expect(() =>
      extractBoundedZip(
        new Uint8Array(LAYOUT_ZIP_LIMITS.maxCompressedBytes + 1),
      ),
    ).toThrow(/200 MiB/);
    expect(() =>
      extractBoundedZip(
        zipSync({
          "assets/huge.bin": new Uint8Array(LAYOUT_ZIP_LIMITS.maxFileBytes + 1),
        }),
      ),
    ).toThrow(/50 MiB/);
    const validated = await validateLayoutAssets(imageManifest, assetBytes, {
      decodeImage,
    });
    validated.destroy();
    validated.destroy();
  });

  it("accepts clean directory entries but rejects a root directory entry", () => {
    expect(() =>
      extractBoundedZip(
        zipSync({
          "assets/": new Uint8Array(),
          "assets/file.bin": new Uint8Array([1]),
        }),
      ),
    ).not.toThrow();
    expect(() => extractBoundedZip(zipSync({ "/": new Uint8Array() }))).toThrow(
      /根目录|相对/,
    );
  });
});
