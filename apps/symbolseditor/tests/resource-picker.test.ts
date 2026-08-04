import { describe, expect, it } from "vitest";
import {
  createFromGameConfig,
  setStateVisual,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import { SymbolEditorStore } from "../src/model/editor-store.js";
import {
  applyResourceBinding,
  getDefaultSpineAtlasBinding,
  getResourcePickerCandidates,
  resolveSpineAtlasBinding,
} from "../src/ui/resource-picker.js";
import { readMinecart2SymbolFixtureBytes } from "../../../test-utils/minecart2-fixtures.js";

const gameConfig = {
  paytable: { "1": { code: 1, symbol: "A", pays: [1] } },
  symbolCodes: { A: 1 },
  reels: { main: [[1]] },
};

const fixture = (path: string) =>
  readMinecart2SymbolFixtureBytes(path.split("/").at(-1)!);

function createProject() {
  const project = createFromGameConfig({
    rawGameConfig: gameConfig,
    fileName: "picker.json",
  });
  uploadAssetBatch(project, [
    { path: "art/H1.png", bytes: fixture("assets/sample-skin/H1.png") },
    {
      path: "spine/H1.json",
      bytes: fixture("assets/sample-skin/H1.json"),
    },
    {
      path: "spine/Symbol.atlas",
      bytes: fixture("assets/sample-skin/Symbol.atlas"),
    },
    {
      path: "spine/Symbol.png",
      bytes: fixture("assets/sample-skin/Symbol.png"),
    },
    {
      path: "broken.png",
      bytes: new Uint8Array([1, 2, 3]),
    },
  ]);
  return project;
}

describe("typed resource picker", () => {
  it("filters image and skeleton contexts without filename guessing", () => {
    const project = createProject();
    const images = getResourcePickerCandidates(project, {
      kind: "state-image",
      symbol: "A",
      state: "normal",
    });
    expect(images.map(({ path }) => path)).toEqual([
      "broken.png",
      "H1.png",
      "Symbol.png",
    ]);
    expect(images.find(({ path }) => path === "broken.png")).toMatchObject({
      status: "error",
    });
    expect(
      getResourcePickerCandidates(project, {
        kind: "spine-skeleton",
        symbol: "A",
        state: "normal",
      }).map(({ path }) => path),
    ).toEqual(["H1.json"]);
  });

  it("derives the exact texture from atlas page metadata without a texture picker", () => {
    const project = createProject();
    setStateVisual(project, "A", "normal", {
      kind: "spine",
      baseVisual: { kind: "empty", width: 160, height: 160 },
      skeletonPath: "",
      atlasPath: "",
      texturePath: "",
      animationName: "Idle",
    });
    expect(getDefaultSpineAtlasBinding(project)).toEqual({
      atlasPath: "Symbol.atlas",
      texturePath: "Symbol.png",
    });
    expect(resolveSpineAtlasBinding(project, "Symbol.atlas")).toEqual({
      atlasPath: "Symbol.atlas",
      texturePath: "Symbol.png",
    });
    applyResourceBinding(
      project,
      { kind: "spine-skeleton", symbol: "A", state: "normal" },
      "H1.json",
    );
    expect(project.symbols.get("A")?.states.get("normal")).toMatchObject({
      kind: "spine",
      skeletonPath: "H1.json",
      atlasPath: "Symbol.atlas",
      texturePath: "Symbol.png",
    });
    applyResourceBinding(
      project,
      { kind: "spine-atlas", symbol: "A", state: "normal" },
      "",
    );
    applyResourceBinding(
      project,
      { kind: "spine-atlas", symbol: "A", state: "normal" },
      "Symbol.atlas",
    );
    expect(project.symbols.get("A")?.states.get("normal")).toMatchObject({
      kind: "spine",
      atlasPath: "Symbol.atlas",
      texturePath: "Symbol.png",
    });

    uploadAssetBatch(project, [
      {
        path: "other/Symbol.atlas",
        bytes: fixture("assets/sample-skin/Symbol.atlas"),
      },
      {
        path: "other/Symbol.png",
        bytes: fixture("assets/sample-skin/Symbol.png"),
      },
    ]);
    expect(getDefaultSpineAtlasBinding(project)).toEqual({
      atlasPath: "Symbol.atlas",
      texturePath: "Symbol.png",
    });
  });

  it("confirms one atomic store transaction and rejects stale targets", () => {
    const store = new SymbolEditorStore();
    store.replace(createProject());
    const before = store.getSnapshot().revision;
    store.transact((draft) => {
      setStateVisual(draft, "A", "normal", { kind: "image", imagePath: "" });
      applyResourceBinding(
        draft,
        { kind: "state-image", symbol: "A", state: "normal" },
        "H1.png",
      );
    });
    expect(store.getSnapshot().revision).toBe(before + 1);
    expect(
      store.getSnapshot().project?.symbols.get("A")?.states.get("normal"),
    ).toEqual({ kind: "image", imagePath: "H1.png" });

    const revision = store.getSnapshot().revision;
    expect(() =>
      store.transact((draft) =>
        applyResourceBinding(
          draft,
          { kind: "state-image", symbol: "missing", state: "normal" },
          "H1.png",
        ),
      ),
    ).toThrow(/不存在/);
    expect(store.getSnapshot().revision).toBe(revision);
  });

  it("binds exact resources into a composite animation layer", () => {
    const project = createProject();
    setStateVisual(project, "A", "normal", {
      kind: "composite",
      base: "normal",
      baseVisual: { kind: "image", imagePath: "H1.png" },
      layers: [
        {
          id: "front",
          placement: "overlay",
          animation: {
            kind: "spine",
            skeletonPath: "",
            atlasPath: "",
            texturePath: "",
            animationName: "",
          },
        },
      ],
    });

    applyResourceBinding(
      project,
      {
        kind: "spine-skeleton",
        symbol: "A",
        state: "normal",
        compositeLayerIndex: 0,
      },
      "H1.json",
    );
    applyResourceBinding(
      project,
      {
        kind: "spine-atlas",
        symbol: "A",
        state: "normal",
        compositeLayerIndex: 0,
      },
      "Symbol.atlas",
    );

    expect(project.symbols.get("A")?.states.get("normal")).toMatchObject({
      kind: "composite",
      layers: [
        {
          id: "front",
          animation: {
            kind: "spine",
            skeletonPath: "H1.json",
            atlasPath: "Symbol.atlas",
            texturePath: "Symbol.png",
          },
        },
      ],
    });
  });

  it("query filtering does not mutate the project", () => {
    const project = createProject();
    const before = project.symbols.get("A")?.states.get("normal");
    expect(
      getResourcePickerCandidates(
        project,
        { kind: "state-image", symbol: "A", state: "normal" },
        "symbol.png",
      ).map(({ path }) => path),
    ).toEqual(["Symbol.png"]);
    expect(project.symbols.get("A")?.states.get("normal")).toEqual(before);
  });
});
