import { describe, expect, it } from "vitest";
import {
  createSceneLayoutAssetGroups,
  parseSceneLayoutAssetGroups,
} from "../src/asset-groups.js";
import { upgradeSceneLayoutManifestToLatest } from "@slotclientengine/rendercore/scene-layout/data";
import { layoutFixture, text } from "./fixtures.js";

describe("asset-groups versioned parser", () => {
  it("rejects unknown fields, uncovered assets and wrong deltas", () => {
    const valid = fixture();
    expect(parseSceneLayoutAssetGroups(valid).initialMode).toBe("Alpha");
    expect(() =>
      parseSceneLayoutAssetGroups({ ...valid, extra: true }),
    ).toThrow(/fields/);
    expect(() =>
      parseSceneLayoutAssetGroups({
        ...valid,
        assets: {
          ...valid.assets,
          "orphan.webp": valid.assets["a.webp"],
        },
      }),
    ).toThrow(/未覆盖/);
    expect(() =>
      parseSceneLayoutAssetGroups({
        ...valid,
        groups: valid.groups.map((group) =>
          group.id === "mode:Beta"
            ? { ...group, incrementalAssets: [] }
            : group,
        ),
      }),
    ).toThrow(/required - initial/);
  });

  it("accepts explicit v2 audio optimization metadata and rejects partial fields", () => {
    const valid = fixture();
    const v2 = {
      ...valid,
      version: 2,
      optimization: {
        ...valid.optimization,
        audioCodec: "aac-lc",
        audioContainer: "m4a",
        bgmBitrateKbps: 128,
        effectMonoBitrateKbps: 64,
        effectStereoBitrateKbps: 96,
        ffmpegVersion: null,
        ffprobeVersion: null,
        convertedAudioCount: 0,
        inputAudioBytes: 0,
        outputAudioBytes: 0,
      },
    };
    expect(parseSceneLayoutAssetGroups(v2).version).toBe(2);
    const { ffprobeVersion: _missing, ...incomplete } = v2.optimization;
    expect(() =>
      parseSceneLayoutAssetGroups({ ...v2, optimization: incomplete }),
    ).toThrow(/fields/);
    expect(() =>
      parseSceneLayoutAssetGroups({
        ...v2,
        optimization: {
          ...v2.optimization,
          inputAudioBytes: 1,
          ffmpegVersion: null,
          ffprobeVersion: null,
        },
      }),
    ).toThrow(/ffmpegVersion/);
  });

  it("accepts a standalone spine-popup group without mode ownership", () => {
    const valid = fixture();
    const parsed = parseSceneLayoutAssetGroups({
      ...valid,
      initialAssets: ["a.webp", "b.webp"],
      groups: [
        ...valid.groups.map((group) =>
          group.id === "mode:Beta"
            ? { ...group, incrementalAssets: [] }
            : group,
        ),
        {
          id: "spine-popup:free-game",
          kind: "spine-popup",
          popupId: "free-game",
          usedByTransitions: [],
          requiredAssets: ["b.webp"],
          incrementalAssets: [],
        },
      ],
    });
    expect(parsed.groups.at(-1)).toMatchObject({
      kind: "spine-popup",
      popupId: "free-game",
    });
  });

  it("creates a standalone single-state Popup group in initial assets", () => {
    const popupKey = "freeform-popup.manifest.json";
    const popup = {
      version: 8,
      kind: "popup",
      id: "freeform",
      name: "Freeform",
      type: "single-state",
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 50, right: 50, top: 50, bottom: 50 },
      },
      backdrop: {
        enabled: false,
        color: "#000000",
        alpha: 0.5,
        visibleStates: ["active"],
      },
      resources: {},
      audio: { version: 1, effects: [], cues: [] },
      singleState: { layers: [] },
    } as const;
    const latest = upgradeSceneLayoutManifestToLatest(layoutFixture());
    const manifest = {
      ...latest,
      popups: {
        freeform: {
          type: "single-state",
          manifest: popupKey,
          order: 2000,
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      },
    } as never;
    const keys = [
      "alpha.png",
      "beta.jpg",
      "shared.webp",
      "alpha-to-beta.mp4",
      "beta-to-alpha.mp4",
      popupKey,
    ];
    const groups = createSceneLayoutAssetGroups({
      manifest,
      files: new Map([[popupKey, text(popup)]]),
      sourceZipBytes: 4,
      output: outputFixture(keys),
      quality: 80,
      cwebpVersion: "test",
      convertedImageCount: 0,
      ...audioOptimizationFixture(),
    });
    expect(
      groups.groups.find((group) => group.id === "single-state-popup:freeform"),
    ).toMatchObject({
      kind: "single-state-popup",
      popupId: "freeform",
      requiredAssets: [popupKey],
      incrementalAssets: [],
    });
    expect(groups.initialAssets).toContain(popupKey);
    expect(parseSceneLayoutAssetGroups(groups)).toEqual(groups);
  });

  it("keeps global layer assets shared and assigns scoped layers to one mode", () => {
    const keys = ["base.png", "free.png", "shared.png", "free-only.png"];
    const manifest = {
      version: 1,
      kind: "scene-layout",
      id: "layout",
      nodes: [
        imageNode("base-bg", "base.png"),
        imageNode("free-bg", "free.png"),
        imageNode("shared", "shared.png"),
        { ...imageNode("free-only", "free-only.png"), gameMode: "FreeGame" },
      ],
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          { id: "BaseGame", backgroundNodes: { default: "base-bg" } },
          { id: "FreeGame", backgroundNodes: { default: "free-bg" } },
        ],
        transitions: [
          {
            from: "BaseGame",
            to: "FreeGame",
            overlay: { kind: "none" },
          },
        ],
      },
    } as never;
    const outputAssets = new Map(
      keys.map((key) => [
        key,
        {
          key,
          sourceKey: key,
          bytes: new Uint8Array([1]),
          sourceByteLength: 1,
          converted: false,
          mediaType: "image/png",
        },
      ]),
    );
    const groups = createSceneLayoutAssetGroups({
      manifest,
      files: new Map(),
      sourceZipBytes: 4,
      output: {
        zipBytes: new Uint8Array(),
        assets: outputAssets,
        assetsMap: {
          version: 1,
          files: Object.fromEntries(
            keys.map((key) => [
              key,
              {
                path: key,
                mediaType: "image/png",
                sha256: "a".repeat(64),
                byteLength: 1,
              },
            ]),
          ),
        },
      } as never,
      quality: 80,
      cwebpVersion: "test",
      convertedImageCount: 0,
      ...audioOptimizationFixture(),
    });
    expect(groups.version).toBe(2);
    expect(
      groups.groups.find((group) => group.id === "shared")?.requiredAssets,
    ).toEqual(["shared.png"]);
    expect(
      groups.groups.find((group) => group.id === "mode:BaseGame")
        ?.requiredAssets,
    ).toEqual(["base.png", "shared.png"]);
    expect(
      groups.groups.find((group) => group.id === "mode:FreeGame")
        ?.requiredAssets,
    ).toEqual(["free-only.png", "free.png", "shared.png"]);
    expect(
      groups.groups.find(
        (group) => group.id === "transition:BaseGame->FreeGame",
      )?.requiredAssets,
    ).toEqual([]);
  });

  it("keeps both radio state images in the owning asset groups", () => {
    const keys = ["flag-off.webp", "flag-on.webp"];
    const manifest = {
      version: 7,
      kind: "scene-layout",
      id: "radio-layout",
      nodes: [
        {
          id: "splash-flag",
          order: 1,
          uiControl: {
            kind: "radio",
            off: {
              kind: "image",
              path: "flag-off.webp",
              size: { width: 145, height: 50 },
            },
            on: {
              kind: "image",
              path: "flag-on.webp",
              size: { width: 145, height: 50 },
            },
          },
          placements: { landscape: { x: 0, y: 0, scale: 1 } },
        },
      ],
      audio: {
        version: 1,
        effects: [],
        music: [],
        programmaticEffects: [],
      },
      eventAudio: {
        version: 1,
        ignoreLegacyAudio: true,
        bindings: [],
      },
      gameModes: {
        initialMode: "Splash",
        modes: [{ id: "Splash", nodeStates: {} }],
        transitions: [],
      },
    } as never;
    const groups = createSceneLayoutAssetGroups({
      manifest,
      files: new Map(),
      sourceZipBytes: 4,
      output: outputFixture(keys),
      quality: 80,
      cwebpVersion: "test",
      convertedImageCount: 2,
      ...audioOptimizationFixture(),
    });
    expect(
      groups.groups.find((group) => group.id === "shared")?.requiredAssets,
    ).toEqual(keys);
    expect(
      groups.groups.find((group) => group.id === "mode:Splash")?.requiredAssets,
    ).toEqual(keys);
  });

  it("creates an independent runtime group for opaque JSON data", () => {
    const key = "spin-config.json";
    const manifest = {
      ...layoutFixture(),
      runtimeResources: {
        "spin.config": { kind: "json", path: key },
      },
    } as const;
    const groups = createSceneLayoutAssetGroups({
      manifest,
      files: new Map([[key, text({ reels: [["A", "B"]] })]]),
      sourceZipBytes: 4,
      output: outputFixture([
        "alpha.png",
        "beta.jpg",
        "shared.webp",
        "alpha-to-beta.mp4",
        "beta-to-alpha.mp4",
        key,
      ]),
      quality: 80,
      cwebpVersion: "test",
      convertedImageCount: 0,
      ...audioOptimizationFixture(),
    });
    expect(
      groups.groups.find(
        (group) => group.id === "runtime-resource:spin.config",
      ),
    ).toMatchObject({
      kind: "runtime-resource",
      resourceKey: "spin.config",
      resourceKind: "json",
      requiredAssets: [key],
      incrementalAssets: [key],
    });
    expect(groups.initialAssets).not.toContain(key);
  });

  it("keeps audio in its deferred group even when the initial mode uses BGM", () => {
    const keys = ["base.png", "base.mp3", "click.ogg"];
    const manifest = {
      version: 4,
      kind: "scene-layout",
      id: "layout",
      nodes: [imageNode("base-bg", "base.png")],
      audio: {
        version: 1,
        music: [
          {
            name: "base",
            asset: { sources: [{ path: "base.mp3", mediaType: "audio/mpeg" }] },
            loop: true,
            fadeOutSeconds: 0.5,
            fadeInSeconds: 0.5,
          },
        ],
        effects: [
          {
            name: "click",
            asset: { sources: [{ path: "click.ogg", mediaType: "audio/ogg" }] },
            playback: "once",
            offsetSeconds: 0,
            voices: { maxConcurrent: 1, overflow: "restart-oldest" },
            bgm: { kind: "keep" },
          },
        ],
        programmaticEffects: ["click"],
      },
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            bgm: "base",
            backgroundNodes: { default: "base-bg" },
          },
        ],
        transitions: [],
      },
    } as never;
    const groups = createSceneLayoutAssetGroups({
      manifest,
      files: new Map(),
      sourceZipBytes: 3,
      output: outputFixture(keys),
      quality: 80,
      cwebpVersion: "test",
      convertedImageCount: 0,
      ...audioOptimizationFixture({ input: 2, output: 2 }),
    });
    expect(groups.initialAssets).toEqual(["base.png"]);
    expect(
      groups.groups.find((group) => group.id === "audio:scene-layout"),
    ).toMatchObject({
      kind: "audio",
      usedByModes: ["BaseGame"],
      requiredAssets: ["base.mp3", "click.ogg"],
      incrementalAssets: ["base.mp3", "click.ogg"],
    });
  });
});

function imageNode(id: string, path: string) {
  return {
    id,
    order: 0,
    resource: { kind: "image", path, size: { width: 1, height: 1 } },
    placements: { default: { x: 0, y: 0, scale: 1 } },
  };
}

function outputFixture(keys: readonly string[]) {
  return {
    zipBytes: new Uint8Array(),
    assets: new Map(
      keys.map((key) => [
        key,
        {
          key,
          sourceKey: key,
          bytes: new Uint8Array([1]),
          sourceByteLength: 1,
          converted: false,
          mediaType: key.endsWith(".json")
            ? "application/json"
            : key.endsWith(".png")
              ? "image/png"
              : key.endsWith(".mp3")
                ? "audio/mpeg"
                : "audio/ogg",
        },
      ]),
    ),
    assetsMap: {
      version: 1,
      files: Object.fromEntries(
        keys.map((key) => [
          key,
          {
            path: key,
            mediaType: key.endsWith(".json")
              ? "application/json"
              : key.endsWith(".png")
                ? "image/png"
                : key.endsWith(".mp3")
                  ? "audio/mpeg"
                  : "audio/ogg",
            sha256: "a".repeat(64),
            byteLength: 1,
          },
        ]),
      ),
    },
  } as never;
}

function audioOptimizationFixture(
  sizes: { readonly input: number; readonly output: number } = {
    input: 0,
    output: 0,
  },
) {
  const used = sizes.input > 0;
  return {
    audioOptimization: {
      keyMapping: new Map(),
      assets: new Map(),
      ffmpegVersion: used ? "fixture-ffmpeg 1" : null,
      ffprobeVersion: used ? "fixture-ffprobe 1" : null,
      convertedAudioCount: used ? 2 : 0,
      inputAudioBytes: sizes.input,
      outputAudioBytes: sizes.output,
    },
    audioOptions: {
      ffmpegExecutable: "ffmpeg",
      ffprobeExecutable: "ffprobe",
      bgmBitrateKbps: 128,
      effectMonoBitrateKbps: 64,
      effectStereoBitrateKbps: 96,
    },
  } as const;
}

function fixture() {
  const asset = {
    path: `assets/${"a".repeat(64)}.webp`,
    mediaType: "image/webp",
    sha256: "a".repeat(64),
    byteLength: 12,
    sourceKey: "a.png",
    sourceByteLength: 20,
    converted: true,
  };
  return {
    version: 1,
    kind: "scene-layout-asset-groups",
    layoutId: "layout",
    initialMode: "Alpha",
    optimization: {
      imageCodec: "webp",
      quality: 80,
      cwebpVersion: "1",
      inputZipBytes: 10,
      outputZipBytes: 8,
      convertedImageCount: 1,
    },
    controlFiles: ["assets.map.json", "layout.manifest.json"],
    assets: {
      "a.webp": asset,
      "b.webp": { ...asset, sourceKey: "b.png" },
    },
    initialAssets: ["a.webp"],
    groups: [
      {
        id: "mode:Alpha",
        kind: "mode",
        modeId: "Alpha",
        initial: true,
        requiredAssets: ["a.webp"],
        incrementalAssets: [],
      },
      {
        id: "mode:Beta",
        kind: "mode",
        modeId: "Beta",
        initial: false,
        requiredAssets: ["a.webp", "b.webp"],
        incrementalAssets: ["b.webp"],
      },
      {
        id: "shared",
        kind: "shared",
        requiredAssets: [],
        incrementalAssets: [],
      },
    ],
  };
}
