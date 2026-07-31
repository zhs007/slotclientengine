import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createFromGameConfig,
  setStateVisual,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import {
  applyStateTextureImageBinding,
  generateStateTextureImportSource,
  getStateTextureGenerationAvailability,
} from "../src/model/state-texture-generation.js";
import {
  commitSymbolResourceImport,
  prepareSymbolResourceImport,
} from "../src/model/resource-import.js";
import {
  exportSymbolPackageZip,
  importSymbolPackageZip,
} from "../src/io/symbol-package-zip.js";

const gameConfig = {
  paytable: { "1": { code: 1, symbol: "A", pays: [1] } },
  symbolCodes: { A: 1 },
  reels: { main: [[1]] },
};

function createProject() {
  return createFromGameConfig({
    rawGameConfig: gameConfig,
    fileName: "generation.json",
  });
}

function imageBytes(name = "H1.png"): Uint8Array {
  return readFileSync(
    resolve(process.cwd(), `../../assets/game003-s1/${name}`),
  );
}

describe("symbols editor state texture generation", () => {
  it("generates only the requested state source from direct normal", async () => {
    const project = createProject();
    uploadAssetBatch(project, [{ path: "A.webp", bytes: imageBytes() }]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "A.webp",
    });
    const encodePng = vi.fn(async () => imageBytes());
    const source = await generateStateTextureImportSource({
      project,
      symbol: "A",
      state: "disabled",
      codec: {
        decode: async () => ({
          width: 1,
          height: 1,
          data: new Uint8ClampedArray([255, 0, 0, 91]),
        }),
        encodePng,
      },
    });
    expect(source.key).toBe("A.disabled.png");
    expect(encodePng).toHaveBeenCalledWith({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([39, 39, 39, 91]),
    });
    expect(project.symbols.get("A")?.states.has("disabled")).toBe(false);
    expect(project.symbols.get("A")?.states.has("spinBlur")).toBe(false);
  });

  it("binds generated states independently in preset order", () => {
    const project = createProject();
    uploadAssetBatch(project, [
      { path: "A.disabled.png", bytes: imageBytes() },
      { path: "A.spinBlur.png", bytes: imageBytes() },
    ]);
    applyStateTextureImageBinding(project, "A", "disabled", "A.disabled.png");
    expect(project.symbols.get("A")?.stateOrder).toEqual([
      "normal",
      "disabled",
    ]);
    applyStateTextureImageBinding(project, "A", "spinBlur", "A.spinBlur.png");
    expect(project.symbols.get("A")?.stateOrder).toEqual([
      "normal",
      "spinBlur",
      "disabled",
    ]);
    expect(project.symbols.get("A")?.states.get("disabled")).toEqual({
      kind: "image",
      imagePath: "A.disabled.png",
    });
    expect(project.symbols.get("A")?.states.get("spinBlur")).toEqual({
      kind: "image",
      imagePath: "A.spinBlur.png",
    });
  });

  it("reports unsupported normal without guessing another input", () => {
    const project = createProject();
    expect(
      getStateTextureGenerationAvailability(project, "A", "spinBlur"),
    ).toEqual({
      ready: false,
      reason: "只有 direct normal image 可以生成状态贴图。",
    });
  });

  it("exports and reimports the exact generated state image closure", async () => {
    const project = createProject();
    uploadAssetBatch(project, [{ path: "A.png", bytes: imageBytes() }]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "A.png",
    });
    const source = await generateStateTextureImportSource({
      project,
      symbol: "A",
      state: "spinBlur",
      codec: {
        decode: async () => ({
          width: 1,
          height: 1,
          data: new Uint8ClampedArray([1, 2, 3, 255]),
        }),
        encodePng: async () => imageBytes("H2.png"),
      },
    });
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [
        {
          sourcePath: source.key,
          key: source.key,
          bytes: source.bytes,
          container: "file",
          containerName: "browser-generation",
        },
      ],
    });
    const committed = await commitSymbolResourceImport({
      project,
      prepared,
      resolutions: [],
      mutateCandidate: (candidate, review) =>
        applyStateTextureImageBinding(
          candidate,
          "A",
          "spinBlur",
          review.items[0]!.targetKey,
        ),
    });
    const exported = await exportSymbolPackageZip(committed.project, {
      loadTextures: false,
    });
    const imported = await importSymbolPackageZip(exported.bytes, {
      loadTextures: false,
    });
    try {
      expect(imported.project.symbols.get("A")?.states.get("spinBlur")).toEqual(
        {
          kind: "image",
          imagePath: "A.spinBlur.png",
        },
      );
      expect(
        Array.from(
          imported.project.assetLibrary.records.get("A.spinBlur.png")!.bytes,
        ),
      ).toEqual(Array.from(imageBytes("H2.png")));
    } finally {
      imported.destroy();
    }
  });
});
