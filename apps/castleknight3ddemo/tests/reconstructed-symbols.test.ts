import { BackSide, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createCartoonBattleAxeSymbol,
  createCartoonCrownSymbol,
  createCartoonSpellbookSymbol,
} from "../src/reconstructed-symbols.js";

const material = new MeshBasicMaterial();
const materials = {
  wood: material,
  steel: material,
  iron: material,
  gold: material,
  leather: material,
  parchment: material,
  purple: material,
  blue: material,
  outline: new MeshBasicMaterial({ side: BackSide }),
};

describe("reconstructed board symbols", () => {
  it("keeps identity assemblies and clone-safe action metadata", () => {
    const models = [
      createCartoonBattleAxeSymbol(materials),
      createCartoonSpellbookSymbol(materials),
      createCartoonCrownSymbol(materials),
    ];
    for (const model of models) {
      const runtime = model.userData.sculptRuntime as {
        nodeIds: string[];
        clickablePartIds: string[];
      };
      expect(runtime.nodeIds.length).toBeGreaterThanOrEqual(5);
      expect(runtime.clickablePartIds).toContain("root");
      expect(model.clone(true).userData.sculptRuntime).toEqual(runtime);
    }
    expect(models[0].getObjectByName("crescent-steel-blade")).toBeTruthy();
    expect(models[1].getObjectByName("layered-parchment-pages")).toBeTruthy();
    expect(models[2].getObjectByName("five-crown-points")).toBeTruthy();
  });
});
