import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { readSymbolArtifactFixtureBytes } from "./artifact-fixtures.js";
import { Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { importImageStringDependencyZip } from "../src/io/image-string-dependency.js";
import {
  addSymbolState,
  createFromGameConfig,
  installImageStringDependency,
  setSymbolImageStringNodes,
  setValuePresentation,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import {
  generateAndBindImageStringSpinBlur,
  generateAndBindValueImageStringSpinBlur,
  getImageStringSpinBlurAvailability,
  getValueImageStringSpinBlurAvailability,
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

  it("generates and binds value ImgNumber blur per tier while reusing bytes", async () => {
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
    addSymbolState(project, "A", "spinBlur");
    setValuePresentation(project, "A", {
      defaultValues: [1, 10],
      reelStates: {
        normal: { kind: "transparent", width: 100, height: 100 },
        states: { spinBlur: "./A.spinBlur.png" },
      },
      tiers: [
        {
          maxExclusive: 10,
          animation: createTierAnimation("low"),
        },
        { animation: createTierAnimation("high") },
      ],
      text: {
        type: "image-string",
        tierResources: [
          "./image-string.manifest.json",
          "./image-string.manifest.json",
        ],
        slot: "Num",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: true,
      },
    });
    expect(getValueImageStringSpinBlurAvailability(project, "A", 0)).toEqual({
      ready: true,
      alreadyBound: false,
    });
    const decode = vi.fn(async () => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255]),
    }));
    const encodePng = vi.fn(async () => imageBytes("H2.png"));
    const first = await generateAndBindValueImageStringSpinBlur({
      project,
      symbol: "A",
      tierIndex: 0,
      codec: { decode, encodePng },
    });
    const firstText = first.project.symbols.get("A")!.valuePresentation!.text;
    if (!("tierResources" in firstText))
      throw new Error("expected shared text");
    expect(firstText.tierSpinBlurProfiles?.[0]?.resource).toBeTruthy();
    expect(firstText.tierSpinBlurProfiles?.[1]).toBeNull();
    expect(first.project.symbols.get("A")!.imageStringNodes).toEqual([]);

    decode.mockClear();
    const second = await generateAndBindValueImageStringSpinBlur({
      project: first.project,
      symbol: "A",
      tierIndex: 1,
      codec: { decode, encodePng },
    });
    const secondText = second.project.symbols.get("A")!.valuePresentation!.text;
    if (!("tierResources" in secondText))
      throw new Error("expected shared text");
    expect(second.generatedImageCount).toBe(0);
    expect(secondText.tierSpinBlurProfiles?.[1]?.resource).toBe(
      secondText.tierSpinBlurProfiles?.[0]?.resource,
    );
    expect(decode).not.toHaveBeenCalled();
  });
});

function createTierAnimation(id: string) {
  return {
    kind: "spine" as const,
    skeleton: `./${id}.json`,
    atlas: `./${id}.atlas`,
    texture: `./${id}.png`,
    playback: {
      mode: "animation" as const,
      animationName: "Idle",
      loop: true,
    },
  };
}

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
  return readSymbolArtifactFixtureBytes(name);
}
