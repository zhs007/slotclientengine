import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFromGameConfig,
  setStateVisual,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import {
  commitSymbolResourceImport,
  prepareSymbolResourceImport,
} from "../src/model/resource-import.js";

const gameConfig = {
  paytable: { "1": { code: 1, symbol: "A", pays: [1] } },
  symbolCodes: { A: 1 },
  reels: { main: [[1]] },
};
const image = (name: string) =>
  new Uint8Array(
    readFileSync(resolve(process.cwd(), `../../assets/game002-s3/${name}`)),
  );

describe("symbol resource import transaction", () => {
  it("overwrites bytes while preserving configured state semantics", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "gameconfig.json",
    });
    uploadAssetBatch(project, [{ path: "H1.png", bytes: image("H1.png") }]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "H1.png",
    });
    const before = structuredClone(project.symbols.get("A"));
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [
        {
          sourcePath: "H1.png",
          key: "H1.png",
          bytes: image("H2.png"),
          container: "file",
          containerName: "H1.png",
        },
      ],
    });
    expect(prepared.review.items[0]).toMatchObject({
      action: "overwrite",
      targetKey: "H1.png",
    });
    expect(prepared.review.items[0]!.references[0]!.location).toBe("A.normal");
    const result = await commitSymbolResourceImport({
      project,
      prepared,
      resolutions: [{ itemIndex: 0, resolution: "overwrite" }],
    });
    expect(result.project.symbols.get("A")).toEqual(before);
    expect(result.project.assetLibrary.records.get("H1.png")!.bytes).toEqual(
      image("H2.png"),
    );
    expect(project.assetLibrary.records.get("H1.png")!.bytes).toEqual(
      image("H1.png"),
    );
  });

  it("keeps a conflicting image under the first available suffix", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "gameconfig.json",
    });
    uploadAssetBatch(project, [
      { path: "H1.png", bytes: image("H1.png") },
      { path: "H1-1.png", bytes: image("H1.png") },
    ]);
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [
        {
          sourcePath: "art/H1.png",
          key: "H1.png",
          bytes: image("H2.png"),
          container: "zip",
          containerName: "art.zip",
        },
      ],
    });
    const result = await commitSymbolResourceImport({
      project,
      prepared,
      resolutions: [{ itemIndex: 0, resolution: "keep-both" }],
    });
    expect(result.review.items[0]).toMatchObject({
      action: "keep-both",
      targetKey: "H1-2.png",
    });
    expect(result.project.assetLibrary.records.get("H1.png")!.bytes).toEqual(
      image("H1.png"),
    );
    expect(result.project.assetLibrary.records.get("H1-2.png")!.bytes).toEqual(
      image("H2.png"),
    );
  });
});
