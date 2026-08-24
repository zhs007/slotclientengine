import { MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createCartoonCastleChandelier,
  createCartoonCastleThrone,
  createCartoonThroneDais,
} from "../src/reconstructed-furnishings.js";

const stone = new MeshBasicMaterial();
const stoneDark = new MeshBasicMaterial();
const gold = new MeshBasicMaterial();
const wood = new MeshBasicMaterial();
const woodDark = new MeshBasicMaterial();
const leather = new MeshBasicMaterial();
const gem = new MeshBasicMaterial();
const iron = new MeshBasicMaterial();
const ironLight = new MeshBasicMaterial();
const candle = new MeshBasicMaterial();

describe("reconstructed throne-room furnishings", () => {
  it("builds clone-safe action-ready stair and throne hierarchies", () => {
    const stair = createCartoonThroneDais({ stone, stoneDark, gold });
    const throne = createCartoonCastleThrone({
      wood,
      woodDark,
      leather,
      gold,
      gem,
    });
    for (const model of [stair, throne]) {
      const runtime = model.userData.sculptRuntime as {
        nodeIds: string[];
        explodablePartIds: string[];
      };
      expect(runtime.nodeIds.length).toBeGreaterThanOrEqual(5);
      expect(runtime.explodablePartIds).not.toContain("root");
      expect(model.clone(true).userData.sculptRuntime).toEqual(runtime);
    }
    expect(stair.getObjectByName("gold-heraldic-inlays")).toBeTruthy();
    expect(throne.getObjectByName("crimson-upholstery")).toBeTruthy();
  });

  it("provides eight stable runtime flame sockets on the chandelier", () => {
    const chandelier = createCartoonCastleChandelier({
      iron,
      ironLight,
      gold,
      candle,
      gem,
    });
    for (let index = 1; index <= 8; index += 1)
      expect(chandelier.getObjectByName(`flame-socket-${index}`)).toBeTruthy();
    expect(chandelier.userData.sculptRuntime.nodeIds).toContain("chains");
    expect(
      chandelier.clone(true).getObjectByName("flame-socket-8"),
    ).toBeTruthy();
  });
});
