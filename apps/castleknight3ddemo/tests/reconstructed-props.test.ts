import { MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createCartoonCastleBench,
  createCartoonCastleWallSection,
  createCartoonOakBarrel,
  createCartoonTreasureChest,
  createCartoonWallTorch,
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

  it("builds an action-ready strapped castle bench", () => {
    const wood = new MeshBasicMaterial();
    const woodDark = new MeshBasicMaterial();
    const iron = new MeshBasicMaterial();
    const bench = createCartoonCastleBench({ wood, woodDark, iron });

    expect(bench.name).toBe("img2threejs-cartoon-castle-bench");
    expect(bench.getObjectByName("low-cross-brace")).toBeDefined();
    expect(bench.getObjectByName("domed-bench-rivet")).toBeDefined();
    expect(bench.userData.sculptRuntime.explodablePartIds).toEqual([
      "seat",
      "supports",
      "hardware",
    ]);
    expect(() => bench.clone(true)).not.toThrow();

    wood.dispose();
    woodDark.dispose();
    iron.dispose();
  });

  it("builds a lathed stave barrel with detachable hoop and lid groups", () => {
    const wood = new MeshBasicMaterial();
    const woodDark = new MeshBasicMaterial();
    const iron = new MeshBasicMaterial();
    const barrel = createCartoonOakBarrel({ wood, woodDark, iron });

    expect(barrel.name).toBe("img2threejs-cartoon-oak-barrel");
    expect(barrel.getObjectByName("lathed-bulging-barrel-body")).toBeDefined();
    expect(barrel.getObjectByName("hammered-iron-hoop-3")).toBeDefined();
    expect(barrel.userData.sculptRuntime.nodeIds).toEqual([
      "root",
      "shell",
      "hoops",
      "top",
    ]);
    expect(() => barrel.clone(true)).not.toThrow();

    wood.dispose();
    woodDark.dispose();
    iron.dispose();
  });

  it("builds an instanced masonry wall section with an engaged pilaster", () => {
    const stone = new MeshBasicMaterial();
    const stoneLight = new MeshBasicMaterial();
    const stoneDark = new MeshBasicMaterial();
    const mortar = new MeshBasicMaterial();
    const wall = createCartoonCastleWallSection({
      stone,
      stoneLight,
      stoneDark,
      mortar,
    });

    expect(wall.name).toBe("img2threejs-cartoon-castle-wall-section");
    expect(wall.getObjectByName("instanced-cut-stone-courses")).toBeDefined();
    expect(wall.getObjectByName("engaged-pilaster-drum-5")).toBeDefined();
    expect(wall.getObjectByName("wall-cornice-course-3")).toBeDefined();
    expect(() => wall.clone(true)).not.toThrow();

    stone.dispose();
    stoneLight.dispose();
    stoneDark.dispose();
    mortar.dispose();
  });

  it("builds a wall torch with a stable runtime flame socket", () => {
    const iron = new MeshBasicMaterial();
    const ironLight = new MeshBasicMaterial();
    const gold = new MeshBasicMaterial();
    const torch = createCartoonWallTorch({ iron, ironLight, gold });

    expect(torch.name).toBe("img2threejs-cartoon-wall-torch");
    expect(torch.getObjectByName("curved-projecting-iron-arm")).toBeDefined();
    expect(torch.getObjectByName("flame-socket")).toBeDefined();
    expect(torch.userData.flameSocketName).toBe("flame-socket");
    expect(torch.userData.sculptRuntime.explodablePartIds).toEqual([
      "backplate",
      "bracket",
      "brazier",
      "flameSocket",
    ]);
    expect(() => torch.clone(true)).not.toThrow();

    iron.dispose();
    ironLight.dispose();
    gold.dispose();
  });
});
