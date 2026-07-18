import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const gameConfig = {
  paytable: { "1": { code: 1, symbol: "A", pays: [1] } },
  symbolCodes: { A: 1 },
  reels: { main: [[1]] },
};

const fixture = (path: string) =>
  new Uint8Array(readFileSync(resolve(process.cwd(), `../../${path}`)));

function createProject() {
  const project = createFromGameConfig({
    rawGameConfig: gameConfig,
    fileName: "picker.json",
  });
  uploadAssetBatch(project, [
    { path: "art/H1.png", bytes: fixture("assets/game003-s1/H1.png") },
    {
      path: "spine/H1.json",
      bytes: fixture("assets/game003-s1/H1.json"),
    },
    {
      path: "spine/Symbol.atlas",
      bytes: fixture("assets/game003-s1/Symbol.atlas"),
    },
    {
      path: "spine/Symbol.png",
      bytes: fixture("assets/game003-s1/Symbol.png"),
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
      "art/H1.png",
      "broken.png",
      "spine/Symbol.png",
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
    ).toEqual(["spine/H1.json"]);
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
      atlasPath: "spine/Symbol.atlas",
      texturePath: "spine/Symbol.png",
    });
    expect(resolveSpineAtlasBinding(project, "spine/Symbol.atlas")).toEqual({
      atlasPath: "spine/Symbol.atlas",
      texturePath: "spine/Symbol.png",
    });
    applyResourceBinding(
      project,
      { kind: "spine-skeleton", symbol: "A", state: "normal" },
      "spine/H1.json",
    );
    expect(project.symbols.get("A")?.states.get("normal")).toMatchObject({
      kind: "spine",
      skeletonPath: "spine/H1.json",
      atlasPath: "spine/Symbol.atlas",
      texturePath: "spine/Symbol.png",
    });
    applyResourceBinding(
      project,
      { kind: "spine-atlas", symbol: "A", state: "normal" },
      "",
    );
    applyResourceBinding(
      project,
      { kind: "spine-atlas", symbol: "A", state: "normal" },
      "spine/Symbol.atlas",
    );
    expect(project.symbols.get("A")?.states.get("normal")).toMatchObject({
      kind: "spine",
      atlasPath: "spine/Symbol.atlas",
      texturePath: "spine/Symbol.png",
    });

    uploadAssetBatch(project, [
      {
        path: "other/Symbol.atlas",
        bytes: fixture("assets/game003-s1/Symbol.atlas"),
      },
      {
        path: "other/Symbol.png",
        bytes: fixture("assets/game003-s1/Symbol.png"),
      },
    ]);
    expect(getDefaultSpineAtlasBinding(project)).toBeNull();
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
        "art/H1.png",
      );
    });
    expect(store.getSnapshot().revision).toBe(before + 1);
    expect(
      store.getSnapshot().project?.symbols.get("A")?.states.get("normal"),
    ).toEqual({ kind: "image", imagePath: "art/H1.png" });

    const revision = store.getSnapshot().revision;
    expect(() =>
      store.transact((draft) =>
        applyResourceBinding(
          draft,
          { kind: "state-image", symbol: "missing", state: "normal" },
          "art/H1.png",
        ),
      ),
    ).toThrow(/不存在/);
    expect(store.getSnapshot().revision).toBe(revision);
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
    ).toEqual(["spine/Symbol.png"]);
    expect(project.symbols.get("A")?.states.get("normal")).toEqual(before);
  });
});
