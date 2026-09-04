import { describe, expect, it } from "vitest";
import { decodeEditorAssetsMap } from "@slotclientengine/editorresource";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import {
  extractBoundedZip,
  importLayoutZip,
} from "../src/io/imported-layout-zip.js";
import {
  editorProjectToPreviewManifest,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  bindRuntimeResource,
  deleteLayoutResource,
  getLayoutResourceReferences,
  getRuntimeResourceKey,
  uploadAudioResources,
} from "../src/model/resource-commands.js";
import { createEditorUiSession } from "../src/ui/ui-session.js";
import { resourcesWorkspaceMarkup } from "../src/ui/resources-workspace.js";
import { assetBytes, imageManifest } from "./fixtures.js";

const wavBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
]);
const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);

function createProject() {
  const manifest = {
    ...imageManifest,
    nodes: imageManifest.nodes.map((node) => ({
      ...node,
      resource: { ...node.resource, path: "bg.png" },
    })),
  };
  return manifestToEditorProject(
    manifest,
    new Map([["bg.png", assetBytes.get("assets/bg.png")!]]),
  );
}

describe("audio assets", () => {
  it("migrates legacy audio while preserving an Event-shared asset", () => {
    const canonical = editorProjectToManifest(createProject());
    const effect = {
      name: "coin",
      asset: {
        sources: [{ path: "coin.ogg", mediaType: "audio/ogg" as const }],
      },
      playback: "once" as const,
      offsetSeconds: 0,
      voices: { maxConcurrent: 4, overflow: "restart-oldest" as const },
      bgm: { kind: "keep" as const },
    };
    const music = {
      name: "base",
      asset: {
        sources: [{ path: "base.wav", mediaType: "audio/wav" as const }],
      },
      loop: true as const,
      fadeOutSeconds: 1,
      fadeInSeconds: 1,
    };
    const legacy = {
      ...canonical,
      audio: {
        version: 1 as const,
        effects: [effect],
        music: [music],
        programmaticEffects: ["coin"],
      },
      eventAudio: {
        version: 1 as const,
        ignoreLegacyAudio: false,
        bindings: [
          {
            event: "gamelayout:/mode/BaseGame/state/stable/entered" as const,
            audio: {
              name: "event-base",
              asset: music.asset,
              category: "music" as const,
              playback: "loop" as const,
              voices: {
                maxConcurrent: 1,
                overflow: "restart-oldest" as const,
              },
              focus: {},
            },
            endEvent: "gamelayout:/mode/BaseGame/state/stable/exited" as const,
          },
        ],
      },
      gameModes: {
        ...canonical.gameModes,
        modes: canonical.gameModes.modes.map((mode) => ({
          ...mode,
          bgm: "base",
        })),
      },
    };
    const project = manifestToEditorProject(
      legacy,
      new Map([
        ["bg.png", assetBytes.get("assets/bg.png")!],
        ["base.wav", wavBytes],
        ["coin.ogg", oggBytes],
      ]),
    );

    expect(project.assets.has("base.wav")).toBe(true);
    expect(project.assets.has("coin.ogg")).toBe(false);
    expect(project.resources.get("base.wav")).toMatchObject({ kind: "audio" });
    expect(project.resources.has("coin.ogg")).toBe(false);
    const migrated = editorProjectToManifest(project);
    expect(migrated.audio).toEqual({
      version: 1,
      effects: [],
      music: [],
      programmaticEffects: [],
    });
    expect(migrated.gameModes.modes[0]).not.toHaveProperty("bgm");
    expect(migrated.eventAudio.ignoreLegacyAudio).toBe(true);
    expect(migrated.eventAudio.bindings).toEqual(legacy.eventAudio.bindings);
  });

  it("imports audio as unbound assets, then exports only Event bindings", async () => {
    const project = createProject();
    const [bgm, effect] = await uploadAudioResources({
      project,
      files: [
        new File([wavBytes], "base.wav", { type: "audio/wav" }),
        new File([oggBytes], "coin.ogg", { type: "audio/ogg" }),
      ],
    });

    expect(bgm).toMatchObject({
      id: "base.wav",
      kind: "audio",
      path: "base.wav",
      mediaType: "audio/wav",
    });
    expect(effect).toMatchObject({
      id: "coin.ogg",
      kind: "audio",
      mediaType: "audio/ogg",
    });
    expect(editorProjectToManifest(project).audio).toEqual({
      version: 1,
      effects: [],
      music: [],
      programmaticEffects: [],
    });

    project.eventAudio = {
      version: 1,
      ignoreLegacyAudio: true,
      bindings: [
        {
          event: "gamelayout:/mode/BaseGame/state/stable/entered",
          audio: {
            name: "coin-win",
            asset: {
              sources: [{ path: effect!.path, mediaType: effect!.mediaType }],
            },
            category: "effect",
            playback: "once",
            voices: { maxConcurrent: 4, overflow: "restart-oldest" },
            focus: {},
          },
        },
      ],
    };

    expect(getLayoutResourceReferences(project, "base.wav")).toEqual([]);
    expect(getLayoutResourceReferences(project, "coin.ogg")).toEqual([
      expect.objectContaining({ role: "event-audio" }),
    ]);
    expect(() => deleteLayoutResource(project, "coin.ogg")).toThrow(
      /event audio/iu,
    );

    const manifest = editorProjectToManifest(project);
    expect(manifest.audio).toEqual({
      version: 1,
      effects: [],
      music: [],
      programmaticEffects: [],
    });
    expect(manifest.gameModes.modes[0]).not.toHaveProperty("bgm");
    expect(manifest.eventAudio).toEqual({
      version: 1,
      ignoreLegacyAudio: true,
      bindings: project.eventAudio.bindings,
    });

    const exported = await exportLayoutZip({
      manifest,
      assets: project.assets,
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    const entries = extractBoundedZip(exported.bytes);
    const assetsMap = decodeEditorAssetsMap(entries.get("assets.map.json")!);
    expect(assetsMap.files["base.wav"]).toBeUndefined();
    expect(entries.has(assetsMap.files["coin.ogg"]!.path)).toBe(true);

    const imported = await importLayoutZip(exported.bytes, {
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    const roundTripped = manifestToEditorProject(
      imported.manifest,
      imported.assets,
      imported.videoMetadata,
    );
    expect(roundTripped.resources.has("base.wav")).toBe(false);
    expect(roundTripped.resources.get("coin.ogg")).toMatchObject({
      kind: "audio",
      mediaType: "audio/ogg",
    });
    expect(roundTripped.eventAudio.bindings).toEqual(
      project.eventAudio.bindings,
    );
  });

  it("keeps unused audio out of ZIP and releases assets after unbinding", async () => {
    const project = createProject();
    await uploadAudioResources({
      project,
      files: [new File([oggBytes], "unused.ogg", { type: "audio/ogg" })],
    });

    const exported = await exportLayoutZip({
      manifest: editorProjectToManifest(project),
      assets: project.assets,
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    expect(extractBoundedZip(exported.bytes).has("unused.ogg")).toBe(false);

    deleteLayoutResource(project, "unused.ogg");
    expect(project.assets.has("unused.ogg")).toBe(false);
  });

  it.each(["jingle.ogg", "Jingle.OGG"])(
    "exports and restores program-only audio %s",
    async (filename) => {
      const project = createProject();
      const [jingle] = await uploadAudioResources({
        project,
        files: [new File([oggBytes], filename, { type: "audio/ogg" })],
      });
      bindRuntimeResource(project, jingle!.id, "feature-jingle");

      const manifest = editorProjectToManifest(project);
      expect(manifest.runtimeResources?.["feature-jingle"]).toEqual({
        kind: "audio",
        path: filename,
        mediaType: "audio/ogg",
      });
      expect(manifest.audio).toEqual({
        version: 1,
        effects: [],
        music: [],
        programmaticEffects: [],
      });
      expect(manifest.eventAudio.ignoreLegacyAudio).toBe(true);
      expect(
        editorProjectToPreviewManifest(project, "default")?.runtimeResources,
      ).toBeUndefined();

      const session = createEditorUiSession();
      session.expandedResourceIds.add(jingle!.id);
      const markup = resourcesWorkspaceMarkup({
        project,
        session,
        thumbnailUrls: new Map(),
      });
      expect(markup).toContain(`data-runtime-resource-key="${filename}"`);
      expect(markup).toContain("runtime.playEffect(key)");
      expect(markup).toContain("gamelayout:/audio/effect/feature-jingle");
      expect(markup).not.toContain("gamelayout:/resource/audio/");

      const exported = await exportLayoutZip({
        manifest,
        assets: project.assets,
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      const entries = extractBoundedZip(exported.bytes);
      const assetsMap = decodeEditorAssetsMap(entries.get("assets.map.json")!);
      expect(assetsMap.files[filename]!.path).toMatch(
        /^assets\/[a-f0-9]{64}\.ogg$/u,
      );
      expect(entries.get(assetsMap.files[filename]!.path)).toEqual(oggBytes);

      const imported = await importLayoutZip(exported.bytes, {
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      try {
        await expect(
          imported.packageResource.loadRuntimeResource(
            "feature-jingle",
            "audio",
          ),
        ).resolves.toMatchObject({ kind: "audio", mediaType: "audio/ogg" });
        const restored = manifestToEditorProject(
          imported.manifest,
          imported.assets,
          imported.videoMetadata,
        );
        expect(restored.resources.get(filename)).toMatchObject({
          kind: "audio",
          mediaType: "audio/ogg",
        });
        expect(getRuntimeResourceKey(restored, filename)).toBe(
          "feature-jingle",
        );
      } finally {
        imported.destroy();
      }
    },
  );

  it("allows the same audio root to be used by Event and program bindings", async () => {
    const project = createProject();
    const [jingle] = await uploadAudioResources({
      project,
      files: [new File([wavBytes], "shared.wav", { type: "audio/wav" })],
    });
    bindRuntimeResource(project, jingle!.id, "shared-audio");
    project.eventAudio = {
      ...project.eventAudio,
      bindings: [
        {
          event: "gamelayout:/mode/BaseGame/state/stable/entered",
          audio: {
            name: "shared-event",
            asset: {
              sources: [{ path: "shared.wav", mediaType: "audio/wav" }],
            },
            category: "effect",
            playback: "once",
            voices: { maxConcurrent: 1, overflow: "restart-oldest" },
            focus: {},
          },
        },
      ],
    };

    const manifest = editorProjectToManifest(project);
    expect(manifest.runtimeResources?.["shared-audio"]).toMatchObject({
      kind: "audio",
      path: "shared.wav",
    });
    expect(manifest.eventAudio.bindings[0]?.audio.asset.sources[0]).toEqual({
      path: "shared.wav",
      mediaType: "audio/wav",
    });
  });

  it("rejects extension/signature and MIME mismatches atomically", async () => {
    const project = createProject();
    await expect(
      uploadAudioResources({
        project,
        files: [
          new File([wavBytes], "good.wav", { type: "audio/wav" }),
          new File([oggBytes], "bad.mp3", { type: "audio/mpeg" }),
        ],
      }),
    ).rejects.toThrow(/signature/u);
    expect(project.resources.has("good.wav")).toBe(false);

    await expect(
      uploadAudioResources({
        project,
        files: [new File([wavBytes], "wrong.wav", { type: "audio/mpeg" })],
      }),
    ).rejects.toThrow(/MIME/u);
  });
});
