import { describe, expect, it } from "vitest";
import { decodeEditorAssetsMap } from "@slotclientengine/editorresource";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import {
  extractBoundedZip,
  importLayoutZip,
} from "../src/io/imported-layout-zip.js";
import {
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  bindModeBgm,
  bindProgrammaticAudioEffect,
  deleteLayoutResource,
  getLayoutResourceReferences,
  getModeBgmResourceId,
  getProgrammaticAudioEffects,
  setModeBgmFade,
  unbindProgrammaticAudioEffect,
  uploadAudioResources,
} from "../src/model/resource-commands.js";
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
  it("imports audio as unbound assets, then exports only typed bindings", async () => {
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

    bindModeBgm(project, "BaseGame", bgm!.id);
    setModeBgmFade(project, "BaseGame", "fadeInSeconds", 0.25);
    bindProgrammaticAudioEffect(project, effect!.id, "coin-win");

    expect(getModeBgmResourceId(project, "BaseGame")).toBe("base.wav");
    expect(getProgrammaticAudioEffects(project, "coin.ogg")).toHaveLength(1);
    expect(getLayoutResourceReferences(project, "base.wav")).toEqual([
      expect.objectContaining({ role: "mode-bgm", nodeId: "BaseGame" }),
    ]);
    expect(() => deleteLayoutResource(project, "base.wav")).toThrow(/BGM/u);
    expect(() => deleteLayoutResource(project, "coin.ogg")).toThrow(
      /程序音效/u,
    );

    const manifest = editorProjectToManifest(project);
    expect(manifest.audio).toEqual({
      version: 1,
      effects: [
        expect.objectContaining({
          name: "coin-win",
          asset: {
            sources: [{ path: "coin.ogg", mediaType: "audio/ogg" }],
          },
        }),
      ],
      music: [
        {
          name: "base",
          asset: {
            sources: [{ path: "base.wav", mediaType: "audio/wav" }],
          },
          loop: true,
          fadeOutSeconds: 1,
          fadeInSeconds: 0.25,
        },
      ],
      programmaticEffects: ["coin-win"],
    });
    expect(manifest.gameModes.modes[0]!.bgm).toBe("base");

    const exported = await exportLayoutZip({
      manifest,
      assets: project.assets,
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    const entries = extractBoundedZip(exported.bytes);
    const assetsMap = decodeEditorAssetsMap(entries.get("assets.map.json")!);
    expect(entries.has(assetsMap.files["base.wav"]!.path)).toBe(true);
    expect(entries.has(assetsMap.files["coin.ogg"]!.path)).toBe(true);

    const imported = await importLayoutZip(exported.bytes, {
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    const roundTripped = manifestToEditorProject(
      imported.manifest,
      imported.assets,
      imported.videoMetadata,
    );
    expect(roundTripped.resources.get("base.wav")).toMatchObject({
      kind: "audio",
      mediaType: "audio/wav",
    });
    expect(roundTripped.resources.get("coin.ogg")).toMatchObject({
      kind: "audio",
      mediaType: "audio/ogg",
    });
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

    bindProgrammaticAudioEffect(project, "unused.ogg", "temporary");
    unbindProgrammaticAudioEffect(project, "temporary");
    deleteLayoutResource(project, "unused.ogg");
    expect(project.assets.has("unused.ogg")).toBe(false);
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
