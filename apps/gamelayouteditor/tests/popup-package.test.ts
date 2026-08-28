import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  commitEditorAssetImport,
  createEditorAssetEntry,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  materializeEditorAssetPayloads,
  reviewEditorAssetImport,
  serializeEditorAssetsMap,
  type EditorAssetRewriteAdapter,
} from "@slotclientengine/editorresource";
import { describe, expect, it } from "vitest";
import { Assets, Texture } from "pixi.js";
import { vi } from "vitest";
import {
  loadPopupManifest,
  parsePopupManifest,
  upgradePopupManifestToV5,
} from "@slotclientengine/rendercore/popup/editor";
import {
  findPopupSpineAssetConflicts,
  importPopupPackageZip,
} from "../src/io/imported-popup-package.js";
import {
  cloneEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { assetBytes, imageManifest } from "./fixtures.js";
import { popupFiles } from "./popup-fixture.js";
import {
  getMinecart2SymbolResourcePath,
  readMinecart2SymbolBytes,
} from "../../../test-utils/minecart2-fixtures.js";

describe("gamelayout popup dependency", () => {
  it("namespaces Popup audio sources together with the typed resource closure", async () => {
    const popup = popupFiles();
    const latest = structuredClone(
      loadPopupManifest(
        JSON.parse(new TextDecoder().decode(popup.get("popup.manifest.json"))),
      ).manifest,
    );
    const withAudio = {
      ...latest,
      audio: {
        version: 1 as const,
        effects: [
          {
            name: "bigwin",
            asset: {
              sources: [{ path: "bigwin.mp3", mediaType: "audio/mpeg" }],
            },
            playback: "loop" as const,
            offsetSeconds: 0,
            voices: {
              maxConcurrent: 1,
              overflow: "restart-oldest" as const,
            },
            bgm: { kind: "keep" as const },
          },
        ],
        cues: [
          {
            effect: "bigwin",
            target: {
              kind: "award-tier" as const,
              tier: "bigwin" as const,
            },
          },
        ],
      },
    };
    popup.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(withAudio)),
    );
    popup.set("bigwin.mp3", new Uint8Array([0x49, 0x44, 0x33]));
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const imported = await importPopupPackageZip(
        createDeterministicZip(await mappedPopupFiles(popup)),
        { decodeImage: async () => ({ width: 1, height: 1 }) },
      );
      const audioPath =
        imported.manifest.audio.effects[0]!.asset.sources[0]!.path;
      expect(audioPath).toBe("pkg-13-fixture-popup-bigwin.mp3");
      expect(imported.files.get(audioPath)).toEqual(
        new Uint8Array([0x49, 0x44, 0x33]),
      );
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("imports Popup v5 through the default latest normalizer", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const popup = popupFiles();
    const legacy = parsePopupManifest(
      JSON.parse(new TextDecoder().decode(popup.get("popup.manifest.json"))),
    );
    popup.set(
      "popup.manifest.json",
      new TextEncoder().encode(
        JSON.stringify(upgradePopupManifestToV5(legacy)),
      ),
    );
    const imported = await importPopupPackageZip(
      createDeterministicZip(await mappedPopupFiles(popup)),
      { decodeImage: async () => ({ width: 1, height: 1 }) },
    );
    expect(imported.manifest.version).toBe(9);
    if (
      imported.manifest.version !== 9 ||
      imported.manifest.type !== "award-celebration"
    )
      throw new Error("Expected latest award popup.");
    expect(imported.manifest.backdrop.visibleStates).toEqual([
      "base",
      "standard",
      "bigwin",
      "superwin",
      "megawin",
    ]);
    expect(
      imported.manifest.awardCelebration.base.layers[0],
    ).not.toHaveProperty("visibleStates");
    load.mockRestore();
    unload.mockRestore();
  });

  it("strictly imports a self-contained popup and round-trips binding placement", async () => {
    const popup = popupFiles();
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const imported = await importPopupPackageZip(
      createDeterministicZip(await mappedPopupFiles(popup)),
      { decodeImage: async () => ({ width: 1, height: 1 }) },
    );
    expect(imported.manifest.id).toBe("fixture-popup");
    expect(imported.rootKey).toBe("pkg-13-fixture-popup-popup.manifest.json");
    const layoutAssets = new Map([
      ["bg.png", assetBytes.get("assets/bg.png")!],
    ]);
    for (const [path, bytes] of imported.files)
      layoutAssets.set(path, new Uint8Array(bytes));
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
          manifest: imported.rootKey,
          order: 2000,
          placements: { default: { x: 12, y: -8, scale: 0.9 } },
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
        ],
      },
    };
    const project = manifestToEditorProject(manifest, layoutAssets);
    expect(project.popupDependencies.get("fixture-popup")).toMatchObject({
      id: "fixture-popup",
      order: 2000,
      placements: { default: { x: 12, y: -8, scale: 0.9 } },
    });
    expect(project.assets.has(imported.rootKey)).toBe(true);
    expect(editorProjectToManifest(project).popups).toEqual(manifest.popups);
    const programmaticManifest = {
      ...manifest,
      gameModes: {
        initialMode: "BaseGame",
        modes: [{ id: "BaseGame", nodeStates: {} }],
      },
    };
    const programmaticProject = manifestToEditorProject(
      programmaticManifest,
      layoutAssets,
    );
    expect(programmaticProject.programmaticPopupIds.has("fixture-popup")).toBe(
      true,
    );
    expect(editorProjectToManifest(programmaticProject).popups).toEqual(
      manifest.popups,
    );
    const clone = cloneEditorProject(project);
    clone.assets.get(imported.rootKey)![0] = 0;
    expect(project.assets.get(imported.rootKey)![0]).not.toBe(0);
    load.mockRestore();
    unload.mockRestore();
  });

  it("imports focus-only v3/v4 Popup packages as latest", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const popup = popupFiles();
    const manifest = JSON.parse(
      new TextDecoder().decode(popup.get("popup.manifest.json")),
    );
    manifest.version = 3;
    manifest.name = "Fixture Popup V3";
    manifest.adaptation = {
      mode: "maximized-focus",
      focus: { left: 1000, right: 2000, top: 3000, bottom: 4000 },
    };
    manifest.backdrop = { enabled: true, color: "#000000", alpha: 0.5 };
    delete manifest.designViewport;
    for (const tier of [
      manifest.awardCelebration.base,
      manifest.awardCelebration.standard,
      ...manifest.awardCelebration.celebrationTiers,
    ])
      for (const layer of tier.layers) layer.alpha = 1;
    popup.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );

    const imported = await importPopupPackageZip(
      createDeterministicZip(await mappedPopupFiles(popup)),
      { decodeImage: async () => ({ width: 1, height: 1 }) },
    );
    expect(imported.manifest.version).toBe(9);
    expect(imported.manifest).not.toHaveProperty("designViewport");
    if (imported.manifest.version !== 9)
      throw new Error("Expected latest Popup package.");
    expect(imported.manifest.adaptation.focus).toEqual({
      left: 1000,
      right: 2000,
      top: 3000,
      bottom: 4000,
    });
    const rewritten = JSON.parse(
      new TextDecoder().decode(imported.files.get(imported.rootKey)),
    );
    expect(rewritten.version).toBe(9);
    expect(rewritten).not.toHaveProperty("designViewport");

    manifest.version = 4;
    manifest.name = "Fixture Popup V4";
    for (const tier of [
      manifest.awardCelebration.base,
      manifest.awardCelebration.standard,
      ...manifest.awardCelebration.celebrationTiers,
    ])
      for (const layer of tier.layers)
        layer.attachment = { kind: "popup-root" };
    popup.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    const importedV4 = await importPopupPackageZip(
      createDeterministicZip(await mappedPopupFiles(popup)),
      { decodeImage: async () => ({ width: 1, height: 1 }) },
    );
    expect(importedV4.manifest.version).toBe(9);
    if (
      importedV4.manifest.version !== 9 ||
      importedV4.manifest.type !== "award-celebration"
    )
      throw new Error("Expected latest Popup package.");
    expect(
      importedV4.manifest.awardCelebration.base.layers[0]?.attachment,
    ).toEqual({ kind: "popup-root" });
    load.mockRestore();
    unload.mockRestore();
  });

  it("rejects missing sentinel and unknown fields while ignoring unconsumed ZIP entries", async () => {
    await expect(
      importPopupPackageZip(
        createDeterministicZip(new Map([["x.txt", new Uint8Array([1])]])),
      ),
    ).rejects.toThrow(/sentinel/);
    const orphan = await mappedPopupFiles(popupFiles());
    orphan.set("orphan.bin", new Uint8Array([1]));
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      await expect(
        importPopupPackageZip(createDeterministicZip(orphan), {
          decodeImage: async () => ({ width: 1, height: 1 }),
        }),
      ).resolves.toMatchObject({ manifest: { id: "fixture-popup" } });
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
    const invalid = await mappedPopupFiles(popupFiles());
    const manifest = JSON.parse(
      new TextDecoder().decode(invalid.get("popup.manifest.json")),
    );
    manifest.extra = true;
    invalid.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    await expect(
      importPopupPackageZip(createDeterministicZip(invalid)),
    ).rejects.toThrow(/unknown key/);
  });

  it("imports multi-page Spine pages without namespacing their logical names", async () => {
    const popup = spinePopupFiles();
    const imported = await importPopupPackageZip(
      createDeterministicZip(await mappedPopupFiles(popup)),
    );
    expect(imported.sourceSpineAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "atlas", key: "BG.atlas" }),
        expect.objectContaining({ kind: "texture", key: "BG.png" }),
        expect.objectContaining({ kind: "texture", key: "BG_2.png" }),
      ]),
    );
    const spine = imported.manifest.resources["pkg-2-fg-FG.json"];
    expect(spine).toMatchObject({
      kind: "spine",
      atlas: "pkg-2-fg-BG.atlas",
      textures: {
        "BG.png": "pkg-2-fg-BG.png",
        "BG_2.png": "pkg-2-fg-BG_2.png",
      },
    });
    expect(
      readAtlasPageNames(
        new TextDecoder().decode(imported.files.get("pkg-2-fg-BG.atlas")),
      ),
    ).toEqual(["BG.png", "BG_2.png"]);

    await expect(
      findPopupSpineAssetConflicts({
        imported,
        layoutAssets: [
          {
            resourceId: "bg.json",
            kind: "atlas",
            key: "bg.atlas",
            bytes: popup.get("BG.atlas")!,
          },
        ],
      }),
    ).resolves.toEqual([]);
    await expect(
      findPopupSpineAssetConflicts({
        imported,
        layoutAssets: [
          {
            resourceId: "bg.json",
            kind: "atlas",
            key: "bg.atlas",
            bytes: new Uint8Array([1, 2, 3]),
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        popupResourceKey: "FG.json",
        popupAssetKey: "BG.atlas",
        layoutResourceId: "bg.json",
        layoutAssetKey: "bg.atlas",
      }),
    ]);
  });

  it("imports and preserves once VNI playback through the shared popup parser", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const imported = await importPopupPackageZip(
      createDeterministicZip(
        await mappedPopupFiles(popupFiles({ onceVni: true })),
      ),
      { decodeImage: async () => ({ width: 1, height: 1 }) },
    );
    expect(imported.manifest.type).toBe("award-celebration");
    if (imported.manifest.type !== "award-celebration")
      throw new Error("Expected award celebration popup fixture.");
    expect(
      imported.manifest.awardCelebration.celebrationTiers[0]!.layers.find(
        ({ kind }) => kind === "vni",
      ),
    ).toMatchObject({ playback: { mode: "once" } });
    expect(
      JSON.parse(new TextDecoder().decode(imported.files.get(imported.rootKey)))
        .awardCelebration.celebrationTiers[0].layers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playback: { mode: "once" } }),
      ]),
    );
    load.mockRestore();
    unload.mockRestore();
  });
});

async function mappedPopupFiles(
  virtual: ReadonlyMap<string, Uint8Array>,
): Promise<Map<string, Uint8Array>> {
  const root = virtual.get("popup.manifest.json")!;
  const incoming = await Promise.all(
    [...virtual]
      .filter(([key]) => key !== "popup.manifest.json")
      .map(([key, bytes]) =>
        createEditorAssetEntry({
          key,
          mediaType: popupMediaType(key),
          bytes,
        }),
      ),
  );
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({ workspace: empty, incoming });
  const adapter: EditorAssetRewriteAdapter<null> = {
    cloneProject: () => null,
    collectReferences: () => ({ references: [] }),
    renameReferences: () => null,
  };
  const workspace = (
    await commitEditorAssetImport({
      workspace: empty,
      project: null,
      review,
      adapter,
    })
  ).workspace;
  return new Map([
    ...materializeEditorAssetPayloads(workspace),
    [
      "assets.map.json",
      serializeEditorAssetsMap(createEditorAssetsMapFromWorkspace(workspace)),
    ] as const,
    ["popup.manifest.json", root] as const,
  ]);
}

function spinePopupFiles(): Map<string, Uint8Array> {
  const sourcePage = getMinecart2SymbolResourcePath("WL", "texture");
  const atlas = new TextDecoder()
    .decode(readMinecart2SymbolBytes("WL", "atlas"))
    .replace(sourcePage, "BG.png");
  const manifest = {
    version: 1,
    kind: "popup",
    id: "fg",
    type: "spine",
    designViewport: { width: 100, height: 100 },
    resources: {
      "FG.json": {
        kind: "spine",
        skeleton: "FG.json",
        atlas: "BG.atlas",
        textures: {
          "BG.png": "BG.png",
          "BG_2.png": "BG_2.png",
        },
      },
    },
    spine: {
      resource: "FG.json",
      transform: { x: 0, y: 0, scale: 1 },
      playback: {
        mode: "segmented-animations",
        startAnimation: "Start",
        loopAnimation: "Idle",
        endAnimation: "Win",
      },
    },
  };
  return new Map([
    ["popup.manifest.json", new TextEncoder().encode(JSON.stringify(manifest))],
    ["FG.json", readMinecart2SymbolBytes("WL", "skeleton")],
    [
      "BG.atlas",
      new TextEncoder().encode(
        `${atlas.replace(/\n+$/u, "")}\n\nBG_2.png\nsize: 1,1\nfilter: Linear,Linear\n`,
      ),
    ],
    ["BG.png", readMinecart2SymbolBytes("WL", "texture")],
    ["BG_2.png", new Uint8Array([1])],
  ]);
}

function popupMediaType(key: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".atlas")) return "text/plain";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  return "image/png";
}

function readAtlasPageNames(atlasText: string): readonly string[] {
  const lines = atlasText.replace(/\r\n?/gu, "\n").split("\n");
  return lines.filter((line, index) => {
    if (!line || /^\s/u.test(line) || line.includes(":")) return false;
    return lines
      .slice(index + 1)
      .find((candidate) => candidate.length > 0)
      ?.startsWith("size:");
  });
}
