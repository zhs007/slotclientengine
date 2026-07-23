import { describe, expect, it } from "vitest";
import {
  parseServerGameAuthoringSummary,
  parseSlotRoundFlowProfile,
  validateSlotRoundFlowCatalogCompatibility,
} from "../src";

const base = {
  kind: "slot-round-flow",
  version: 1,
  components: {
    spin: "spin-component",
    wins: ["win-component"],
    valueUpdates: ["value-component"],
  },
  amount: {
    cashFields: ["cashWin64", "cashWin"],
    coinFields: ["coinWin64", "coinWin"],
    cashUnit: "cents",
  },
};

describe("slot round flow profile", () => {
  it("keeps reel presentation independent and recursively freezes output", () => {
    const profile = parseSlotRoundFlowProfile({
      ...base,
      cascade: {
        kind: "cascade",
        version: 1,
        components: {
          remove: "remove-component",
          dropdown: "dropdown-component",
          refill: "refill-component",
          stepMarker: "step-component",
        },
        symbols: {
          emptyCode: -1,
          removeExcludedSymbols: ["sticky"],
          dropHeldSymbols: [],
          valueSymbols: ["value"],
          sequentialWinCompanionSymbols: [],
        },
        amount: {
          cashFields: ["cashWin64", "cashWin"],
          coinFields: ["coinWin64", "coinWin"],
          cashUnit: "cents",
        },
      },
    });
    expect(profile.cascade?.symbols.emptyCode).toBe(-1);
    expect(profile).not.toHaveProperty("reel");
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.cascade?.symbols)).toBe(true);
  });

  it("rejects unknown fields, aliases, duplicate roles and invalid amount policy", () => {
    expect(() =>
      parseSlotRoundFlowProfile({ ...base, reelKind: "grid-cell" }),
    ).toThrow(/reelKind is not supported/);
    expect(() =>
      parseSlotRoundFlowProfile({
        ...base,
        components: {
          spin: "spin-component",
          wins: ["spin-component"],
        },
      }),
    ).toThrow(/roles must be unique/);
    expect(() =>
      parseSlotRoundFlowProfile({
        ...base,
        amount: { cashFields: [], cashUnit: "cents" },
      }),
    ).toThrow(/cashFields must not be empty/);
  });

  it("validates explicit catalog role compatibility", () => {
    const summary = parseServerGameAuthoringSummary({
      gameName: "sample",
      gamecode: "code",
      parameter: [],
      betMethod: [
        {
          label: "normal",
          bet: 1,
          totalBetInWins: 1,
          graph: {
            cells: [
              {
                shape: "custom-node",
                id: "spin",
                label: "BasicReels2",
                data: { label: "spin-component" },
              },
              {
                shape: "custom-node",
                id: "win",
                label: "ClusterTrigger",
                data: { label: "win-component" },
              },
              {
                shape: "custom-node",
                id: "value",
                label: "GenSymbolVals2",
                data: { label: "value-component" },
              },
            ],
          },
        },
      ],
    });
    const profile = parseSlotRoundFlowProfile(base);
    expect(() =>
      validateSlotRoundFlowCatalogCompatibility({
        profile,
        catalog: summary.betMethods[0],
      }),
    ).not.toThrow();
    const wrong = parseSlotRoundFlowProfile({
      ...base,
      components: { spin: "win-component", wins: [] },
    });
    expect(() =>
      validateSlotRoundFlowCatalogCompatibility({
        profile: wrong,
        catalog: summary.betMethods[0],
      }),
    ).toThrow(/incompatible server node type/);
  });
});
