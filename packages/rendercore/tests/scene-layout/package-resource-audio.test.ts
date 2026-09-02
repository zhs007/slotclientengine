import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutPackageResourceFromResolvedFiles,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { createGameLayoutRuntimeAddresses } from "../../src/scene-layout/core/runtime-address.js";
import { game002LayoutFixture } from "./fixtures.js";

function audioManifest() {
  const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
  return {
    ...latest,
    runtimeResources: {
      jingle: {
        kind: "audio" as const,
        path: "assets/jingle.ogg",
        mediaType: "audio/ogg" as const,
      },
    },
    runtimeAllocation: {
      ...latest.runtimeAllocation,
      onDemand: {
        ...latest.runtimeAllocation.onDemand,
        runtimeResources: ["jingle"],
      },
    },
  };
}

describe("scene layout package audio program resource", () => {
  it("loads one lazy URL, checks the exact kind, and revokes ownership", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:jingle");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const loader = vi.fn(async () => new Uint8Array([0x4f, 0x67, 0x67, 0x53]));
    const resource = await createSceneLayoutPackageResourceFromResolvedFiles({
      manifest: audioManifest(),
      files: new Map([["assets/bg.png", new Uint8Array([1])]]),
      lazyRuntimeResources: true,
      loadRuntimeResourceBytes: loader,
    });
    try {
      const [first, second] = await Promise.all([
        resource.loadRuntimeResource("jingle", "audio"),
        resource.loadRuntimeResource("jingle", "audio"),
      ]);
      expect(first).toBe(second);
      expect(first).toEqual({
        kind: "audio",
        url: "blob:jingle",
        mediaType: "audio/ogg",
      });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(createObjectUrl).toHaveBeenCalledWith(
        expect.objectContaining({ type: "audio/ogg" }),
      );
      await expect(
        resource.loadRuntimeResource("jingle", "video"),
      ).rejects.toThrow(/must be video; actual audio/);

      const addresses = createGameLayoutRuntimeAddresses(
        resource as never,
        {} as never,
      );
      expect(resource.programmaticAudioEffects).toEqual(new Set(["jingle"]));
      expect(addresses.addresses.list({ kind: "audio-effect" })).toEqual([
        expect.objectContaining({
          address: "gamelayout:/audio/effect/jingle",
          kind: "audio-effect",
        }),
      ]);
      expect(addresses.addresses.list({ kind: "resource-factory" })).toEqual(
        [],
      );
      addresses.destroy();
    } finally {
      await resource.destroy();
    }
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:jingle");
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it("reuses the Event audio URL for the same eager root", async () => {
    const manifest = audioManifest();
    const shared = {
      ...manifest,
      eventAudio: {
        version: 1 as const,
        ignoreLegacyAudio: true,
        bindings: [
          {
            event: "gamelayout:/mode/BaseGame/state/stable/entered" as const,
            audio: {
              name: "jingle-event",
              asset: {
                sources: [
                  {
                    path: "assets/jingle.ogg",
                    mediaType: "audio/ogg" as const,
                  },
                ],
              },
              category: "effect" as const,
              playback: "once" as const,
              voices: {
                maxConcurrent: 1,
                overflow: "restart-oldest" as const,
              },
              focus: {},
            },
          },
        ],
      },
    };
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) =>
        blob instanceof Blob && blob.type === "audio/ogg"
          ? "blob:shared-audio"
          : "blob:image",
      );
    const resource = await createSceneLayoutPackageResourceFromResolvedFiles({
      manifest: shared,
      files: new Map([
        ["assets/bg.png", new Uint8Array([1])],
        ["assets/jingle.ogg", new Uint8Array([0x4f, 0x67, 0x67, 0x53])],
      ]),
    });
    try {
      expect(resource.runtimeResources.jingle).toMatchObject({
        kind: "audio",
        url: "blob:shared-audio",
      });
      expect(resource.audioEventTracks["jingle-event"]?.sources[0]?.url).toBe(
        "blob:shared-audio",
      );
      expect(
        createObjectUrl.mock.calls.filter(
          ([blob]) => blob instanceof Blob && blob.type === "audio/ogg",
        ),
      ).toHaveLength(1);
    } finally {
      await resource.destroy();
      createObjectUrl.mockRestore();
    }
  });

  it("rejects a program audio key that collides with an aggregated effect route", async () => {
    const base = audioManifest();
    await expect(
      createSceneLayoutPackageResourceFromResolvedFiles({
        manifest: {
          ...base,
          audio: {
            version: 1,
            effects: [
              {
                name: "jingle",
                asset: {
                  sources: [
                    {
                      path: "assets/legacy-jingle.ogg",
                      mediaType: "audio/ogg",
                    },
                  ],
                },
                playback: "once",
                offsetSeconds: 0,
                voices: {
                  maxConcurrent: 1,
                  overflow: "restart-oldest",
                },
                bgm: { kind: "keep" },
              },
            ],
            music: [],
            programmaticEffects: [],
          },
        },
        files: new Map([
          ["assets/bg.png", new Uint8Array([1])],
          ["assets/jingle.ogg", new Uint8Array([0x4f, 0x67, 0x67, 0x53])],
          [
            "assets/legacy-jingle.ogg",
            new Uint8Array([0x4f, 0x67, 0x67, 0x53]),
          ],
        ]),
      }),
    ).rejects.toThrow(/conflicts with an aggregated audio effect/);
  });
});
