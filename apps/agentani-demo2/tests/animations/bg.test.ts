import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BG_DURATION,
  BG_LAYER_SPECS,
  bgAnimation,
  getUniqueBgAssetCount,
} from "../../src/animations/pixi/bg.js";

const appRoot = path.resolve(__dirname, "../..");

describe("bg Pixi animation module", () => {
  it("exports module metadata and a create function", () => {
    expect(bgAnimation.id).toBe("bg");
    expect(bgAnimation.label).toBe("bg");
    expect(bgAnimation.duration).toBe(3);
    expect(bgAnimation.create).toEqual(expect.any(Function));
  });

  it("covers the 15 source layer slices without using 15 asset files", () => {
    expect(BG_LAYER_SPECS).toHaveLength(15);
    expect(BG_LAYER_SPECS.map((layer) => layer.sourceIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(getUniqueBgAssetCount()).toBe(9);
    expect(readdirSync(path.join(appRoot, "src/assets/bg")).sort()).toEqual([
      "layer-00.png",
      "layer-01.png",
      "layer-02.png",
      "layer-03.png",
      "layer-04.png",
      "layer-05.png",
      "layer-06.png",
      "layer-07.png",
      "layer-08.png",
    ]);
  });

  it("binds the sweep light to the invisible copy mask and uses add blending for light layers", () => {
    const sweep = BG_LAYER_SPECS.find((layer) => layer.id === "刷光");
    expect(sweep).toMatchObject({
      maskId: "隐形框_copy_7",
      blendMode: "add",
      effects: ["sweepLight"],
    });

    const addLayers = BG_LAYER_SPECS.filter(
      (layer) => layer.blendMode === "add",
    ).map((layer) => layer.id);
    expect(addLayers).toEqual([
      "刷光",
      "光球",
      "光_copy_9",
      "光",
      "底光_copy_8",
      "底光",
    ]);
  });

  it("treats animated slices as hidden outside their edited time windows", () => {
    const staticLayer = BG_LAYER_SPECS.find((layer) => layer.id === "底2");
    const baseFade = BG_LAYER_SPECS.find((layer) => layer.id === "底1");
    const light = BG_LAYER_SPECS.find((layer) => layer.id === "光");

    expect(staticLayer).toMatchObject({
      visibleFrom: 0,
      visibleTo: BG_DURATION,
      effects: [],
    });
    expect(baseFade).toMatchObject({ visibleFrom: 0, visibleTo: 1.5 });
    expect(light).toMatchObject({ visibleFrom: 0.5, visibleTo: 1.7 });
  });

  it("reuses the same asset URL for duplicate image content", () => {
    const byId = new Map(BG_LAYER_SPECS.map((layer) => [layer.id, layer]));
    expect(byId.get("隐形框")?.assetUrl).toBe(
      byId.get("隐形框_copy_7")?.assetUrl,
    );
    expect(byId.get("光")?.assetUrl).toBe(byId.get("光_copy_9")?.assetUrl);
    expect(byId.get("底光")?.assetUrl).toBe(byId.get("底光_copy_8")?.assetUrl);
    expect(byId.get("Layer_003")?.assetUrl).toBe(
      byId.get("Layer_003_copy_4_copy_6")?.assetUrl,
    );
  });

  it("keeps mirrored negative scale values available for replay reset", () => {
    expect(
      BG_LAYER_SPECS.find((layer) => layer.id === "光_copy_9")?.scaleX,
    ).toBeLessThan(0);
    expect(
      BG_LAYER_SPECS.find((layer) => layer.id === "底光_copy_8")?.scaleX,
    ).toBeLessThan(0);
    expect(
      BG_LAYER_SPECS.find((layer) => layer.id === "Layer_003_copy_4")?.scaleX,
    ).toBeLessThan(0);
  });

  it("keeps all bg effect behavior explicit in bg.ts", () => {
    const source = readFileSync(
      path.join(appRoot, "src/animations/pixi/bg.ts"),
      "utf8",
    );
    for (const functionName of [
      "fadeIn",
      "fadeOut",
      "pulse",
      "starlight",
      "sweepLight",
      "swing",
    ]) {
      expect(source).toContain(`function ${functionName}`);
    }
  });
});
