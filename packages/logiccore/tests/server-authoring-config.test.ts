import { describe, expect, it } from "vitest";
import {
  getServerBetMethodComponentCatalog,
  parseServerGameAuthoringSummary,
  suggestSlotRoundFlow,
} from "../src";

function fixture() {
  return {
    gameName: "sample",
    gamecode: "game-code",
    parameter: [
      { name: "Width", value: 6 },
      { name: "Height", value: 9 },
    ],
    repository: {
      "secret-server-reels": [["must", "not", "escape"]],
    },
    betMethod: [
      {
        label: "normal",
        bet: 30,
        totalBetInWins: 30,
        graph: {
          cells: [
            { shape: "edge", id: "edge", repository: "ignored" },
            {
              shape: "custom-node",
              id: "spin-node",
              label: "BasicReels2",
              data: {
                label: "component-spin",
                configuration: { reelSet: "server-private-reels" },
                controller: { ignored: true },
              },
            },
            {
              shape: "custom-node",
              id: "win-node",
              label: "ClusterTrigger",
              data: { label: "component-win", configuration: {} },
            },
            {
              shape: "custom-node",
              id: "remove-node",
              label: "RemoveSymbols",
              data: {
                label: "component-remove",
                configuration: {
                  emptySymbolVal: -1,
                  ignoreSymbols: ["sticky"],
                },
              },
            },
            {
              shape: "custom-node",
              id: "drop-node",
              label: "DropDownSymbols2",
              data: {
                label: "component-dropdown",
                configuration: { holdSymbols: ["sticky"] },
              },
            },
            {
              shape: "custom-node",
              id: "refill-node",
              label: "RefillSymbols2",
              data: { label: "component-refill", configuration: {} },
            },
            {
              shape: "custom-node",
              id: "future-node",
              label: "FutureFeature",
              data: { label: "component-future", configuration: {} },
            },
          ],
        },
      },
    ],
  };
}

describe("server authoring summary", () => {
  it("extracts a per-bet catalog without repository or graph execution data", () => {
    const summary = parseServerGameAuthoringSummary(fixture());
    const catalog = getServerBetMethodComponentCatalog(summary, "normal");
    expect(
      catalog.components.map(({ nodeType, componentName, role }) => ({
        nodeType,
        componentName,
        role,
      })),
    ).toEqual([
      {
        nodeType: "BasicReels2",
        componentName: "component-spin",
        role: "spin",
      },
      {
        nodeType: "ClusterTrigger",
        componentName: "component-win",
        role: "win",
      },
      {
        nodeType: "RemoveSymbols",
        componentName: "component-remove",
        role: "cascade-remove",
      },
      {
        nodeType: "DropDownSymbols2",
        componentName: "component-dropdown",
        role: "cascade-dropdown",
      },
      {
        nodeType: "RefillSymbols2",
        componentName: "component-refill",
        role: "cascade-refill",
      },
      {
        nodeType: "FutureFeature",
        componentName: "component-future",
        role: "unsupported",
      },
    ]);
    expect(JSON.stringify(summary)).not.toContain("secret-server-reels");
    expect(JSON.stringify(summary)).not.toContain("controller");
  });

  it("generates review-only suggestions and never chooses a reel kind", () => {
    const catalog = getServerBetMethodComponentCatalog(
      parseServerGameAuthoringSummary(fixture()),
      "normal",
    );
    const suggestion = suggestSlotRoundFlow(catalog);
    expect(suggestion.requiresReview).toBe(true);
    expect(suggestion.components.spin).toBe("component-spin");
    expect(suggestion.components.wins).toEqual(["component-win"]);
    expect(suggestion.cascade).toMatchObject({
      remove: "component-remove",
      dropdown: "component-dropdown",
      refill: "component-refill",
      emptyCode: -1,
      removeExcludedSymbols: ["sticky"],
      dropHeldSymbols: ["sticky"],
    });
    expect(suggestion).not.toHaveProperty("reel");
  });

  it("rejects duplicate component names within one bet method", () => {
    const value = fixture();
    value.betMethod[0].graph.cells.push({
      shape: "custom-node",
      id: "duplicate",
      label: "ClusterTrigger",
      data: { label: "component-win", configuration: {} },
    });
    expect(() => parseServerGameAuthoringSummary(value)).toThrow(
      /duplicate component name/,
    );
  });
});
