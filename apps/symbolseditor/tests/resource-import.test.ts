import { describe, expect, it } from "vitest";
import {
  addSymbolState,
  createFromGameConfig,
  setStateVisual,
  setValuePresentation,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import {
  commitSymbolResourceImport,
  prepareSymbolResourceImport,
} from "../src/model/resource-import.js";
import { applyStateTextureImageBinding } from "../src/model/state-texture-generation.js";
import { readCraveFixture } from "./crave-fixture.js";

const gameConfig = {
  paytable: { "1": { code: 1, symbol: "A", pays: [1] } },
  symbolCodes: { A: 1 },
  reels: { main: [[1]] },
};
const image = (name: string) => readCraveFixture(name);
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const spineSkeleton = (animations: readonly string[], slots = ["Num"]) =>
  encode({
    skeleton: { spine: "4.3.23", width: 160, height: 160 },
    bones: [{ name: "root" }],
    slots: slots.map((name) => ({ name, bone: "root" })),
    skins: [{ name: "default", attachments: {} }],
    animations: Object.fromEntries(animations.map((name) => [name, {}])),
  });
const spineAtlas = new TextEncoder().encode(
  "Symbol.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n",
);

function source(key: string, bytes: Uint8Array) {
  return {
    sourcePath: key,
    key,
    bytes,
    container: "file" as const,
    containerName: key,
  };
}

function configureSpineProject() {
  const project = createFromGameConfig({
    rawGameConfig: gameConfig,
    fileName: "gameconfig.json",
  });
  uploadAssetBatch(project, [
    { path: "Symbol.json", bytes: spineSkeleton(["Idle", "Win"]) },
    { path: "Symbol.atlas", bytes: spineAtlas },
    { path: "Symbol.png", bytes: image("H1.png") },
  ]);
  setStateVisual(project, "A", "normal", {
    kind: "spine",
    baseVisual: { kind: "empty", width: 160, height: 160 },
    skeletonPath: "Symbol.json",
    atlasPath: "Symbol.atlas",
    texturePath: "Symbol.png",
    animationName: "Idle",
    transform: { x: 3, scale: 1.2 },
  });
  addSymbolState(project, "A", "win");
  setStateVisual(project, "A", "win", {
    kind: "spine",
    skeletonPath: "Symbol.json",
    atlasPath: "Symbol.atlas",
    texturePath: "Symbol.png",
    animationName: "Win",
    transform: { y: 4, scale: 0.8 },
  });
  return project;
}

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

  it("clears only missing Spine animation bindings after an overwrite", async () => {
    const project = configureSpineProject();
    const beforeNormal = structuredClone(
      project.symbols.get("A")!.states.get("normal"),
    );
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [source("Symbol.json", spineSkeleton(["Idle"]))],
    });
    const result = await commitSymbolResourceImport({
      project,
      prepared,
      resolutions: [{ itemIndex: 0, resolution: "overwrite" }],
    });
    expect(result.clearedAnimations).toEqual([
      {
        location: "A.win",
        animationName: "Win",
        skeletonKeys: ["Symbol.json"],
      },
    ]);
    expect(result.project.symbols.get("A")!.states.get("normal")).toEqual(
      beforeNormal,
    );
    expect(result.project.symbols.get("A")!.states.get("win")).toEqual({
      kind: "spine",
      skeletonPath: "Symbol.json",
      atlasPath: "Symbol.atlas",
      texturePath: "Symbol.png",
      animationName: "",
      transform: { y: 4, scale: 0.8 },
    });
    expect(project.symbols.get("A")!.states.get("win")).toMatchObject({
      animationName: "Win",
    });
  });

  it("keeps configured Spine animations that still exist after an overwrite", async () => {
    const project = configureSpineProject();
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [
        source("Symbol.json", spineSkeleton(["Idle", "Win", "Appear"])),
      ],
    });
    const result = await commitSymbolResourceImport({
      project,
      prepared,
      resolutions: [{ itemIndex: 0, resolution: "overwrite" }],
    });
    expect(result.clearedAnimations).toEqual([]);
    expect(result.project.symbols.get("A")!.states.get("win")).toMatchObject({
      animationName: "Win",
    });
  });

  it("clears only the missing Spine leaf inside a composite state", async () => {
    const project = configureSpineProject();
    setStateVisual(project, "A", "win", {
      kind: "composite",
      base: "normal",
      layers: [
        {
          id: "back",
          placement: "underlay",
          animation: {
            kind: "spine",
            skeletonPath: "Symbol.json",
            atlasPath: "Symbol.atlas",
            texturePath: "Symbol.png",
            animationName: "Idle",
          },
        },
        {
          id: "front",
          placement: "overlay",
          animation: {
            kind: "spine",
            skeletonPath: "Symbol.json",
            atlasPath: "Symbol.atlas",
            texturePath: "Symbol.png",
            animationName: "Win",
          },
        },
      ],
    });
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [source("Symbol.json", spineSkeleton(["Idle"]))],
    });
    const result = await commitSymbolResourceImport({
      project,
      prepared,
      resolutions: [{ itemIndex: 0, resolution: "overwrite" }],
    });

    expect(result.clearedAnimations).toEqual([
      {
        location: "A.win.layers.front",
        animationName: "Win",
        skeletonKeys: ["Symbol.json"],
      },
    ]);
    expect(result.project.symbols.get("A")!.states.get("win")).toMatchObject({
      kind: "composite",
      layers: [
        { id: "back", animation: { animationName: "Idle" } },
        { id: "front", animation: { animationName: "" } },
      ],
    });
  });

  it("clears a tiered active Spine animation without changing its normal tier configuration", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "gameconfig.json",
    });
    uploadAssetBatch(project, [
      { path: "Tier1.json", bytes: spineSkeleton(["Idle", "Win"]) },
      { path: "Tier2.json", bytes: spineSkeleton(["Idle", "Win"]) },
      { path: "Symbol.atlas", bytes: spineAtlas },
      { path: "Symbol.png", bytes: image("H1.png") },
    ]);
    setValuePresentation(project, "A", {
      defaultValues: [1],
      reelStates: {
        normal: { kind: "transparent", width: 160, height: 160 },
        states: {},
      },
      tiers: [
        {
          maxExclusive: 10,
          animation: {
            kind: "spine",
            skeleton: "./Tier1.json",
            atlas: "./Symbol.atlas",
            texture: "./Symbol.png",
            playback: { mode: "animation", animationName: "Idle", loop: true },
          },
        },
        {
          animation: {
            kind: "spine",
            skeleton: "./Tier2.json",
            atlas: "./Symbol.atlas",
            texture: "./Symbol.png",
            playback: { mode: "animation", animationName: "Idle", loop: true },
          },
        },
      ],
      text: {
        type: "font",
        slot: "Num",
        x: 0,
        y: 0,
        fontFamily: "Arial",
        fontSize: 24,
        fontWeight: "700",
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
      },
    });
    addSymbolState(project, "A", "win");
    setStateVisual(project, "A", "win", {
      kind: "activeSpine",
      animationName: "Win",
    });
    const invalidPrepared = await prepareSymbolResourceImport({
      project,
      sources: [source("Tier2.json", spineSkeleton(["Idle"], []))],
    });
    await expect(
      commitSymbolResourceImport({
        project,
        prepared: invalidPrepared,
        resolutions: [{ itemIndex: 0, resolution: "overwrite" }],
      }),
    ).rejects.toThrow(/slot "Num" was not found/);
    expect(project.symbols.get("A")!.states.get("win")).toEqual({
      kind: "activeSpine",
      animationName: "Win",
    });
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [source("Tier2.json", spineSkeleton(["Idle"]))],
    });
    const result = await commitSymbolResourceImport({
      project,
      prepared,
      resolutions: [{ itemIndex: 0, resolution: "overwrite" }],
    });
    expect(result.clearedAnimations).toEqual([
      {
        location: "A.win",
        animationName: "Win",
        skeletonKeys: ["Tier1.json", "Tier2.json"],
      },
    ]);
    expect(
      result.project.symbols
        .get("A")!
        .valuePresentation!.tiers.map(
          (tier) => tier.animation.playback.animationName,
        ),
    ).toEqual(["Idle", "Idle"]);
    expect(result.project.symbols.get("A")!.states.get("win")).toEqual({
      kind: "activeSpine",
      animationName: "",
    });

    const normalPrepared = await prepareSymbolResourceImport({
      project: result.project,
      sources: [source("Tier1.json", spineSkeleton(["Win"]))],
    });
    const normalResult = await commitSymbolResourceImport({
      project: result.project,
      prepared: normalPrepared,
      resolutions: [{ itemIndex: 0, resolution: "overwrite" }],
    });
    expect(normalResult.clearedAnimations).toEqual([
      {
        location: "A.valuePresentation.normal",
        animationName: "Idle",
        skeletonKeys: ["Tier1.json", "Tier2.json"],
      },
    ]);
    expect(
      normalResult.project.symbols
        .get("A")!
        .valuePresentation!.tiers.map(
          (tier) => tier.animation.playback.animationName,
        ),
    ).toEqual(["", ""]);
  });

  it("applies a resolved state-image binding inside the import transaction", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "gameconfig.json",
    });
    const prepared = await prepareSymbolResourceImport({
      project,
      sources: [source("A.spinBlur.png", image("H1.png"))],
    });
    const result = await commitSymbolResourceImport({
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
    expect(project.symbols.get("A")?.states.has("spinBlur")).toBe(false);
    expect(result.project.symbols.get("A")?.states.get("spinBlur")).toEqual({
      kind: "image",
      imagePath: "A.spinBlur.png",
    });
  });
});
