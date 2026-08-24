import { MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createCartoonTreasureChest,
  createRoundCastleColumn,
} from "../src/reconstructed-props.js";

describe("img2threejs reconstructed props", () => {
  it("builds a clone-safe, action-ready treasure chest", () => {
    const wood = new MeshBasicMaterial();
    const gold = new MeshBasicMaterial();
    const iron = new MeshBasicMaterial();
    const gem = new MeshBasicMaterial();
    const chest = createCartoonTreasureChest({ wood, gold, iron, gem });

    expect(chest.name).toBe("img2threejs-cartoon-treasure-chest");
    expect(chest.getObjectByName("solid-arched-lid-core")).toBeDefined();
    expect(chest.getObjectByName("faceted-purple-gem")).toBeDefined();
    expect(chest.userData.sculptRuntime.nodeIds).toEqual([
      "root",
      "body",
      "lid",
      "reinforcement",
      "lock",
    ]);
    expect(() => chest.clone(true)).not.toThrow();

    wood.dispose();
    gold.dispose();
    iron.dispose();
    gem.dispose();
  });

  it("builds a volumetric segmented round column", () => {
    const stone = new MeshBasicMaterial();
    const stoneLight = new MeshBasicMaterial();
    const stoneDark = new MeshBasicMaterial();
    const column = createRoundCastleColumn({
      stone,
      stoneLight,
      stoneDark,
    });

    expect(column.name).toBe("img2threejs-round-castle-column");
    expect(column.getObjectByName("round-stone-drum-5")).toBeDefined();
    expect(column.getObjectByName("geometric-capital-leaf")).toBeDefined();
    expect(
      column.getObjectByName("projecting-octagonal-top-slab"),
    ).toBeDefined();
    expect(column.userData.sculptRuntime.explodablePartIds).toEqual([
      "base",
      "shaft",
      "capital",
    ]);
    expect(() => column.clone(true)).not.toThrow();

    stone.dispose();
    stoneLight.dispose();
    stoneDark.dispose();
  });
});
