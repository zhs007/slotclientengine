import { describe, expect, it } from "vitest";
import {
  createFromGameConfig,
  exportSnapshot,
  getGameConfigSymbols,
  replaceUploadedFiles,
  setSymbolNormal,
  setSymbolIncluded,
  setTextureStates,
  setValuePresentationField,
} from "../src/model/editor-project.js";
import { SymbolEditorStore } from "../src/model/editor-store.js";

const gameConfig = {
  paytable: {
    "2": { code: 2, symbol: "B", pays: [1] },
    "1": { code: 1, symbol: "A", pays: [1] },
  },
  symbolCodes: { B: 2, A: 1 },
  reels: { main: [[1, 2]] },
};

describe("symbol editor project", () => {
  it("creates code-ordered defaults and supports explicit exclusion", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "My Game.json",
    });
    expect(project.id).toBe("my-game");
    expect(project.cellSize).toEqual({ width: 160, height: 160 });
    expect(getGameConfigSymbols(project).map(({ symbol }) => symbol)).toEqual([
      "A",
      "B",
    ]);
    setSymbolIncluded(project, "B", false);
    expect(project.includedSymbols.has("B")).toBe(false);
  });

  it("keeps unknown uploads unmapped and refuses incomplete export", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "fixture.json",
    });
    replaceUploadedFiles(project, [
      { name: "A.png", bytes: new Uint8Array([1]) },
      { name: "unknown.png", bytes: new Uint8Array([2]) },
    ]);
    expect(project.assets.has("A.png")).toBe(true);
    expect(project.unmappedFiles.has("unknown.png")).toBe(true);
    expect(() => exportSnapshot(project)).toThrow(/资源闭包/);
  });

  it("edits layered normal, texture states and value fields structurally", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "fixture.json",
    });
    setSymbolNormal(project, "A", {
      kind: "layered",
      layers: [
        {
          index: 0,
          texture: "./A-0.png",
          keyframes: ["./A-0.png", "./A-0-1.png"],
        },
      ],
    });
    setTextureStates(project, ["disabled"]);
    const symbols = project.manifestDraft.symbols as Record<
      string,
      Record<string, unknown>
    >;
    expect(symbols.A.normal).toEqual({
      kind: "layered",
      layers: [
        {
          index: 0,
          texture: "./A-0.png",
          keyframes: ["./A-0.png", "./A-0-1.png"],
        },
      ],
    });
    expect(symbols.A.spinBlur).toBe(undefined);

    symbols.A = {
      scale: 1,
      valuePresentation: {
        defaultValues: [1],
        reelStates: {
          normal: { kind: "transparent", width: 10, height: 10 },
          disabled: "./A.disabled.png",
        },
        tiers: [
          {
            animation: {
              kind: "spine",
              skeleton: "./A.json",
              atlas: "./A.atlas",
              texture: "./A.png",
              playback: {
                mode: "animation",
                animationName: "Loop",
                loop: true,
              },
            },
          },
        ],
        text: {
          type: "image",
          slot: "Num",
          x: 0,
          y: 0,
          prefix: "./values/",
        },
      },
    };
    setValuePresentationField(
      project,
      "A",
      "tiers.0.animation.transform.scale",
      0.8,
    );
    expect(
      (
        (
          (symbols.A.valuePresentation as Record<string, unknown>)
            .tiers as Record<string, unknown>[]
        )[0].animation as Record<string, unknown>
      ).transform,
    ).toEqual({ scale: 0.8 });
  });

  it("keeps store transactions atomic when an update throws", () => {
    const store = new SymbolEditorStore();
    store.replace(
      createFromGameConfig({
        rawGameConfig: gameConfig,
        fileName: "fixture.json",
      }),
    );
    const before = store.getSnapshot();
    expect(() =>
      store.transact((draft) => {
        draft.cellSize.width = 12;
        throw new Error("stop");
      }),
    ).toThrow("stop");
    const after = store.getSnapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.project?.cellSize.width).toBe(160);
  });
});
