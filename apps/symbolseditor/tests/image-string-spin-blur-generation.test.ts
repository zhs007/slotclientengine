import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { readMinecart2SymbolFixtureBytes } from "../../../test-utils/minecart2-fixtures.js";
import { Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { importImageStringDependencyZip } from "../src/io/image-string-dependency.js";
import {
  addSymbolState,
  createFromGameConfig,
  installImageStringDependency,
  setSymbolImageStringNodes,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import {
  generateAndBindImageStringSpinBlur,
  getImageStringSpinBlurAvailability,
} from "../src/model/image-string-spin-blur-generation.js";

describe("ImgNumber spinBlur generation", () => {
  it("generates one shared dependency and reuses it without rebuilding", async () => {
    const dependency = await importImageStringDependencyZip(createZip(), {
      decodeImage: async () => ({ width: 172, height: 130 }),
      loadTexture: async () => Texture.EMPTY,
    });
    const project = createFromGameConfig({
      fileName: "gameconfig.json",
      rawGameConfig: {
        paytable: { "0": { code: 0, symbol: "A", pays: [0] } },
        symbolCodes: { A: 0 },
        reels: { main: [[0]] },
      },
    });
    installImageStringDependency(project, dependency);
    uploadAssetBatch(project, [{ path: "max.png", bytes: imageBytes() }]);
    addSymbolState(project, "A", "spinBlur");
    const node = (name: string) => ({
      name,
      resource: "./image-string.manifest.json",
      targets: [{ state: "spinBlur" }],
      initialText: "01",
      specialValueImages: [{ value: 500, image: "./max.png" }],
      anchor: { x: 0.5, y: 0.5 },
      transform: { x: 0, y: 0, scale: 1 },
      followSlotColor: true,
    });
    setSymbolImageStringNodes(project, "A", [node("first"), node("second")]);
    expect(getImageStringSpinBlurAvailability(project, "A", 0)).toEqual({
      ready: true,
      alreadyBound: false,
    });
    const decode = vi.fn(async () => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255]),
    }));
    const encodePng = vi.fn(async () => imageBytes("H2.png"));
    const first = await generateAndBindImageStringSpinBlur({
      project,
      symbol: "A",
      nodeIndex: 0,
      codec: { decode, encodePng },
    });
    expect(first.generatedImageCount).toBe(3);
    expect(first.boundNodeCount).toBe(2);
    expect(decode).toHaveBeenCalledTimes(3);
    const profiles = first.project.symbols
      .get("A")!
      .imageStringNodes.map((candidate) => candidate.spinBlurProfile);
    expect(profiles[0]?.resource).toBe(profiles[1]?.resource);
    expect(profiles[0]?.specialValueImages?.[0]?.image).toBe(
      profiles[1]?.specialValueImages?.[0]?.image,
    );
    expect(first.project.imageStringDependencies.size).toBe(2);

    const editedNodes = structuredClone(
      first.project.symbols.get("A")!.imageStringNodes,
    );
    (
      editedNodes[0] as unknown as {
        specialValueImages: Array<{ value: number; image: string }>;
      }
    ).specialValueImages = [{ value: 600, image: "./max.png" }];
    setSymbolImageStringNodes(first.project, "A", editedNodes);
    expect(
      first.project.symbols.get("A")!.imageStringNodes[0]?.spinBlurProfile,
    ).toBeUndefined();
    expect(
      first.project.symbols.get("A")!.imageStringNodes[1]?.spinBlurProfile,
    ).toBeDefined();

    decode.mockClear();
    encodePng.mockClear();
    const second = await generateAndBindImageStringSpinBlur({
      project: first.project,
      symbol: "A",
      nodeIndex: 1,
      codec: { decode, encodePng },
    });
    expect(second.generatedImageCount).toBe(0);
    expect(second.project.imageStringDependencies.size).toBe(2);
    expect(decode).not.toHaveBeenCalled();
    expect(encodePng).not.toHaveBeenCalled();
  });

  it("requires an exact spinBlur target", async () => {
    const project = createFromGameConfig({
      fileName: "gameconfig.json",
      rawGameConfig: {
        paytable: { "0": { code: 0, symbol: "A", pays: [0] } },
        symbolCodes: { A: 0 },
        reels: { main: [[0]] },
      },
    });
    expect(getImageStringSpinBlurAvailability(project, "A", 0)).toEqual({
      ready: false,
      reason: "ImgNumber node 不存在。",
    });
  });
});

function createZip(): Uint8Array {
  const encode = (value: unknown) =>
    new TextEncoder().encode(`${JSON.stringify(value)}\n`);
  return createDeterministicZip(
    new Map([
      [
        "image-string.manifest.json",
        encode({
          version: 1,
          kind: "image-string",
          id: "coin-digits",
          metrics: { lineHeight: 130, letterSpacing: 0 },
          glyphs: {
            "0": {
              path: "assets/0.png",
              size: { width: 172, height: 130 },
              offset: { x: 0, y: 0 },
            },
            "1": {
              path: "assets/1.png",
              size: { width: 172, height: 130 },
              offset: { x: 0, y: 0 },
            },
          },
          fixedAdvanceGroups: [],
        }),
      ],
      ["assets/0.png", imageBytes()],
      ["assets/1.png", imageBytes()],
    ]),
    { pathPolicy: { requireLowercase: true } },
  );
}

function imageBytes(name = "H1.png"): Uint8Array {
  return readMinecart2SymbolFixtureBytes(name);
}
