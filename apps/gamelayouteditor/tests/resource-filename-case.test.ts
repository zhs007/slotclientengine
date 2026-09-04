import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { sha256Hex } from "@slotclientengine/browserartifactio";
import { serializeEditorAssetsMap } from "@slotclientengine/editorresource";
import {
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  bindRuntimeResource,
  importImageStringZip,
  uploadAudioResources,
  uploadImageResource,
  uploadJsonDataResources,
  uploadSpineResource,
  uploadVideoResource,
} from "../src/model/resource-commands.js";
import {
  normalizeLayoutFilenameKeys,
  normalizeMappedLayoutFilenameKeys,
} from "../src/io/exported-layout-zip.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("resource filename case", () => {
  it("preserves ImgNumber glyph filename case through import and export", async () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    const png = assetBytes.get("assets/bg.png")!;
    const sha256 = await sha256Hex(png);
    const path = `assets/${sha256}.png`;
    const manifest = {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 1, letterSpacing: 0 },
      glyphs: {
        "0": {
          path: "Glyph.PNG",
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    const resource = await importImageStringZip({
      project,
      zipBytes: zipSync({
        "image-string.manifest.json": new TextEncoder().encode(
          JSON.stringify(manifest),
        ),
        "assets.map.json": serializeEditorAssetsMap({
          version: 1,
          kind: "editor-assets",
          files: {
            "Glyph.PNG": {
              path,
              sha256,
              byteLength: png.byteLength,
              mediaType: "image/png",
            },
          },
        }),
        [path]: png,
      }),
    });
    bindRuntimeResource(project, resource.id, "digits");
    const exported = await normalizeLayoutFilenameKeys(
      editorProjectToManifest(project),
      project.assets,
    );
    const imported = await normalizeMappedLayoutFilenameKeys(
      exported.manifest,
      exported.assets,
    );
    for (const result of [exported, imported]) {
      expect(result.assets.get("digits-Glyph.PNG")).toEqual(
        assetBytes.get("assets/bg.png"),
      );
      const packed = JSON.parse(
        new TextDecoder().decode(result.assets.get(resource.manifestPath)),
      );
      expect(packed.glyphs["0"].path).toBe("digits-Glyph.PNG");
    }
  });

  it("preserves loose image, audio, video, JSON and Spine filenames through export/reimport normalization", async () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    const png = assetBytes.get("assets/bg.png")!;
    const file = (name: string, bytes: Uint8Array | string) =>
      new File([bytes as BlobPart], name);
    const image = await uploadImageResource({
      project,
      file: file("Image.PNG", png),
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    const [audio] = await uploadAudioResources({
      project,
      files: [file("Jingle.OGG", new Uint8Array([79, 103, 103, 83]))],
    });
    const sourceJson =
      '{"kind":"popup","path":"Image.PNG","text":"Image.PNG"}\n';
    const [data] = await uploadJsonDataResources({
      project,
      files: [file("Config.JSON", sourceJson)],
    });
    const video = await uploadVideoResource({
      project,
      file: file(
        "Intro.MP4",
        new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]),
      ),
      decodeVideo: async () => ({
        width: 1,
        height: 1,
        durationSeconds: 1,
        hasAudio: false,
      }),
    });
    const spine = await uploadSpineResource({
      project,
      files: [
        file(
          "Hero.JSON",
          JSON.stringify({
            skeleton: { spine: "4.3.23", width: 1, height: 1 },
            animations: { Idle: {} },
          }),
        ),
        file("Hero.ATLAS", "Page.PNG\nsize: 1,1\n"),
        file("Page.PNG", png),
      ],
    });
    for (const [key, resource] of Object.entries({
      image,
      audio: audio!,
      data: data!,
      video,
      spine,
    }))
      bindRuntimeResource(project, resource.id, key);
    expect(spine.textures).toEqual({ "Page.PNG": "Page.PNG" });
    const expectedKeys = [
      "Image.PNG",
      "Jingle.OGG",
      "Config.JSON",
      "Intro.MP4",
      "Hero.JSON",
      "Hero.ATLAS",
      "Page.PNG",
    ];
    for (const key of expectedKeys)
      expect(project.assets.has(key), key).toBe(true);
    const normalized = await normalizeLayoutFilenameKeys(
      editorProjectToManifest(project),
      project.assets,
    );
    const reimported = await normalizeMappedLayoutFilenameKeys(
      normalized.manifest,
      normalized.assets,
    );
    for (const result of [normalized, reimported]) {
      for (const key of expectedKeys)
        expect(result.assets.has(key), key).toBe(true);
      expect(result.manifest.runtimeResources).toMatchObject({
        image: { path: "Image.PNG" },
        audio: { path: "Jingle.OGG" },
        data: { path: "Config.JSON" },
        video: { path: "Intro.MP4" },
        spine: {
          skeleton: "Hero.JSON",
          atlas: "Hero.ATLAS",
          textures: { "Page.PNG": "Page.PNG" },
        },
      });
      expect(new TextDecoder().decode(result.assets.get("Config.JSON"))).toBe(
        sourceJson,
      );
      expect(new TextDecoder().decode(result.assets.get("Hero.ATLAS"))).toBe(
        "Page.PNG\nsize: 1,1\n",
      );
    }
  });

  it("rejects a case-only alias without changing the existing asset", async () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    const upload = (name: string) =>
      uploadImageResource({
        project,
        file: new File([assetBytes.get("assets/bg.png")! as BlobPart], name),
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
    await upload("Image.PNG");
    const original = project.assets.get("Image.PNG");
    await expect(upload("image.png")).rejects.toThrow(/alias|冲突/);
    expect(project.assets.get("Image.PNG")).toBe(original);
    expect(project.assets.has("image.png")).toBe(false);
  });
});
